import { useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../utils/api";
import { THEME } from "../styles/theme";
import { SendIcon, ChevronLeftIcon, SpinnerIcon } from "../components/icons";
import { useLang } from "../i18n";
import { StaffLangToggle } from "../i18n/StaffLang";

export default function ForgotPassword() {
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null); // null | "sent" | "error"
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await apiFetch("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      setStatus("sent");
      setMessage(data.message);
    } catch (err) {
      setStatus("error");
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: THEME.bg, padding: 20, position: "relative" }}>
      <div style={{ position: "absolute", top: 14, right: 14 }}><StaffLangToggle dark={false} /></div>
      <div style={{ width: "100%", maxWidth: 380, background: THEME.surface, borderRadius: 4, padding: "32px", boxShadow: "0 10px 30px rgba(15,23,42,0.1)" }}>
        <h2 style={{ fontSize: 17, color: THEME.link, marginBottom: 6 }}>{t("pw.forgotTitle")}</h2>
        <p style={{ fontSize: 13, color: THEME.muted, marginBottom: 18 }}>
          {t("pw.forgotText")}
        </p>
        {status === "sent" ? (
          <div style={{ color: THEME.success, fontSize: 13.5, background: THEME.successLight, padding: 12, borderRadius: 4 }}>{message}</div>
        ) : (
          <form onSubmit={submit}>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder={t("pw.emailPh")}
              style={{ width: "100%", padding: "10px 12px", border: `1px solid ${THEME.border}`, borderRadius: 4, fontSize: 14 }} />
            {status === "error" && <div style={{ color: THEME.danger, fontSize: 13, marginTop: 8 }}>{message}</div>}
            <button type="submit" disabled={busy} style={{
              width: "100%", marginTop: 16, padding: "11px 0", background: THEME.navy, color: "#fff",
              border: "none", borderRadius: 4, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.7 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>{busy ? <SpinnerIcon size={14} /> : <SendIcon size={14} />}{busy ? t("pw.sending") : t("pw.sendLink")}</button>
          </form>
        )}
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Link to="/login" style={{ fontSize: 13, color: THEME.link, display: "inline-flex", alignItems: "center", gap: 4 }}><ChevronLeftIcon size={12} />{t("pw.backLogin")}</Link>
        </div>
      </div>
    </div>
  );
}
