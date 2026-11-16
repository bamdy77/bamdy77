import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { THEME } from "../styles/theme";
import { DotsVerticalIcon } from "./icons";

// Portal-based + flip-aware, same approach as Student Management's
// ActionsMenu: a plain `position:absolute` dropdown (the old implementation)
// gets pushed off-screen for the LAST account card on a phone/tablet,
// because it always opens *downward* with no room left below it - making it
// look like the menu (and its buttons) simply don't exist. Rendering into a
// document.body portal and flipping upward when there isn't room below
// fixes that for every card, not just the ones with space beneath them.
export function ActionMenu({ children }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const itemCount = Array.isArray(children) ? children.filter(Boolean).length : (children ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target) && !e.target.closest("[data-usermenu-portal]")) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const menuWidth = 170;
      const menuHeight = itemCount * 38 + 8;
      const spaceBelow = window.innerHeight - r.bottom;
      const openUpward = spaceBelow < menuHeight + 10 && r.top > menuHeight + 10;
      setPos({
        top: openUpward
          ? Math.max(8, r.top - menuHeight - 4)
          : Math.min(r.bottom + 4, Math.max(8, window.innerHeight - menuHeight - 8)),
        left: Math.max(8, Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 8)),
      });
    }
    setOpen((o) => !o);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button ref={btnRef} onClick={toggle} aria-label="Actions" title="Actions" style={{
        width: 28, height: 28, borderRadius: 4, border: `1px solid ${THEME.border}`, background: THEME.surface,
        cursor: "pointer", color: THEME.text, display: "flex", alignItems: "center", justifyContent: "center",
      }}><DotsVerticalIcon size={16} /></button>
      {open && createPortal(
        <div data-usermenu-portal style={{
          position: "fixed", top: pos.top, left: pos.left, background: THEME.surface, border: `1px solid ${THEME.border}`,
          borderRadius: 4, boxShadow: "0 6px 18px rgba(0,0,0,0.12)", zIndex: 9600, minWidth: 160, overflow: "hidden",
        }} onClick={() => setOpen(false)}>
          {children}
        </div>,
        document.body
      )}
    </div>
  );
}
export function MenuItem({ onClick, danger, icon, children }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", padding: "9px 14px", fontSize: 12.5,
      background: THEME.surface, border: "none", borderTop: `1px solid ${THEME.border}`, cursor: "pointer",
      color: danger ? THEME.danger : THEME.text,
    }}>
      {icon && <span style={{ display: "flex", flexShrink: 0, opacity: 0.85 }}>{icon}</span>}
      {children}
    </button>
  );
}

