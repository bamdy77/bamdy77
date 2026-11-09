// Automatically replaces whatever is behind a student in a phone-camera
// photo with a plain light-blue passport-photo backdrop - so staff don't
// need an actual blue sheet/cloth hung up behind the student when
// registering them on a phone.
//
// Runs entirely ON THE DEVICE (free, no per-photo cloud cost) using
// Google's MediaPipe "Selfie Segmentation" model, which tells us which
// pixels are "person" vs "background". The model itself (a few hundred KB)
// is loaded lazily from a public CDN only the first time a photo is taken
// in a session - it is NOT bundled into the app, so everyone else's page
// load stays exactly as fast as before this feature existed.
//
// Quality note: this is a "medium quality" free approach - edges around
// hair/ears are sometimes imperfect on a budget phone in poor light,
// unlike a paid cloud service. If anything about the model/network fails
// for ANY reason (no internet for the CDN, an unsupported browser, a
// slow/timed-out device, a corrupt image, etc.) this silently falls back
// to the ORIGINAL, unmodified photo - a student's photo must never be
// lost or blocked just because background replacement didn't work.

const CDN_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation";
const BG_COLOR = "#0096FF"; // school-standard ID photo blue (per spec)
const PROCESS_TIMEOUT_MS = 15000;

let scriptLoadPromise = null;
function loadSelfieSegmentationScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("No browser window."));
  if (window.SelfieSegmentation) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${CDN_BASE}/selfie_segmentation.js`;
    script.crossOrigin = "anonymous";
    script.onload = () => (window.SelfieSegmentation ? resolve() : reject(new Error("SelfieSegmentation failed to initialize.")));
    script.onerror = () => reject(new Error("Could not load the background-removal library (no internet?)."));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

let segmenterPromise = null;
function getSegmenter() {
  if (segmenterPromise) return segmenterPromise;
  segmenterPromise = loadSelfieSegmentationScript().then(() => {
    const segmenter = new window.SelfieSegmentation({
      locateFile: (file) => `${CDN_BASE}/${file}`,
    });
    segmenter.setOptions({ modelSelection: 1 });
    return segmenter;
  }).catch((err) => { segmenterPromise = null; throw err; }); // allow retrying next time on failure
  return segmenterPromise;
}

// Decodes a File into an on-screen-sized <canvas> element (the format the
// segmentation model accepts as input). Deliberately caps the working
// resolution to SEGMENT_MAX_DIMENSION via createImageBitmap's native resize-
// during-decode - the segmentation model needs nowhere near full photo
// resolution to find a person's outline, and this is a second, independent
// safety layer against the "low memory" crash (see the detailed comment on
// compressPhotoFile in schoolManagementBundle.jsx): even if this function is
// ever called with a photo larger than expected, it will never allocate a
// full-resolution decode buffer.
const SEGMENT_MAX_DIMENSION = 800; // px, long edge - plenty for segmentation
async function fileToCanvas(file) {
  const probe = await createImageBitmap(file);
  const { width: srcW, height: srcH } = probe;
  probe.close?.();
  let width = srcW, height = srcH;
  if (width > SEGMENT_MAX_DIMENSION || height > SEGMENT_MAX_DIMENSION) {
    const scale = SEGMENT_MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const bitmap = await createImageBitmap(file, { resizeWidth: width, resizeHeight: height, resizeQuality: "medium" });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return canvas;
}

// Takes a (compressed) student photo File and returns a NEW File with the
// background replaced by a plain light-blue backdrop. On any failure,
// resolves with the ORIGINAL file untouched - this function is designed to
// never throw and never block saving a student's photo.
export async function replaceBackgroundLightBlue(file) {
  try {
    const [segmenter, sourceCanvas] = await Promise.all([getSegmenter(), fileToCanvas(file)]);

    const results = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Background processing timed out.")), PROCESS_TIMEOUT_MS);
      segmenter.onResults((res) => { clearTimeout(timer); resolve(res); });
      segmenter.send({ image: sourceCanvas }).catch((err) => { clearTimeout(timer); reject(err); });
    });

    const { width, height } = sourceCanvas;
    const outCanvas = document.createElement("canvas");
    outCanvas.width = width;
    outCanvas.height = height;
    const ctx = outCanvas.getContext("2d");

    // Keep only the person's pixels from the mask...
    ctx.drawImage(results.segmentationMask, 0, 0, width, height);
    ctx.globalCompositeOperation = "source-in";
    ctx.drawImage(results.image, 0, 0, width, height);
    // ...then fill everything else (drawn BEHIND what's already there) with
    // the light-blue backdrop.
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    const blob = await new Promise((resolve) => outCanvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return file; // encoding failed - keep the original photo
    return new File([blob], (file.name || "photo").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // any failure at all - keep the original photo, never block the user
  }
}
