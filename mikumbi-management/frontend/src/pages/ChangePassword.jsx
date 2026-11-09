import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../utils/api";
import { THEME } from "../styles/theme";
import { PasswordInput } from "../components/PasswordInput";
import { showSuccess } from "../components/SuccessModal";
import { LockIcon, SpinnerIcon } from "../components/icons";

export default function ChangePassword() {
  const { token, user } = useAuth();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) return null; // guards the brief moment during a route/auth transition before `user` is populated

  const reset = () => {
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (newPassword === oldPassword) {
      setError("New password must be different from the old password.");
      return;
    }

    setBusy(true);
    try {
      await apiFetch(
        "/auth/change-password",
        { method: "POST", body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }) },
        token
      );
      reset();
      showSuccess("Password Changed", "Your password has been changed successfully. Use it next time you log in.");
    } catch (err) {
      setError(err.message || "Could not change password. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 40, maxWidth: 480 }}>
      <h2 style={{ color: THEME.heading, fontSize: 20, marginBottom: 4 }}>Change Password</h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 24 }}>
        Update the password for your account ({user.username || user.full_name}).
      </p>

      <form onSubmit={submit} style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, padding: 24 }}>
        <Field label="Current Password">
          <PasswordInput
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            placeholder="Enter your current password"
            autoFocus
          />
        </Field>

        <Field label="New Password">
          <PasswordInput
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 6 characters"
          />
        </Field>

        <Field label="Confirm New Password" last>
          <PasswordInput
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter the new password"
          />
        </Field>

        {error && (
          <div style={{ color: THEME.danger, background: THEME.dangerLight, fontSize: 13, padding: "10px 12px", borderRadius: 0, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={busy} style={{
          width: "100%", padding: "12px 0", background: THEME.navy, color: "#fff",
          border: "none", borderRadius: 0, fontWeight: 700, fontSize: 14, cursor: "pointer",
          opacity: busy ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>{busy ? <SpinnerIcon size={15} /> : <LockIcon size={15} />}{busy ? "Saving..." : "Save New Password"}</button>
      </form>
    </div>
  );
}

function Field({ label, children, last }) {
  return (
    <div style={{ marginBottom: last ? 20 : 16 }}>
      <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: THEME.text, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}
