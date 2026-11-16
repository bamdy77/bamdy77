import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { THEME, SCHOOL } from "../styles/theme";
import PhotoCarousel from "../components/PhotoCarousel";
import { PasswordInput, UserIcon } from "../components/PasswordInput";
import { LoginIcon, ChevronLeftIcon, SpinnerIcon } from "../components/icons";

function useIsNarrow(breakpoint = 720) {
  const [narrow, setNarrow] = useState(window.innerWidth < breakpoint);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return narrow;
}

export default function Login() {
  const { login, verifyLoginCode } = useAuth();
  const [twofa, setTwofa] = useState(null); // { challenge_id, email_hint } while waiting for the emailed code
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false); // brief success tick before entering the dashboard
  const navigate = useNavigate();
  const isNarrow = useIsNarrow();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await login(username.trim(), password);
      if (r && r.twofa) { setTwofa(r.twofa); setCode(""); return; }
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Login failed.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e, value) => {
    e?.preventDefault?.();
    const c = String(value ?? code).trim();
    if (c.length !== 6 || busy) return;
    setError(""); setBusy(true);
    try {
      await verifyLoginCode(username.trim(), twofa.challenge_id, c);
      setVerified(true);
      await new Promise((r) => setTimeout(r, 700));
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Wrong code.");
      setCode(""); // wrong code: clear the box so the next 6 digits are checked again
      if (err.expired) { setTwofa(null); setPassword(""); }
    } finally { setBusy(false); }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "stretch", justifyContent: "center",
      background: `linear-gradient(160deg, ${THEME.navy} 0%, ${THEME.navyDark} 100%)`,
    }}>
      <div style={{
        margin: "auto", width: "100%", maxWidth: 780, display: "flex", borderRadius: 4,
        overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,0.3)", minHeight: 480,
      }}>
        {/* Rotating photos - left panel, hidden on narrow screens */}
        {!isNarrow && (
          <div style={{ flex: 1 }}>
            <PhotoCarousel />
          </div>
        )}

        {/* Login form - background follows the selected theme (THEME.surface)
            so it never goes stale-white while its own text (labelStyle uses
            THEME.text below) turns light for Dark/Nocturne; the two must
            always move together or labels go invisible. */}
        <div style={{ flex: 1, minWidth: 320, background: THEME.surface, padding: "44px 36px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <img src="/assets/shule.svg" alt="School logo" style={{ height: isNarrow ? 56 : 68 }} onError={(e) => (e.currentTarget.style.display = "none")} />
          </div>
          <div style={{ textAlign: "center", fontSize: 14, color: THEME.muted, marginBottom: 24 }}>
            Login with registered credentials
          </div>

          {twofa ? (
            <form onSubmit={submitCode}>
              <div style={{ fontSize: 14, color: THEME.text, lineHeight: 1.6, background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: "10px 12px" }}>
                New device: for your security, we sent a 6-digit code to <b>{twofa.email_hint}</b>. Enter it below. This device will then be remembered for 30 days.
              </div>
              <label style={labelStyle}>Login code</label>
              {/* Checks automatically as soon as the 6th digit is entered (typed or pasted). */}
              <input value={code} onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(v); if (v.length === 6) submitCode(null, v); }}
                disabled={busy} inputMode="numeric" autoComplete="one-time-code"
                autoFocus placeholder="123456" aria-label="Login code" className={busy && !verified ? "mk-code-checking" : ""}
                style={{ ...inputStyle, fontSize: 22, letterSpacing: 8, textAlign: "center", transition: "border-color .2s, box-shadow .2s",
                  ...(code.length === 6 ? { borderColor: THEME.navy, boxShadow: `0 0 0 3px ${THEME.navy}22` } : {}) }} />
              <style>{`@keyframes mkCodePulse { 0%,100% { box-shadow: 0 0 0 3px rgba(12,66,111,.15); } 50% { box-shadow: 0 0 0 7px rgba(12,66,111,.32); } }
                .mk-code-checking { animation: mkCodePulse 0.9s ease-in-out infinite; }
                @keyframes mkCodeOk { from { transform: scale(.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                .mk-code-ok { display: inline-block; animation: mkCodeOk .35s ease-out; }
                @media (prefers-reduced-motion: reduce) { .mk-code-checking { animation: none; } }`}</style>
              {error && <div style={{ color: THEME.danger, fontSize: 13, marginTop: 8 }}>{error}</div>}
              <button type="submit" disabled={busy || code.length !== 6} style={{
                width: "100%", marginTop: 20, padding: "12px 0", background: THEME.navy, color: "#fff",
                border: "none", borderRadius: 4, fontWeight: 600, fontSize: 14.5, cursor: "pointer", opacity: busy || code.length !== 6 ? 0.7 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                ...(verified ? { background: THEME.success, opacity: 1 } : {}),
              }}>{verified ? <span className="mk-code-ok">✓ Verified</span> : busy ? <><SpinnerIcon size={15} />Verifying…</> : "Verify and sign in"}</button>
              <button type="button" onClick={() => { setTwofa(null); setError(""); setPassword(""); }}
                style={{ width: "100%", marginTop: 10, background: "none", border: "none", color: THEME.navy, fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
                Didn't get the code? Sign in again to send a new one
              </button>
            </form>
          ) : (
          <form onSubmit={submit}>
            <label style={labelStyle}>Username</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex" }}>
                <UserIcon />
              </span>
              <input
                value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus
                style={{ ...inputStyle, paddingLeft: 38 }}
              />
            </div>

            <label style={labelStyle}>Password</label>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="" />

            {error && <div style={{ color: THEME.danger, fontSize: 13, marginTop: 8 }}>{error}</div>}

            <button type="submit" disabled={busy} style={{
              width: "100%", marginTop: 20, padding: "12px 0", background: THEME.navy, color: "#fff",
              border: "none", borderRadius: 4, fontWeight: 600, fontSize: 14.5, cursor: "pointer", opacity: busy ? 0.7 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              {busy ? <SpinnerIcon size={15} /> : <LoginIcon size={15} />}{busy ? "Signing in..." : "Login"}
            </button>
          </form>
          )}

          <div style={{ textAlign: "center", marginTop: 16 }}>
            <Link to="/forgot-password" style={{ fontSize: 13, color: THEME.navy }}>Forgot Password?</Link>
          </div>
          <div style={{ textAlign: "center", marginTop: 10 }}>
            <Link to="/" style={{ fontSize: 12.5, color: THEME.muted, display: "inline-flex", alignItems: "center", gap: 4 }}><ChevronLeftIcon size={12} />Back to Home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 12.5, fontWeight: 600, color: THEME.text, marginTop: 14, marginBottom: 5 };
const inputStyle = { width: "100%", padding: "10px 12px", border: `1px solid ${THEME.border}`, borderRadius: 4, fontSize: 14 };
