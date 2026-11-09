import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { ChevronDownIcon } from "./icons";

// Navbar dropdown that opens when the mouse simply HOVERS over it (no click
// needed) and closes shortly after the mouse leaves. It also:
//  - opens on keyboard focus / Enter / Space and closes on Escape (accessible),
//  - toggles on tap for touch screens (phones/tablets have no hover),
//  - closes when clicking/tapping anywhere outside.
//
// items: [{ label, icon?: Component, to?: string, onClick?: fn }]
// variant: "light" (white panel, school website) | "navy" (staff Landing look)
export default function HoverMenu({ label, icon: LabelIcon, items, variant = "light", buttonStyle = {}, align = "left" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const closeTimer = useRef(null);
  const lastPointer = useRef("mouse");

  const clearTimer = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const openNow = useCallback(() => { clearTimer(); setOpen(true); }, []);
  const closeSoon = useCallback(() => { clearTimer(); closeTimer.current = setTimeout(() => setOpen(false), 150); }, []);
  useEffect(() => clearTimer, []);

  // Close on outside tap/click and on Escape.
  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isNavy = variant === "navy";
  const panelStyle = isNavy
    ? { background: "#0c426f", borderRadius: 6, boxShadow: "0 10px 30px rgba(0,0,0,0.25)", minWidth: 190 }
    : { background: "#fff", borderRadius: 10, boxShadow: "0 12px 32px rgba(12,66,111,0.22)", minWidth: 230, border: "1px solid #e2e8f0" };

  const itemBase = isNavy
    ? { color: "#fff", fontSize: 12.5, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.08)" }
    : { color: "#0c426f", fontSize: 13.5, fontWeight: 700, borderBottom: "1px solid #eef2f7" };

  const closeAfter = (fn) => (e) => { setOpen(false); if (fn) fn(e); };

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative" }}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") openNow(); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") closeSoon(); }}
      onFocus={(e) => {
        // Only keyboard focus opens the menu. A mouse/touch click also focuses
        // the button, and opening here would make the click then toggle it shut.
        let kb = false;
        try { kb = e.target.matches(":focus-visible"); } catch { kb = false; }
        if (kb) openNow();
      }}
      onBlur={(e) => { if (!wrapRef.current?.contains(e.relatedTarget)) closeSoon(); }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onPointerDown={(e) => { lastPointer.current = e.pointerType || "mouse"; }}
        onClick={(e) => {
          // With a mouse the menu is already open from hovering - a click
          // must not slam it shut. Touch and keyboard (detail === 0) toggle.
          if (lastPointer.current === "mouse" && e.detail > 0) setOpen(true);
          else setOpen((o) => !o);
        }}
        style={{
          background: "none", border: "none", font: "inherit", color: "inherit", cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 6, padding: 0, ...buttonStyle,
        }}
      >
        {LabelIcon && <LabelIcon size={14} />}
        {label}
        <span style={{ display: "flex", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}>
          <ChevronDownIcon size={12} />
        </span>
      </button>

      {open && (
        // paddingTop (not margin) bridges the visual gap so the pointer never
        // leaves the hover area while moving from the button to the panel.
        <div style={{ position: "absolute", top: "100%", [align === "right" ? "right" : "left"]: 0, paddingTop: 10, zIndex: 80 }}>
          <div role="menu" style={{ ...panelStyle, overflow: "hidden" }}>
            {items.map((it, i) => {
              const Ico = it.icon;
              const last = i === items.length - 1;
              const common = {
                role: "menuitem",
                style: {
                  ...itemBase, display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                  padding: "12px 18px", background: "none", border: "none", textDecoration: "none", cursor: "pointer",
                  borderBottom: last ? "none" : itemBase.borderBottom, transition: "background 0.15s, color 0.15s",
                },
                onMouseEnter: (e) => { e.currentTarget.style.background = isNavy ? "rgba(255,255,255,0.08)" : "#f1f6fb"; if (isNavy) e.currentTarget.style.color = "#D4A017"; },
                onMouseLeave: (e) => { e.currentTarget.style.background = "none"; if (isNavy) e.currentTarget.style.color = "#fff"; },
              };
              const marker = Ico
                ? <Ico size={13} />
                : <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", border: "2px solid #0c426f", flexShrink: 0 }} />;
              return it.to ? (
                <Link key={it.label} to={it.to} {...common} onClick={closeAfter(it.onClick)}>{marker}{it.label}</Link>
              ) : (
                <button key={it.label} type="button" {...common} onClick={closeAfter(it.onClick)}>{marker}{it.label}</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
