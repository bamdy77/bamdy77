// Turns a photo of a signature or a school stamp on plain paper into a
// tightly-cropped, transparent PNG - so when it's placed on the Parent
// Report PDF it looks like real ink sitting directly on the page (clear,
// full-size, no grey haze) instead of a small, washed-out photo pasted on
// top of a background box.
//
// Runs entirely ON THE DEVICE (Canvas pixel processing, no server cost, no
// external model/CDN needed).
//
// THREE THINGS A NAIVE "WHITE = TRANSPARENT" RULE DOESN'T HANDLE, WHICH
// THIS IS SPECIFICALLY BUILT FOR:
//
//  1. UNEVEN LIGHTING ACROSS THE PHOTO. A phone photo of a page is almost
//     never evenly lit corner-to-corner. Comparing every pixel to ONE
//     single "paper colour" sampled from the corners fails on a page with
//     a lighting gradient. FIX: the photo is divided into a coarse grid, a
//     LOCAL paper colour is estimated per cell (the lightest, most common
//     colour in that cell), and those estimates are smoothly interpolated
//     into a full-size "expected paper colour" map - every pixel is
//     compared against its OWN local expected colour.
//
//  2. THE SIGNATURE/STAMP IS A SMALL PART OF A LARGER PHOTO. The person
//     leaves margin around the ink so there's paper to sample, so most of
//     the photo is blank space. FIX: after the background is made
//     transparent, the image is CROPPED to the tight bounding box of the
//     remaining ink (plus a small margin).
//
//  3. A SPECIFIC PHOTO CAN DEFEAT THE MAIN METHOD ENTIRELY (very low
//     contrast, an unusual capture, a browser quirk decoding the file).
//     FIX: the result of the main (grid-based) pass is sanity-checked - if
//     it found either nothing or almost the WHOLE photo as "ink" (a sign
//     the per-cell background estimate broke down rather than a real
//     result), a second, simpler, single-global-background pass is tried
//     as a fallback before giving up. removePaperBackground() reports
//     back HOW it went (see its own comment) so the caller can tell the
//     person honestly instead of silently uploading an unprocessed photo.
//
// The original ink colour is left completely untouched - only the alpha
// channel changes, so a red stamp still prints red, blue ink still prints
// blue.

const MAX_DIMENSION = 1400; // px, long edge - kept generous since the image is cropped tight afterwards anyway

// Local-background grid: the photo is divided into roughly GRID x GRID
// cells for lighting-gradient compensation.
const GRID_CELLS = 10;
const BG_PERCENTILE = 0.85; // within a cell, the Nth-brightest pixels are assumed to be paper

const PAPER_CUTOFF = 26;
const INK_CUTOFF = 68;

// Simpler fallback pass (single global background colour, sampled from the
// four corners) used only if the main grid-based pass looks like it failed
// - see isDegenerateResult() below.
const FALLBACK_PAPER_CUTOFF = 30;
const FALLBACK_INK_CUTOFF = 85;

// Raised from a much lower value after real-world testing showed low-
// contrast photos (dim lighting, a faint/worn pen or stamp pad) leaving a
// faint haze across almost the WHOLE photo at a weak-but-nonzero alpha -
// with too low a threshold here, that haze reads as "content" everywhere,
// so cropToContent finds one giant blob covering nearly the entire photo
// instead of just the real ink. Requiring a more confident alpha before
// something counts as content (combined with the contrast boost below)
// fixes that.
const TRIM_ALPHA_THRESHOLD = 70;
const TRIM_PADDING_PX = 6;

// Below this brightness spread (98th percentile minus 2nd percentile), a
// photo is considered already high-contrast enough and is left alone -
// stretching contrast on a photo that's already crisp risks amplifying
// JPEG noise instead of helping.
const MIN_CONTRAST_SPREAD = 15;

// ── Decoding: two paths, since createImageBitmap (fast, preferred) is not
// equally reliable across every phone browser/image format. If it throws
// or the browser doesn't have it, this falls back to a plain <img> decode,
// which handles more real-world quirks (odd EXIF orientation, unusual JPEG
// variants) even though it's a little slower. ──
async function decodeToDrawable(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      try { return await createImageBitmap(file); } catch { /* fall through to <img> path */ }
    }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not decode image")); };
    img.src = url;
  });
}

async function fileToCanvas(file, maxDim) {
  const drawable = await decodeToDrawable(file);
  let width = drawable.width, height = drawable.height;
  if (!width || !height) throw new Error("Decoded image has no size");
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(drawable, 0, 0, width, height);
  drawable.close?.();
  return canvas;
}

