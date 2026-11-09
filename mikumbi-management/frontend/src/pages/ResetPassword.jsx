import { useState } from "react";
import { passwordProblem } from "../utils/passwordPolicy";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { apiFetch } from "../utils/api";
import { THEME } from "../styles/theme";
import { PasswordInput } from "../components/PasswordInput";
import { LockIcon, SpinnerIcon } from "../components/icons";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const uid = params.get("uid");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) return setError("Passwords do not match.");
    { const pwErr = passwordProblem(password); if (pwErr) return setError(pwErr); }
    setBusy(true);
    try {
      await apiFetch("/auth/reset-password", { method: "POST", body: JSON.stringify({ uid, token, new_password: password }) });
      setDone(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!token || !uid) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: THEME.bg }}>
        <div style={{ color: THEME.danger }}>This link is invalid. <Link to="/forgot-password">Request a new one</Link></div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: THEME.bg, padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 4, padding: 32, boxShadow: "0 10px 30px rgba(15,23,42,0.1)" }}>
        <h2 style={{ fontSize: 17, color: THEME.navy, marginBottom: 18 }}>Set a New Password</h2>
        {done ? (
          <div style={{ color: THEME.success, background: THEME.successLight, padding: 12, borderRadius: 4, fontSize: 13.5 }}>
            Password changed. Redirecting to Login...
          </div>
        ) : (
          <form onSubmit={submit}>
            <div style={{ marginBottom: 12 }}>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" />
            </div>
            <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" />
            {error && <div style={{ color: THEME.danger, fontSize: 13, marginTop: 8 }}>{error}</div>}
            <button type="submit" disabled={busy} style={{
              width: "100%", marginTop: 16, padding: "11px 0", background: THEME.navy, color: "#fff",
              border: "none", borderRadius: 4, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.7 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>{busy ? <SpinnerIcon size={14} /> : <LockIcon size={14} />}{busy ? "Saving..." : "Save Password"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
