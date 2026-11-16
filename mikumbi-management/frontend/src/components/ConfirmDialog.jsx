import { useState } from "react";
import { translate, getLang } from "../i18n";
import { THEME } from "../styles/theme";
import { CheckIcon, CloseIcon } from "./icons";

// Drop-in replacement for window.confirm() - but a real in-app modal
// styled like the rest of the system, never the browser's native popup.
// Usage:
//   const { confirm, ConfirmDialogPortal } = useConfirm();
//   confirm("Are you sure you want to delete this?", () => actuallyDelete());
//   ...and render {ConfirmDialogPortal} once near the end of the component.
export function useConfirm() {
  const [state, setState] = useState(null); // { message, onYes, confirmLabel, cancelLabel, danger }

  const confirm = (message, onYes, opts = {}) => setState({ message, onYes, ...opts });

  const ConfirmDialogPortal = state ? (
    <ConfirmDialog
      message={state.message}
      confirmLabel={state.confirmLabel || translate(getLang(), "common.yes")}
      cancelLabel={state.cancelLabel || translate(getLang(), "common.no")}
      danger={state.danger !== false}
      onConfirm={() => { const fn = state.onYes; setState(null); fn(); }}
      onCancel={() => setState(null)}
    />
  ) : null;

  return { confirm, ConfirmDialogPortal };
}

function ConfirmDialog({ message, confirmLabel, cancelLabel, danger, onConfirm, onCancel }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9500, padding: 16 }}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div style={{ background: THEME.surface, borderRadius: 4, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", padding: 24 }}>
        <p style={{ fontSize: 14, color: THEME.text, lineHeight: 1.5, margin: "0 0 20px" }}>{message}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{
            padding: "9px 18px", background: THEME.surface, color: THEME.danger, border: `1.5px solid ${THEME.danger}`,
            borderRadius: 4, fontWeight: 600, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
          }}><CloseIcon size={13} />{cancelLabel}</button>
          <button onClick={onConfirm} style={{
            padding: "9px 18px", background: danger ? THEME.danger : THEME.navy, color: "#fff", border: "none",
            borderRadius: 4, fontWeight: 600, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
          }}><CheckIcon size={13} />{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
