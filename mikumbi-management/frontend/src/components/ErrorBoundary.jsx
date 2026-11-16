import { Component } from "react";
import { THEME } from "../styles/theme";
import { RefreshIcon } from "./icons";
import { translate, getLang } from "../i18n";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Visible in the browser console / server logs - helps diagnose what broke.
    console.error("Unhandled UI error:", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      const t = (k) => translate(getLang(), k);
      return (
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          background: THEME.bg, padding: 24,
        }}>
          <div style={{ maxWidth: 440, background: THEME.surface, borderRadius: 4, padding: 32, boxShadow: "0 10px 30px rgba(15,23,42,0.1)", textAlign: "center" }}>
            <h2 style={{ color: THEME.heading, fontSize: 18, marginBottom: 10 }}>{t("errb.title")}</h2>
            <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 20, lineHeight: 1.5 }}>
              {t("errb.text")}
            </p>
            <button onClick={() => window.location.reload()} style={{
              padding: "10px 24px", background: THEME.navy, color: "#fff", border: "none",
              borderRadius: 4, fontWeight: 600, fontSize: 13.5, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 7,
            }}><RefreshIcon size={14} />{t("errb.reload")}</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