function percentile(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))));
  return s[idx];
}

// Boosts weak contrast BEFORE either background-removal pass runs - a photo
// taken in dim light, or of a faint pencil/worn stamp pad, can have such a
// small brightness gap between "ink" and "paper" that neither pass can
// cleanly tell them apart (the whole photo ends up a uniform-ish haze
// instead of two distinct groups). This stretches the photo's OWN 2nd-98th
// percentile brightness range out to the full 0-255 range - amplifying
// whatever real difference exists between ink and paper, however small it
// started out. Skipped entirely on a photo that's already high-contrast
// (see MIN_CONTRAST_SPREAD), so a crisp photo isn't touched at all.
function applyAutoContrast(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;

  // Sampling every 4th pixel keeps this fast on a 1400px-long photo while
  // still giving a statistically solid read on the brightness spread.
  const sample = [];
  for (let i = 0; i < d.length; i += 16) sample.push((d[i] + d[i + 1] + d[i + 2]) / 3);
  const lo = percentile(sample, 0.02);
  const hi = percentile(sample, 0.98);
  if (hi - lo < MIN_CONTRAST_SPREAD) return; // already high-contrast enough - leave it alone

  const scale = 255 / (hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.max(0, Math.min(255, Math.round((d[i] - lo) * scale)));
    d[i + 1] = Math.max(0, Math.min(255, Math.round((d[i + 1] - lo) * scale)));
    d[i + 2] = Math.max(0, Math.min(255, Math.round((d[i + 2] - lo) * scale)));
  }
  ctx.putImageData(imgData, 0, 0);
}

// Builds a full-resolution "expected local paper colour" map by estimating
// a background colour per grid cell, then bilinearly interpolating between
// cell centres so the estimate changes smoothly across the image.
function buildLocalBackgroundMap(d, width, height) {
  const cols = Math.max(2, Math.min(GRID_CELLS, Math.floor(width / 24)));
  const rows = Math.max(2, Math.min(GRID_CELLS, Math.floor(height / 24)));
  const cellW = width / cols, cellH = height / rows;
  const cellBg = new Array(cols * rows);

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x0 = Math.floor(cx * cellW), x1 = Math.floor((cx + 1) * cellW);
      const y0 = Math.floor(cy * cellH), y1 = Math.floor((cy + 1) * cellH);
      const rs = [], gs = [], bs = [], brightness = [];
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = (y * width + x) * 4;
          const r = d[idx], g = d[idx + 1], b = d[idx + 2];
          rs.push(r); gs.push(g); bs.push(b);
          brightness.push((r + g + b) / 3);
        }
      }
      const target = percentile(brightness, BG_PERCENTILE);
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let i = 0; i < brightness.length; i++) {
        if (Math.abs(brightness[i] - target) <= 12) { sr += rs[i]; sg += gs[i]; sb += bs[i]; n++; }
      }
      cellBg[cy * cols + cx] = n ? [sr / n, sg / n, sb / n] : [target, target, target];
    }
  }

  const map = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const fy = Math.min(rows - 1e-6, Math.max(0, (y + 0.5) / cellH - 0.5));
    const cy0 = Math.max(0, Math.min(rows - 1, Math.floor(fy)));
    const cy1 = Math.min(rows - 1, cy0 + 1);
    const ty = fy - cy0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(cols - 1e-6, Math.max(0, (x + 0.5) / cellW - 0.5));
      const cx0 = Math.max(0, Math.min(cols - 1, Math.floor(fx)));
      const cx1 = Math.min(cols - 1, cx0 + 1);
      const tx = fx - cx0;
      const c00 = cellBg[cy0 * cols + cx0], c10 = cellBg[cy0 * cols + cx1];
      const c01 = cellBg[cy1 * cols + cx0], c11 = cellBg[cy1 * cols + cx1];
      const idx = (y * width + x) * 3;
      for (let ch = 0; ch < 3; ch++) {
        const top = c00[ch] * (1 - tx) + c10[ch] * tx;
        const bot = c01[ch] * (1 - tx) + c11[ch] * tx;
        map[idx + ch] = top * (1 - ty) + bot * ty;
      }
    }
  }
  return map;
}

