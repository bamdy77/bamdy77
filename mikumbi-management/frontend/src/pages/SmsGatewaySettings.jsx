import { useEffect, useState } from "react";
import { useLang } from "../i18n";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../utils/api";
import { THEME } from "../styles/theme";
import { useConfirm } from "../components/ConfirmDialog";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { SpinnerIcon } from "../components/icons";
import { PasswordInput } from "../components/PasswordInput";

const ADMIN_TIER = ["admin", "second_master", "academic"];

const smsInputStyle = { width: "100%", padding: "9px 12px", borderRadius: 4, border: `1px solid ${THEME.border}`, fontSize: 13, boxSizing: "border-box" };
const smsLabelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: THEME.text, marginBottom: 5 };

export default function SmsGatewaySettings() {
  const { t } = useLang();
  const { user, token } = useAuth();
  const { isMobile } = useBreakpoint();
  const { confirm, ConfirmDialogPortal } = useConfirm();

  const myRoles = user?.roles?.length ? user.roles : [user?.role];
  const isAdminTier = myRoles.some((r) => ADMIN_TIER.includes(r));

  if (!user) return null;

  if (!isAdminTier) {
    return (
      <div style={{ padding: 40, maxWidth: 560 }}>
        <h2 style={{ color: THEME.heading, fontSize: 20, marginBottom: 8 }}>{t("set.sms")}</h2>
        <p style={{ color: THEME.muted, fontSize: 13.5 }}>{t("smsgw.onlyManagers")}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? "16px 12px 32px" : "24px 16px 40px", maxWidth: 700, margin: "0 auto" }}>
      <h2 style={{ color: THEME.heading, fontSize: isMobile ? 17 : 20, marginBottom: 4 }}>{t("set.sms")}</h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 24, maxWidth: 560 }}>
        {t("smsgw.intro")}
      </p>

      <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: "18px 18px 22px" }}>
        <SmsGatewaySection token={token} confirm={confirm} />
      </div>

      {ConfirmDialogPortal}
    </div>
  );
}

function SmsGatewaySection({ token, confirm }) {
  const { t } = useLang();
  const [settings, setSettings] = useState(null);
  const [provider, setProvider] = useState("nextsms");
  const [gwUrl, setGwUrl] = useState("");
  const [gwUsername, setGwUsername] = useState("");
  const [gwPassword, setGwPassword] = useState(""); // left blank = keep the saved one
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = () => {
    apiFetch("/settings/sms", {}, token).then((r) => {
      const d = r.data || r;
      setSettings(d);
      setProvider(d.sms_provider || "nextsms");
      setGwUrl(d.android_sms_gateway_url || "");
      setGwUsername(d.android_sms_gateway_username || "");
    }).catch((err) => setError(err.message));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    setError(""); setMsg("");
    confirm(t("smsgw.saveConfirm"), async () => {
      setBusy(true);
      try {
        const body = { sms_provider: provider, android_sms_gateway_url: gwUrl, android_sms_gateway_username: gwUsername };
        if (gwPassword) body.android_sms_gateway_password = gwPassword;
        await apiFetch("/settings/sms", { method: "PUT", body: JSON.stringify(body) }, token);
        setMsg(t("smsgw.saved"));
        setGwPassword("");
        load();
      } catch (err) { setError(err.message); } finally { setBusy(false); }
    }, { danger: false });
  };

  if (!settings) return <p style={{ fontSize: 12.5, color: THEME.muted }}><SpinnerIcon size={13} /> {t("common.loading")}</p>;

  return (
    <div>
      <details open style={{ marginBottom: 18, background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 6, padding: "10px 14px" }}>
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 13, color: THEME.heading }}>{t("smsgw.guideTitle")}</summary>
        <p style={{ fontSize: 12.5, color: THEME.muted, margin: "10px 0", lineHeight: 1.55 }}>{t("smsgw.guideIntro")}</p>
        <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8, fontSize: 12.5, color: THEME.text, lineHeight: 1.5 }}>
          <li>{t("smsgw.step1")} <a href="https://sms-gate.app" target="_blank" rel="noopener noreferrer" style={{ color: THEME.navy, fontWeight: 700 }}>{t("smsgw.step1Link")}</a></li>
          <li>{t("smsgw.step2")}</li>
          <li>{t("smsgw.step3")}</li>
          <li>{t("smsgw.step4")}</li>
          <li>{t("smsgw.step5")}</li>
          <li>{t("smsgw.step6")}</li>
        </ol>
        <p style={{ fontSize: 11.5, color: THEME.muted, margin: "10px 0 0", lineHeight: 1.5 }}>{t("smsgw.guideNote")}</p>
      </details>

      <label style={smsLabelStyle}>{t("smsgw.provider")}</label>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {[["nextsms", "NEXTSMS"], ["android_gateway", "Android SMS Gateway"]].map(([val, label]) => (
          <label key={val} style={{
            display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 4,
            border: `1.5px solid ${provider === val ? THEME.navy : THEME.border}`,
            background: provider === val ? `${THEME.navy}10` : "transparent", cursor: "pointer", fontSize: 13,
          }}>
            <input type="radio" name="sms_provider" checked={provider === val} onChange={() => setProvider(val)} />
            {label}
          </label>
        ))}
      </div>

      {provider === "android_gateway" && (
        <div style={{ display: "grid", gap: 12, marginBottom: 6, maxWidth: 420 }}>
          <p style={{ fontSize: 11.5, color: THEME.muted, margin: 0 }}>
            {t("smsgw.androidHelp")}
          </p>
          <div>
            <label style={smsLabelStyle}>{t("smsgw.url")}</label>
            <input value={gwUrl} onChange={(e) => setGwUrl(e.target.value)} placeholder="http://192.168.1.20:8080" style={smsInputStyle} />
          </div>
          <div>
            <label style={smsLabelStyle}>{t("login.username")}</label>
            <input value={gwUsername} onChange={(e) => setGwUsername(e.target.value)} style={smsInputStyle} />
          </div>
          <div>
            <label style={smsLabelStyle}>{t("login.password")} {settings.android_sms_gateway_password_set && <span style={{ color: THEME.muted, fontWeight: 400 }}>({t("smsgw.pwSet")})</span>}</label>
            <PasswordInput value={gwPassword} onChange={(e) => setGwPassword(e.target.value)} placeholder={t("login.password")} required={false} style={{ border: `1px solid ${THEME.border}`, borderRadius: 4, fontSize: 13 }} />
          </div>
        </div>
      )}

      {error && <p style={{ color: THEME.danger, fontSize: 12.5, margin: "8px 0 0" }}>{error}</p>}
      {msg && <p style={{ color: THEME.success, fontSize: 12.5, margin: "8px 0 0" }}>{msg}</p>}
      <button onClick={save} disabled={busy} style={{
        marginTop: 12, padding: "9px 18px", borderRadius: 4, border: "none",
        background: THEME.navy, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
      }}>{busy ? t("common.saving") : t("common.save")}</button>
    </div>
  );
}
