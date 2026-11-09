import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../utils/api";
import { THEME } from "../styles/theme";
import { useConfirm } from "../components/ConfirmDialog";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { SpinnerIcon } from "../components/icons";
import { PasswordInput } from "../components/PasswordInput";

const ADMIN_TIER = ["admin", "second_master", "academic"];

const smsInputStyle = { width: "100%", padding: "9px 12px", borderRadius: 0, border: `1px solid ${THEME.border}`, fontSize: 13, boxSizing: "border-box" };
const smsLabelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: THEME.text, marginBottom: 5 };

export default function SmsGatewaySettings() {
  const { user, token } = useAuth();
  const { isMobile } = useBreakpoint();
  const { confirm, ConfirmDialogPortal } = useConfirm();

  const myRoles = user?.roles?.length ? user.roles : [user?.role];
  const isAdminTier = myRoles.some((r) => ADMIN_TIER.includes(r));

  if (!user) return null;

  if (!isAdminTier) {
    return (
      <div style={{ padding: 40, maxWidth: 560 }}>
        <h2 style={{ color: THEME.heading, fontSize: 20, marginBottom: 8 }}>SMS Gateway</h2>
        <p style={{ color: THEME.muted, fontSize: 13.5 }}>This page is only available to Admin, Second Master, and Academic accounts.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? "16px 12px 32px" : "24px 16px 40px", maxWidth: 700, margin: "0 auto" }}>
      <h2 style={{ color: THEME.heading, fontSize: isMobile ? 17 : 20, marginBottom: 4 }}>SMS Gateway</h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 24, maxWidth: 560 }}>
        Choose which provider Results → Send Results via SMS uses. NextSMS is the school's paid gateway (billed per SMS). Android SMS Gateway sends from a phone the school owns, using its own SIM.
      </p>

      <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, padding: "18px 18px 22px" }}>
        <SmsGatewaySection token={token} confirm={confirm} />
      </div>

      {ConfirmDialogPortal}
    </div>
  );
}

function SmsGatewaySection({ token, confirm }) {
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
    confirm("Hifadhi mabadiliko ya SMS Gateway?", async () => {
      setBusy(true);
      try {
        const body = { sms_provider: provider, android_sms_gateway_url: gwUrl, android_sms_gateway_username: gwUsername };
        if (gwPassword) body.android_sms_gateway_password = gwPassword;
        await apiFetch("/settings/sms", { method: "PUT", body: JSON.stringify(body) }, token);
        setMsg("Mipangilio ya SMS Gateway imehifadhiwa.");
        setGwPassword("");
        load();
      } catch (err) { setError(err.message); } finally { setBusy(false); }
    }, { danger: false });
  };

  if (!settings) return <p style={{ fontSize: 12.5, color: THEME.muted }}><SpinnerIcon size={13} /> Loading…</p>;

  return (
    <div>
      <label style={smsLabelStyle}>Provider ya Kutuma Matokeo (Results SMS)</label>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {[["nextsms", "NEXTSMS"], ["android_gateway", "Android SMS Gateway"]].map(([val, label]) => (
          <label key={val} style={{
            display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 0,
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
            Kutoka programu ya "SMS Gateway for Android" kwenye simu ya shule: nakili URL, Username, na Password vilivyoonyeshwa hapo, kisha viweke hapa.
          </p>
          <div>
            <label style={smsLabelStyle}>Gateway URL</label>
            <input value={gwUrl} onChange={(e) => setGwUrl(e.target.value)} placeholder="http://192.168.1.20:8080" style={smsInputStyle} />
          </div>
          <div>
            <label style={smsLabelStyle}>Username</label>
            <input value={gwUsername} onChange={(e) => setGwUsername(e.target.value)} style={smsInputStyle} />
          </div>
          <div>
            <label style={smsLabelStyle}>Password {settings.android_sms_gateway_password_set && <span style={{ color: THEME.muted, fontWeight: 400 }}>(imeshawekwa — acha wazi kama hutaki kubadilisha)</span>}</label>
            <PasswordInput value={gwPassword} onChange={(e) => setGwPassword(e.target.value)} placeholder="Password" required={false} style={{ border: `1px solid ${THEME.border}`, borderRadius: 0, fontSize: 13 }} />
          </div>
        </div>
      )}

      {error && <p style={{ color: THEME.danger, fontSize: 12.5, margin: "8px 0 0" }}>{error}</p>}
      {msg && <p style={{ color: THEME.success, fontSize: 12.5, margin: "8px 0 0" }}>{msg}</p>}
      <button onClick={save} disabled={busy} style={{
        marginTop: 12, padding: "9px 18px", borderRadius: 0, border: "none",
        background: THEME.navy, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
      }}>{busy ? "Inahifadhi..." : "Hifadhi"}</button>
    </div>
  );
}