function applyAlphaFromDistance(d, distFn, paperCutoff, inkCutoff) {
  let opaqueCount = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const dist = distFn(i, p);
    let alpha;
    if (dist <= paperCutoff) alpha = 0;
    else if (dist >= inkCutoff) alpha = 255;
    else alpha = Math.round(255 * (dist - paperCutoff) / (inkCutoff - paperCutoff));
    d[i + 3] = Math.min(d[i + 3], alpha);
    if (d[i + 3] > TRIM_ALPHA_THRESHOLD) opaqueCount++;
  }
  return opaqueCount;
}

// Main pass: local grid-based background removal (see file header). Mutates
// the canvas in place. Returns the fraction of pixels left opaque (used to
// sanity-check whether this pass actually worked - see isDegenerateResult).
function stripPaperBackgroundLocal(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;
  const bgMap = buildLocalBackgroundMap(d, width, height);
  const opaqueCount = applyAlphaFromDistance(
    d,
    (i, p) => {
      const m = p * 3;
      const dr = d[i] - bgMap[m], dg = d[i + 1] - bgMap[m + 1], db = d[i + 2] - bgMap[m + 2];
      return Math.sqrt(dr * dr + dg * dg + db * db);
    },
    PAPER_CUTOFF, INK_CUTOFF
  );
  ctx.putImageData(imgData, 0, 0);
  return opaqueCount / (width * height);
}

// Fallback pass: a single global background colour sampled from the four
// corners (simpler, more conservative - used only when the local pass
// above looks like it failed on this particular photo).
function stripPaperBackgroundGlobal(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;

  const patch = Math.max(10, Math.round(Math.min(width, height) * 0.09));
  const corners = [[0, 0], [width - patch, 0], [0, height - patch], [width - patch, height - patch]];
  const rs = [], gs = [], bs = [];
  corners.forEach(([sx, sy]) => {
    for (let y = Math.max(0, sy); y < Math.min(height, sy + patch); y++) {
      for (let x = Math.max(0, sx); x < Math.min(width, sx + patch); x++) {
        const idx = (y * width + x) * 4;
        rs.push(d[idx]); gs.push(d[idx + 1]); bs.push(d[idx + 2]);
      }
    }
  });
  const med = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const bg = [med(rs), med(gs), med(bs)];

  const opaqueCount = applyAlphaFromDistance(
    d,
    (i) => {
      const dr = d[i] - bg[0], dg = d[i + 1] - bg[1], db = d[i + 2] - bg[2];
      return Math.sqrt(dr * dr + dg * dg + db * db);
    },
    FALLBACK_PAPER_CUTOFF, FALLBACK_INK_CUTOFF
  );
  ctx.putImageData(imgData, 0, 0);
  return opaqueCount / (width * height);
}

// A result is "degenerate" (the pass likely failed rather than genuinely
// finding this much ink) if it kept almost NOTHING or almost EVERYTHING
// opaque - a real signature/stamp photo, even a generous one, should land
// well inside that range.
function isDegenerateResult(opaqueFraction) {
  return opaqueFraction < 0.002 || opaqueFraction > 0.85;
}

