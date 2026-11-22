import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../utils/api";
import { THEME } from "../styles/theme";
import { showSuccess } from "../components/SuccessModal";
import { ShieldIcon, SpinnerIcon, CheckIcon } from "../components/icons";
import { useLang } from "../i18n";

// Settings → Login Security. Explains the 2-step verification that now
// protects every account on a new device, and lets the person choose how
// long a verified device stays trusted before it must verify again.
const OPTIONS = [10, 30, 90, 0]; // 0 = until the password changes

export default function LoginSecurity() {
  const { token, user, updateUser } = useAuth();
  const { t } = useLang();
  const [days, setDays] = useState(() => {
    const d = Number(user?.trusted_device_days);
    return OPTIONS.includes(d) ? d : 30;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!user) return null;

  const label = (d) => (d === 0 ? t("sec.always") : t("sec.days", { n: d }));

  const save = async () => {
    setBusy(true); setError("");
    try {
      await apiFetch("/auth/preferences/trusted-days", { method: "PUT", body: JSON.stringify({ days }) }, token);
      updateUser({ trusted_device_days: days });
      showSuccess(t("sec.title"), t("sec.saved"));
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div style={{ padding: 24, maxWidth: 620 }}>
      <h2 style={{ color: THEME.heading, fontSize: 20, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
        <ShieldIcon size={20} />{t("sec.title")}
      </h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, margin: "0 0 20px", lineHeight: 1.6 }}>{t("sec.intro")}</p>

      <section style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 6, padding: 18, marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, color: THEME.heading, margin: "0 0 6px" }}>{t("sec.2faTitle")}</h3>
        <p style={{ fontSize: 13, color: THEME.muted, margin: 0, lineHeight: 1.6 }}>{t("sec.2faDesc")}</p>
      </section>

      <section style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 6, padding: 18 }}>
        <h3 style={{ fontSize: 15, color: THEME.heading, margin: "0 0 6px" }}>{t("sec.rememberTitle")}</h3>
        <p style={{ fontSize: 13, color: THEME.muted, margin: "0 0 14px", lineHeight: 1.6 }}>{t("sec.rememberDesc")}</p>
        <div style={{ display: "grid", gap: 8 }}>
          {OPTIONS.map((d) => (
            <label key={d} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 6, cursor: "pointer",
              border: `1.5px solid ${days === d ? THEME.navy : THEME.border}`,
              background: days === d ? `color-mix(in srgb, ${THEME.navy} 7%, ${THEME.surface})` : THEME.surface,
            }}>
              <input type="radio" name="trustdays" checked={days === d} onChange={() => setDays(d)} style={{ accentColor: THEME.navy }} />
              <span style={{ fontSize: 14, fontWeight: days === d ? 700 : 500, color: THEME.text }}>{label(d)}</span>
            </label>
          ))}
        </div>
        {error && <div style={{ color: THEME.danger, fontSize: 13, marginTop: 12 }}>{error}</div>}
        <div style={{ marginTop: 16 }}>
          <button onClick={save} disabled={busy} style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 20px", borderRadius: 4, border: "none",
            background: THEME.navy, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
          }}>{busy ? <SpinnerIcon size={14} /> : <CheckIcon size={14} />}{t("sec.save")}</button>
        </div>
      </section>
    </div>
  );
}
