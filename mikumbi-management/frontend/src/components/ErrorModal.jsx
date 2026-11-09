import { useState, useEffect } from "react";
import { THEME } from "../styles/theme";

// Same pub/sub pattern as SuccessModal (see that file for the full
// rationale) - but for errors that need to interrupt the user (e.g. a
// rejected action while another modal is already open, where an inline
// error banner underneath wouldn't be visible). Call showError("Title",
// "message") from anywhere with no provider/hook plumbing needed. Mount
// <ErrorModalHost /> exactly once, at the app root (see App.jsx).
let listener = null;

export function showError(title, message) {
  if (listener) listener({ title, message, key: Date.now() });
}

export function ErrorModalHost() {
  const [state, setState] = useState(null);

  useEffect(() => {
    listener = (s) => setState(s);
    return () => { listener = null; };
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e) => { if (e.key === "Escape" || e.key === "Enter") setState(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  if (!state) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) setState(null); }}
    >
      <div style={{ background: THEME.surface, borderRadius: 4, width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", padding: "36px 28px 28px", textAlign: "center" }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%", margin: "0 auto 18px",
          border: `2px solid ${THEME.dangerLight}`, background: THEME.dangerLight,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={THEME.danger} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </div>
        <h3 style={{ margin: "0 0 8px", fontSize: 19, fontWeight: 800, color: THEME.text }}>{state.title}</h3>
        <p style={{ margin: "0 0 26px", fontSize: 13.5, color: THEME.muted }}>{state.message}</p>
        <button
          onClick={() => setState(null)}
          autoFocus
          style={{
            padding: "10px 36px", background: THEME.navy, color: "#fff", border: "none",
            borderRadius: 4, fontWeight: 700, fontSize: 13.5, cursor: "pointer",
          }}
        >OK</button>
      </div>
    </div>
  );
}