function cropToContent(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;

  // Group opaque pixels into CONNECTED clusters (8-connectivity, i.e.
  // touching or diagonally-touching pixels belong to the same cluster,
  // with clusters that are merely CLOSE to each other also merged - see
  // MERGE_DISTANCE_PX below), instead of just taking the overall min/max
  // position of every opaque pixel anywhere in the photo.
  //
  // Why this matters: a stray dark speck ANYWHERE in the photo (a shadow,
  // a smudge, a bit of pen resting in-frame) that survives the background
  // pass, even a tiny one far from the real signature, would otherwise
  // stretch the crop box out to cover the empty space between it and the
  // actual ink - shrinking the real signature down inside a mostly-blank
  // crop instead of filling its frame. This finds the main cluster of ink
  // (merging nearby strokes of the same signature, which naturally have
  // small gaps - dotted i's, disconnected cursive strokes) and discards
  // anything not part of it.
  const width_ = width, height_ = height;
  const labels = new Int32Array(width_ * height_).fill(-1);
  const stack = new Int32Array(width_ * height_);
  const boxes = []; // { minX, minY, maxX, maxY, count }

  const isOpaque = (idx) => d[idx * 4 + 3] >= TRIM_ALPHA_THRESHOLD;

  let nextLabel = 0;
  for (let start = 0; start < width_ * height_; start++) {
    if (labels[start] !== -1 || !isOpaque(start)) continue;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = nextLabel;
    let minX = width_, minY = height_, maxX = -1, maxY = -1, count = 0;
    while (sp > 0) {
      const idx = stack[--sp];
      const x = idx % width_, y = (idx / width_) | 0;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width_ || ny >= height_) continue;
          const nidx = ny * width_ + nx;
          if (labels[nidx] === -1 && isOpaque(nidx)) { labels[nidx] = nextLabel; stack[sp++] = nidx; }
        }
      }
    }
    boxes.push({ label: nextLabel, minX, minY, maxX, maxY, count });
    nextLabel++;
  }
  if (!boxes.length) return null; // nothing found

  // Start from the LARGEST cluster (almost certainly the real signature/
  // stamp) and repeatedly absorb any other cluster within MERGE_DISTANCE_PX
  // of the growing merged box - so a signature made of several separate
  // strokes is kept whole, while a distant, unrelated speck is left out.
  const MERGE_DISTANCE_PX = 45;
  const bboxDistance = (a, b) => {
    const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX, 0);
    const dy = Math.max(a.minY - b.maxY, b.minY - a.maxY, 0);
    return Math.sqrt(dx * dx + dy * dy);
  };

  const sorted = [...boxes].sort((a, b) => b.count - a.count);
  const kept = new Set([sorted[0].label]);
  let merged = { minX: sorted[0].minX, minY: sorted[0].minY, maxX: sorted[0].maxX, maxY: sorted[0].maxY };
  let remaining = sorted.slice(1);
  let changed = true;
  while (changed) {
    changed = false;
    remaining = remaining.filter((b) => {
      if (bboxDistance(merged, b) <= MERGE_DISTANCE_PX) {
        kept.add(b.label);
        merged = {
          minX: Math.min(merged.minX, b.minX), minY: Math.min(merged.minY, b.minY),
          maxX: Math.max(merged.maxX, b.maxX), maxY: Math.max(merged.maxY, b.maxY),
        };
        changed = true;
        return false;
      }
      return true;
    });
  }

  // Clear out anything that wasn't kept - a discarded speck must not
  // remain visible (even faintly) in the final cropped image.
  if (remaining.length) {
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] !== -1 && !kept.has(labels[i])) d[i * 4 + 3] = 0;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const minX = Math.max(0, merged.minX - TRIM_PADDING_PX);
  const minY = Math.max(0, merged.minY - TRIM_PADDING_PX);
  const maxX = Math.min(width - 1, merged.maxX + TRIM_PADDING_PX);
  const maxY = Math.min(height - 1, merged.maxY + TRIM_PADDING_PX);
  const cropW = maxX - minX + 1, cropH = maxY - minY + 1;

  const cropped = document.createElement("canvas");
  cropped.width = cropW;
  cropped.height = cropH;
  cropped.getContext("2d").drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  return cropped;
}

// Takes a File (a photo/scan of a signature or stamp on paper) and returns
// { file, processed, reason }:
//   - file: the result to upload - a transparent, cropped PNG when
//     processed is true, or the ORIGINAL file unchanged when false (an
//     upload must never be blocked just because background removal
//     didn't work).
//   - processed: whether background removal + crop actually succeeded.
//   - reason: a short machine-readable explanation when processed is
//     false ("decode-failed" | "no-content-detected" | "encode-failed"),
//     for logging/telling the person what happened - never shown raw.
export async function removePaperBackground(file) {
  let canvas;
  try {
    canvas = await fileToCanvas(file, MAX_DIMENSION);
    applyAutoContrast(canvas);
  } catch {
    return { file, processed: false, reason: "decode-failed" };
  }

  try {
    let opaqueFraction = stripPaperBackgroundLocal(canvas);
    if (isDegenerateResult(opaqueFraction)) {
      // Local pass looks like it failed on this photo - redraw a fresh
      // canvas from the original and try the simpler global pass instead.
      canvas = await fileToCanvas(file, MAX_DIMENSION);
      applyAutoContrast(canvas);
      opaqueFraction = stripPaperBackgroundGlobal(canvas);
    }
    if (isDegenerateResult(opaqueFraction)) {
      return { file, processed: false, reason: "no-content-detected" };
    }

    const cropped = cropToContent(canvas);
    if (!cropped) return { file, processed: false, reason: "no-content-detected" };

    const blob = await new Promise((resolve) => cropped.toBlob(resolve, "image/png", 1.0));
    if (!blob) return { file, processed: false, reason: "encode-failed" };

    const outFile = new File([blob], (file.name || "signature").replace(/\.\w+$/, "") + ".png", { type: "image/png" });
    return { file: outFile, processed: true };
  } catch {
    return { file, processed: false, reason: "decode-failed" };
  }
}
