import { useEffect, useRef, useState } from "react";

// View-only wrapper for the parents' Results page.
//
// What it does (no website can fully stop a phone screenshot or a camera
// photo - these measures make copying harder and every copy traceable):
//  - no text selection, copy/cut, right-click menu, image dragging;
//  - blocks Ctrl/Cmd + P (print), S (save), C (copy), A (select all) and
//    the PrintScreen key; printing shows a notice instead of the results;
//  - hides the results while the window is not in focus (screen-snipping
//    tools and app switchers usually take the picture at that moment);
//  - a repeated watermark with the student's login number, name and the
//    viewing time, so any picture that is taken shows whose results it is.
export default function ProtectedView({ watermark, children, labels }) {
  const [hidden, setHidden] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const block = (e) => { if (wrapRef.current?.contains(e.target)) e.preventDefault(); };
    const onKey = (e) => {
      const k = String(e.key || "").toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ["p", "s", "c", "a", "x"].includes(k)) { e.preventDefault(); e.stopPropagation(); }
      if (k === "printscreen") {
        e.preventDefault();
        try { navigator.clipboard?.writeText(""); } catch { /* ignore */ }
        setHidden(true); setTimeout(() => setHidden(!document.hasFocus()), 1500);
      }
    };
    const onBlur = () => setHidden(true);
    const onFocus = () => setHidden(false);
    const onVis = () => setHidden(document.visibilityState !== "visible");
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("contextmenu", block);
    document.addEventListener("dragstart", block);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keyup", onKey, true);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.body.classList.add("mk-results-protected");
    return () => {
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("keyup", onKey, true);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.body.classList.remove("mk-results-protected");
    };
  }, []);

  // SVG tile with the watermark text, repeated over the whole results area.
  const tile = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="220"><text x="260" y="118" text-anchor="middle" transform="rotate(-20 260 110)" fill="rgba(26,80,199,0.13)" font-family="Arial, sans-serif" font-size="15" font-weight="700">${String(watermark).replace(/[<>&"]/g, "")}</text></svg>`
  );

  return (
    <div ref={wrapRef} className="mk-protected" style={{ position: "relative", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
      <style>{`
        .mk-protected img { pointer-events: none; -webkit-user-drag: none; }
        @media print {
          body.mk-results-protected * { visibility: hidden !important; }
          body.mk-results-protected .mk-print-notice, body.mk-results-protected .mk-print-notice * { visibility: visible !important; }
          body.mk-results-protected .mk-print-notice { display: block !important; position: fixed; inset: 0; padding: 40px; text-align: center; font-size: 18px; }
        }
      `}</style>
      <div className="mk-print-notice" style={{ display: "none" }}>{labels.noPrint}</div>
      <div aria-hidden={hidden} style={{ filter: hidden ? "blur(16px)" : "none", transition: "filter .1s" }}>{children}</div>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: `url("data:image/svg+xml,${tile}")`, backgroundRepeat: "repeat" }} />
      {hidden && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center", fontWeight: 700, color: "#16356f", fontSize: 16 }}>
          {labels.hidden}
        </div>
      )}
      <p style={{ fontSize: 13, color: "#64748B", textAlign: "center", margin: "14px 0 0" }}>{labels.viewOnly}</p>
    </div>
  );
}
