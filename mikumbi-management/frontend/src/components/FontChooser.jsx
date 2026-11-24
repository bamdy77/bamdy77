import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FONT_OPTIONS, FONT_STACKS, DEFAULT_FONT } from "../styles/fonts";

// Interface font chooser panel, shared by the staff and parents sites.
// Either pass `renderTrigger(props)` (it draws its own opening control), or
// control it with `open` + `onClose` + `returnFocusRef` (used when the opener
// lives in a dropdown that closes first). The dialog is portalled to <body>;
// the panel is a small centered dialog with a listbox of the 5 fonts, each
// shown in its own font. Keyboard: arrows move, Enter/Space choose,
// Escape closes and returns focus to the trigger. Choosing applies at once.
export default function FontChooser({ value, onChange, labels, renderTrigger, note, open: openProp, onClose, returnFocusRef }) {
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;
  const ownTriggerRef = useRef(null);
  const triggerRef = returnFocusRef || ownTriggerRef;
  const optionRefs = useRef([]);
  const current = Math.max(0, FONT_OPTIONS.findIndex((o) => o.value === value));
  const [active, setActive] = useState(current);

  const openPanel = () => { setActive(current); setOpenState(true); };
  const close = () => {
    if (controlled) onClose?.(); else setOpenState(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => { if (open) setActive(current); /* eslint-disable-next-line */ }, [open]);
  useEffect(() => { if (open) optionRefs.current[active]?.focus(); }, [open, active]);
  // Escape must close the panel even if focus has left it (e.g. the Reset
  // button becomes disabled right after it is pressed).
  useEffect(() => {
    if (!open) return undefined;
    const onEsc = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); setActive((i) => (i + 1) % FONT_OPTIONS.length); }
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); setActive((i) => (i - 1 + FONT_OPTIONS.length) % FONT_OPTIONS.length); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(FONT_OPTIONS.length - 1); }
  };

  return (
    <>
      {renderTrigger && renderTrigger({ ref: ownTriggerRef, onClick: openPanel, "aria-haspopup": "dialog", "aria-expanded": open })}
      {open && createPortal(
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
          style={{ position: "fixed", inset: 0, zIndex: 10120, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div role="dialog" aria-modal="true" aria-labelledby="mk-font-title" onKeyDown={onKeyDown}
            style={{ width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto", background: "#fff", color: "#0F172A", borderRadius: 4, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
              <h2 id="mk-font-title" style={{ fontSize: 17, fontWeight: 800, color: "#16356f", margin: 0 }}>{labels.title}</h2>
              <button type="button" onClick={close} aria-label={labels.close}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, lineHeight: 1, color: "#475569", padding: 4 }}>×</button>
            </div>
            <p style={{ fontSize: 13, color: "#64748B", margin: "0 0 12px" }}>{labels.hint}</p>
            <div role="listbox" aria-label={labels.title} aria-activedescendant={`mk-font-opt-${FONT_OPTIONS[active].value}`}>
              {FONT_OPTIONS.map((opt, i) => {
                const selected = opt.value === value;
                return (
                  <div key={opt.value} id={`mk-font-opt-${opt.value}`} role="option" aria-selected={selected}
                    ref={(el) => { optionRefs.current[i] = el; }} tabIndex={i === active ? 0 : -1}
                    onClick={() => { setActive(i); onChange(opt.value); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(opt.value); } }}
                    onFocus={() => setActive(i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", marginBottom: 6, cursor: "pointer",
                      border: `${selected ? 2 : 1}px solid ${selected ? "#16356f" : "#E2E8F0"}`, borderRadius: 4,
                      background: selected ? "#EEF4FA" : "#fff", outlineOffset: 2,
                    }}>
                    <div style={{ flex: 1, minWidth: 0, fontFamily: FONT_STACKS[opt.value] }}>
                      <div style={{ fontSize: 15.5, fontWeight: 700 }}>{opt.value === DEFAULT_FONT ? labels.defaultName : opt.label}</div>
                      <div style={{ fontSize: 13, color: "#475569", overflowWrap: "anywhere" }}>Aa Bb 123 - {labels.sample || ""}</div>
                    </div>
                    <span aria-hidden="true" style={{ width: 20, flexShrink: 0, color: "#16356f", fontWeight: 800, fontSize: 16 }}>{selected ? "✓" : ""}</span>
                  </div>
                );
              })}
            </div>
            {note && <p role="status" style={{ fontSize: 12.5, color: "#B45309", margin: "6px 0 0" }}>{note}</p>}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={() => { onChange(DEFAULT_FONT); setActive(0); optionRefs.current[0]?.focus(); }} disabled={value === DEFAULT_FONT}
                style={{ padding: "9px 14px", borderRadius: 4, border: "1px solid #CBD5E1", background: "#fff", color: "#16356f", fontWeight: 700, fontSize: 13.5, cursor: value === DEFAULT_FONT ? "default" : "pointer", opacity: value === DEFAULT_FONT ? 0.55 : 1 }}>
                {labels.reset}
              </button>
              <button type="button" onClick={close}
                style={{ padding: "9px 18px", borderRadius: 4, border: "none", background: "#16356f", color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
                {labels.done}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
