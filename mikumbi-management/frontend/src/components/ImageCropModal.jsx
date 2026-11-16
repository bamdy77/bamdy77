import { useEffect, useRef, useState, useCallback } from "react";
import { useLang } from "../i18n";
import { THEME } from "../styles/theme";

const HANDLE_SIZE = 22; // touch-friendly hit target, not the visible dot size
const MIN_CROP = 40; // px, in on-screen (displayed) coordinates

// A minimal, dependency-free crop tool: an image is shown at its natural
// aspect ratio inside a fixed-height stage, with a draggable/resizable
// rectangle overlaid on it. Drag the rectangle's body to move it, drag any
// of its four corners to resize it, then "Use this crop" reads the pixels
// back out of the ORIGINAL image (not the on-screen scaled-down version) via
// an off-screen canvas, so the exported crop is always full quality
// regardless of how small the phone's screen is.
//
// Props: `file` (the picked File/Blob), `onCancel()`, `onConfirm(croppedFile)`.
export default function ImageCropModal({ file, onCancel, onConfirm }) {
  const { t } = useLang();
  const [imgUrl, setImgUrl] = useState(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [displayed, setDisplayed] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState(null); // { x, y, w, h } in displayed-image-local coords
  const [busy, setBusy] = useState(false);
  const stageRef = useRef(null);
  const imgRef = useRef(null);
  const dragRef = useRef(null); // { mode: "move"|"nw"|"ne"|"sw"|"se", startX, startY, startBox }

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onImgLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    const nat = { w: img.naturalWidth, h: img.naturalHeight };
    const disp = { w: img.clientWidth, h: img.clientHeight };
    setNatural(nat);
    setDisplayed(disp);
    // Start with a crop box covering ~90% of the image, centered - close to
    // "use the whole photo" but already nudged inward past raw photo edges.
    const pad = 0.05;
    setBox({ x: disp.w * pad, y: disp.h * pad, w: disp.w * (1 - pad * 2), h: disp.h * (1 - pad * 2) });
  };

  const clampBox = useCallback((b) => {
    let { x, y, w, h } = b;
    w = Math.max(MIN_CROP, Math.min(w, displayed.w));
    h = Math.max(MIN_CROP, Math.min(h, displayed.h));
    x = Math.max(0, Math.min(x, displayed.w - w));
    y = Math.max(0, Math.min(y, displayed.h - h));
    return { x, y, w, h };
  }, [displayed]);

  const pointerPos = (e) => {
    const rect = stageRef.current.getBoundingClientRect();
    const p = e.touches?.[0] || e;
    return { x: p.clientX - rect.left, y: p.clientY - rect.top };
  };

  const startDrag = (mode) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = pointerPos(e);
    dragRef.current = { mode, startX: pos.x, startY: pos.y, startBox: box };
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", endDrag);
    window.addEventListener("touchmove", onDrag, { passive: false });
    window.addEventListener("touchend", endDrag);
  };

  const onDrag = (e) => {
    if (!dragRef.current) return;
    if (e.cancelable) e.preventDefault();
    const pos = pointerPos(e);
    const dx = pos.x - dragRef.current.startX;
    const dy = pos.y - dragRef.current.startY;
    const s = dragRef.current.startBox;
    const { mode } = dragRef.current;
    let next = { ...s };
    if (mode === "move") {
      next = { x: s.x + dx, y: s.y + dy, w: s.w, h: s.h };
    } else if (mode === "nw") {
      next = { x: s.x + dx, y: s.y + dy, w: s.w - dx, h: s.h - dy };
    } else if (mode === "ne") {
      next = { x: s.x, y: s.y + dy, w: s.w + dx, h: s.h - dy };
    } else if (mode === "sw") {
      next = { x: s.x + dx, y: s.y, w: s.w - dx, h: s.h + dy };
    } else if (mode === "se") {
      next = { x: s.x, y: s.y, w: s.w + dx, h: s.h + dy };
    }
    setBox(clampBox(next));
  };

  const endDrag = () => {
    dragRef.current = null;
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", endDrag);
    window.removeEventListener("touchmove", onDrag);
    window.removeEventListener("touchend", endDrag);
  };

  useEffect(() => () => endDrag(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConfirm = async () => {
    if (!box || !displayed.w || !natural.w) return;
    setBusy(true);
    try {
      const scaleX = natural.w / displayed.w;
      const scaleY = natural.h / displayed.h;
      const sx = box.x * scaleX, sy = box.y * scaleY, sw = box.w * scaleX, sh = box.h * scaleY;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sw));
      canvas.height = Math.max(1, Math.round(sh));
      const ctx = canvas.getContext("2d");
      ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
      const cropped = new File([blob], (file.name || "photo").replace(/\.[^.]+$/, "") + "-cropped.png", { type: "image/png" });
      onConfirm(cropped);
    } finally {
      setBusy(false);
    }
  };

  const handle = (mode, style) => (
    <div
      onMouseDown={startDrag(mode)}
      onTouchStart={startDrag(mode)}
      style={{
        position: "absolute", width: HANDLE_SIZE, height: HANDLE_SIZE,
        marginLeft: -HANDLE_SIZE / 2, marginTop: -HANDLE_SIZE / 2,
        cursor: `${mode}-resize`, touchAction: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        ...style,
      }}
    >
      <div style={{ width: 14, height: 14, borderRadius: 4, background: "#fff", border: `2px solid ${THEME.navy}`, boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }} />
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.82)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: THEME.surface, borderRadius: 4, padding: 16, maxWidth: 520, width: "100%", maxHeight: "92vh", display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, color: THEME.heading, fontWeight: 700 }}>{t("crop.title")}</h3>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: THEME.muted }}>{t("crop.hint")}</p>
        </div>

        <div
          ref={stageRef}
          style={{ position: "relative", width: "100%", maxHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0F172A", borderRadius: 4, overflow: "hidden", userSelect: "none" }}
        >
          {imgUrl && (
            <img
              ref={imgRef}
              src={imgUrl}
              alt={t("crop.alt")}
              onLoad={onImgLoad}
              draggable={false}
              style={{ maxWidth: "100%", maxHeight: "60vh", display: "block", objectFit: "contain" }}
            />
          )}
          {box && (
            <div
              onMouseDown={startDrag("move")}
              onTouchStart={startDrag("move")}
              style={{
                position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h,
                border: "2px solid #fff", boxShadow: "0 0 0 2000px rgba(15,23,42,0.55)",
                cursor: "move", touchAction: "none",
              }}
            >
              {handle("nw", { left: 0, top: 0 })}
              {handle("ne", { left: box.w, top: 0 })}
              {handle("sw", { left: 0, top: box.h })}
              {handle("se", { left: box.w, top: box.h })}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{ padding: "9px 16px", borderRadius: 4, border: `1px solid ${THEME.border}`, background: THEME.bg, color: THEME.text, fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer" }}
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy || !box}
            style={{ padding: "9px 18px", borderRadius: 4, border: `1px solid ${THEME.navy}`, background: THEME.navy, color: "#fff", fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
          >
            {busy ? t("crop.busy") : t("crop.use")}
          </button>
        </div>
      </div>
    </div>
  );
}
