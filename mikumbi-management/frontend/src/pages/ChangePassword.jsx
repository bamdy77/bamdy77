import { useState } from "react";
import { passwordProblem } from "../utils/passwordPolicy";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../utils/api";
import { THEME } from "../styles/theme";
import { PasswordInput } from "../components/PasswordInput";
import { showSuccess } from "../components/SuccessModal";
import { LockIcon, SpinnerIcon } from "../components/icons";
import { useLang } from "../i18n";

export default function ChangePassword() {
  const { token, user, replaceToken } = useAuth();
  const { t } = useLang();
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

    const pwErr = passwordProblem(newPassword);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("pw.noMatchNew"));
      return;
    }
    if (newPassword === oldPassword) {
      setError(t("pw.sameAsOld"));
      return;
    }

    setBusy(true);
    try {
      const r = await apiFetch(
        "/auth/change-password",
        { method: "POST", body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }) },
        token
      );
      if (r && r.token) replaceToken(r.token);
      reset();
      showSuccess(t("pw.changedTitle"), t("pw.changedText"));
    } catch (err) {
      setError(err.message || t("pw.changeFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: "clamp(16px, 4vw, 40px)", maxWidth: 480 }}>
      <h2 style={{ color: THEME.heading, fontSize: 20, marginBottom: 4 }}>{t("pw.changeTitle")}</h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 24 }}>
        {t("pw.changeIntro", { name: user.username || user.full_name })}
      </p>

      <form onSubmit={submit} style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: 24 }}>
        <Field label={t("pw.current")}>
          <PasswordInput
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            placeholder={t("pw.currentPh")}
            autoFocus
          />
        </Field>

        <Field label={t("pw.new")}>
          <PasswordInput
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t("pw.newPh")}
          />
        </Field>

        <Field label={t("pw.confirmNew")} last>
          <PasswordInput
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t("pw.confirmPh")}
          />
        </Field>

        {error && (
          <div style={{ color: THEME.danger, background: THEME.dangerLight, fontSize: 13, padding: "10px 12px", borderRadius: 4, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={busy} style={{
          width: "100%", padding: "12px 0", background: THEME.navy, color: "#fff",
          border: "none", borderRadius: 4, fontWeight: 700, fontSize: 14, cursor: "pointer",
          opacity: busy ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>{busy ? <SpinnerIcon size={15} /> : <LockIcon size={15} />}{busy ? t("common.saving") : t("pw.saveNew")}</button>
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
