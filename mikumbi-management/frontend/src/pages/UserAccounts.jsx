import { useState, useEffect } from "react";
import { passwordProblem } from "../utils/passwordPolicy";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../utils/api";
import { THEME } from "../styles/theme";
import { useConfirm } from "../components/ConfirmDialog";
import { showSuccess } from "../components/SuccessModal";
import { showError } from "../components/ErrorModal";
import { PasswordInput } from "../components/PasswordInput";
import { useBreakpoint } from "../hooks/useBreakpoint";
import ExamTypesManager from "../components/ExamTypesManager";
import { ActionMenu, MenuItem } from "../components/ActionMenu";
import { EditIcon, KeyIcon, PauseCircleIcon, RefreshIcon, TrashIcon, BookIcon, SchoolIcon, ShieldIcon, ClockIcon, PlusCircleIcon, UserHistoryIcon, CheckIcon, CloseIcon, PersonSilhouetteIcon, SpinnerIcon } from "../components/icons";
import { useLang } from "../i18n";
import { roleLabel as roleLabelT } from "../i18n/display";

// Labels come from the i18n role.* keys (roleLabelT), so only the value is
// stored here.
const ROLES = [
  { value: "academic" }, { value: "teacher" }, { value: "patron" },
  { value: "matron" }, { value: "second_master" },
  { value: "class_teacher" }, { value: "food_teacher" },
];
const FORMS = ["Form I", "Form II", "Form III", "Form IV"];

// A user's full permission set is their primary `role` PLUS any `extra
// roles` - used to decide whether Subjects/Classes fields should show
// (hidden only when every held role is a pure hostel role with nothing to
// teach), and to render the "N roles" summary in the accounts list.
// NOTE: Email is NOT gated by this anymore - every role (including a pure
// Patron/Matron) needs an email on file so their account can use Gmail
// "Forgot Password" self-service, same as any other teacher.
const allHeldRoles = (role, extraRoles) => Array.from(new Set([role, ...(extraRoles || [])]));
const needsTeachingFields = (role, extraRoles) => allHeldRoles(role, extraRoles).some((r) => r !== "patron" && r !== "matron");
// Whether this account holds the class_teacher role at all (primary or
// extra) - controls whether "Class Teacher Of" (the ONE class whose
// Contribution Management they see) is shown. Separate from
// `assigned_forms`, which is what they TEACH for Results Management.
const isClassTeacherRole = (role, extraRoles) => allHeldRoles(role, extraRoles).includes("class_teacher");

// A photo shown here mirrors the same `photo_url` column shown on a
// teacher's own account header (Layout.jsx) - a change on one side
// (upload/remove) is reflected on the other automatically, no extra wiring
// needed. Clicking a photo here opens it larger (see `viewPhoto` below),
// like looking at the full profile. Accounts with no uploaded photo yet
// show a plain person-silhouette icon (WhatsApp/Instagram-style default
// avatar) instead of initials.
function AccountAvatar({ name, photoUrl, size = 36, onClick }) {
  const { t } = useLang();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={photoUrl ? t("ua.viewPhotoOf", { name }) : undefined}
      title={photoUrl ? t("ua.viewPhoto") : undefined}
      style={{
        width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
        background: THEME.navy, color: "rgba(255,255,255,0.85)", display: "flex", alignItems: "center", justifyContent: "center",
        border: "none", padding: 0,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {photoUrl
        ? <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <PersonSilhouetteIcon size={size * 0.62} />}
    </button>
  );
}

export default function UserAccounts() {
  const { t, lang } = useLang();
  const { token, user: me } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompactList = isMobile || isTablet;
  const [users, setUsers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [form, setForm] = useState({ username: "", full_name: "", role: "teacher", extra_roles: [], email: "", phone: "", subject_ids: [], assigned_forms: [], class_teacher_of: "", teacher_id: "", employment_type: "Permanent" });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectCode, setNewSubjectCode] = useState("");
  const [editUser, setEditUser] = useState(null); // user object being edited, or null
  const [resetPwdUser, setResetPwdUser] = useState(null); // user object having their password reset, or null
  const [viewPhoto, setViewPhoto] = useState(null); // { photoUrl, name } - enlarged avatar view, or null
  const { confirm, ConfirmDialogPortal } = useConfirm();

  const [loadError, setLoadError] = useState("");

  const load = () => {
    apiFetch("/users", {}, token).then((d) => setUsers(d.data || [])).catch((err) => setLoadError(err.message));
    // Subjects silently staying empty (e.g. because the very first request
    // after a Render cold start timed out) used to look like "subjects
    // disappeared" with zero indication why, until an unrelated action
    // happened to reload them. Retry once automatically before giving up.
    apiFetch("/subjects", {}, token)
      .then((d) => setSubjects(d.data || []))
      .catch(() => apiFetch("/subjects", {}, token).then((d) => setSubjects(d.data || [])).catch((err) => setLoadError(err.message)));
  };
  useEffect(load, [token]);

  const addSubject = async () => {
    if (!newSubjectName.trim() || !newSubjectCode.trim()) return;
    try {
      // Both the full subject name AND its abbreviation are required here -
      // the abbreviation is what Results Management prints in DETAILS
      // SUBJECTS and the SCHOOL EXAMINATION SUBJECT PERFORMANCE table, so a
      // subject added without one would show up there as blank/"null".
      await apiFetch("/subjects", { method: "POST", body: JSON.stringify({ name: newSubjectName.trim(), code: newSubjectCode.trim() }) }, token);
      setNewSubjectName(""); setNewSubjectCode("");
      load();
    } catch (err) { setResult({ ok: false, text: err.message }); }
  };

  const toggleSubject = (id) => setForm((f) => ({
    ...f, subject_ids: f.subject_ids.includes(id) ? f.subject_ids.filter((x) => x !== id) : [...f.subject_ids, id],
  }));
  const toggleForm = (fm) => setForm((f) => ({
    ...f, assigned_forms: f.assigned_forms.includes(fm) ? f.assigned_forms.filter((x) => x !== fm) : [...f.assigned_forms, fm],
  }));
  const toggleExtraRole = (val) => setForm((f) => ({
    ...f, extra_roles: f.extra_roles.includes(val) ? f.extra_roles.filter((x) => x !== val) : [...f.extra_roles, val],
  }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setResult(null);
    try {
      const data = await apiFetch("/users", { method: "POST", body: JSON.stringify(form) }, token);
      setResult({ ok: true, text: data.message });
      showSuccess(t("ua.account"), data.message || t("ua.updated"));
      setForm({ username: "", full_name: "", role: "teacher", extra_roles: [], email: "", phone: "", subject_ids: [], assigned_forms: [], class_teacher_of: "", teacher_id: "", employment_type: "Permanent" });
      load();
    } catch (err) {
      setResult({ ok: false, text: err.message });
    } finally { setBusy(false); }
  };

  const deactivate = (id, name) => confirm(t("ua.deactivateConfirm", { name }), async () => {
    try {
      await apiFetch(`/users/${id}`, { method: "DELETE" }, token);
      showSuccess(t("ua.account"), t("ua.deactivated", { name }));
      load();
    } catch (err) {
      setResult({ ok: false, text: err.message });
    }
  });

  const reactivate = async (id, name) => {
    try {
      await apiFetch(`/users/${id}`, { method: "PATCH", body: JSON.stringify({ is_active: true }) }, token);
      showSuccess(t("ua.account"), name ? t("ua.reactivatedNamed", { name }) : t("ua.reactivatedThe"));
      load();
    } catch (err) { setResult({ ok: false, text: err.message }); }
  };

  const removeUser = (id, name) => confirm(t("ua.deleteConfirm", { name }), async () => {
    try {
      await apiFetch(`/users/${id}/permanent`, { method: "DELETE" }, token);
      showSuccess(t("ua.account"), t("ua.deleted", { name }));
      load();
    } catch (err) {
      setResult({ ok: false, text: err.message });
    }
  }, { danger: true });

  const saveEdit = async (updated) => {
    try {
      await apiFetch(`/users/${updated.id}`, { method: "PATCH", body: JSON.stringify(updated) }, token);
      showSuccess(t("ua.account"), t("ua.updated"));
      setEditUser(null);
      load();
    } catch (err) { showError(t("ua.couldNotUpdate"), err.message); } // modal is on top of the list - the list's error banner wouldn't be visible here
  };

  const resetUserPassword = async (id, newPassword) => {
    await apiFetch(`/users/${id}/reset`, { method: "POST", body: JSON.stringify({ new_password: newPassword }) }, token);
  };

  return (
    <div style={{ padding: isMobile ? "16px 12px" : isTablet ? "24px 20px" : 40 }}>
      <h2 style={{ color: THEME.heading, fontSize: isMobile ? 16 : isTablet ? 18 : 20, marginBottom: 18 }}>{t("ua.title")}</h2>
      {loadError && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 4, fontSize: 13, background: THEME.dangerLight, color: THEME.danger, maxWidth: 480, display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <span>⚠ {loadError}</span>
          <button onClick={() => { setLoadError(""); load(); }} style={{ background: "none", border: `1px solid ${THEME.danger}`, color: THEME.danger, borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5 }}><RefreshIcon size={12} />{t("common.retry")}</button>
        </div>
      )}

      {/* Create account: one card, three clear sections (details, role, teaching).
          Two columns on tablet/desktop, one column on phones. */}
      <form onSubmit={submit} style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 6, marginBottom: 28, maxWidth: PANEL_MAX, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
        <div style={{ padding: isMobile ? "14px 16px" : "16px 22px", borderBottom: `1px solid ${THEME.border}` }}>
          <h3 style={{ margin: 0, fontSize: 16, color: THEME.heading }}>{t("ua.createNew")}</h3>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: THEME.muted }}>{t("ua.createIntro")}</p>
        </div>

        <div style={{ padding: isMobile ? 14 : 22, display: "grid", gap: isMobile ? 14 : 18, background: THEME.bg }}>
          <FormSection step={1} title={t("ua.sec1Title")} desc={t("ua.sec1Desc")} isMobile={isMobile}>
            <div style={grid2(isMobile)}>
              <Field label={t("ua.username")} required>
                <input placeholder={t("ua.usernamePh")} required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} style={fieldInput} />
              </Field>
              <Field label={t("ua.fullName")} required>
                <input placeholder={t("ua.fullNamePh")} required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} style={fieldInput} />
              </Field>
              <Field label={t("ua.phone")} hint={t("ua.phoneHint")}>
                <input type="tel" placeholder={t("ua.phonePh") || "e.g. 0677123443"} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={fieldInput} />
              </Field>
              <Field label={t("ua.email")} required hint={t("ua.emailHint")}>
                <input type="email" placeholder={t("ua.emailPh")} required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={fieldInput} />
              </Field>
            </div>
          </FormSection>

          <FormSection step={2} title={t("ua.sec2Title")} desc={t("ua.sec2Desc")} isMobile={isMobile}>
            <div style={{ ...grid2(isMobile), alignItems: "start" }}>
              <Field label={t("ua.mainRole")} required>
                <select value={form.role} onChange={(e) => {
                  const newRole = e.target.value;
                  setForm((f) => ({ ...f, role: newRole, extra_roles: f.extra_roles.filter((x) => x !== newRole) }));
                }} style={{ ...fieldInput, background: THEME.surface }}>
                  {ROLES.filter((r) => r.value !== "second_master" || me.role === "admin").map((r) => <option key={r.value} value={r.value}>{roleLabelT(lang, r.value)}</option>)}
                </select>
              </Field>
              <Field label={t("ua.employment")}>
                <EmploymentTypeCheckbox value={form.employment_type} onChange={(v) => setForm({ ...form, employment_type: v })} />
              </Field>
            </div>
            <Field label={t("ua.extraRoles")} hint={t("ua.extraRolesHint")}>
              <div style={chipsBox}>
                {ROLES.filter((r) => r.value !== form.role && (r.value !== "second_master" || me.role === "admin")).map((r) => (
                  <Chip key={r.value} active={form.extra_roles.includes(r.value)} onClick={() => toggleExtraRole(r.value)}>{roleLabelT(lang, r.value)}</Chip>
                ))}
              </div>
            </Field>
          </FormSection>

          {needsTeachingFields(form.role, form.extra_roles) && (
            <FormSection step={3} title={t("ua.sec3Title")} desc={t("ua.sec3Desc")} isMobile={isMobile}>
              <Field label={t("ua.subjects")} hint={t("ua.subjectsHint")}>
                <div style={chipsBox}>
                  {subjects.map((s) => (
                    <Chip key={s.id} active={form.subject_ids.includes(s.id)} onClick={() => toggleSubject(s.id)}>{s.name}</Chip>
                  ))}
                </div>
              </Field>
              <div style={{ background: THEME.bg, border: `1px dashed ${THEME.border}`, borderRadius: 4, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: THEME.text, marginBottom: 8 }}>{t("ua.subjectMissing")}</div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr auto", gap: 8 }}>
                  <input placeholder={t("ua.subjectNamePh")} value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)} style={{ ...fieldInput, background: THEME.surface }} aria-label={t("ua.subjectNameAria")} />
                  <input placeholder={t("ua.subjectCodePh")} value={newSubjectCode} onChange={(e) => setNewSubjectCode(e.target.value)} style={{ ...fieldInput, background: THEME.surface }} aria-label={t("ua.subjectCodeAria")} />
                  <button type="button" onClick={addSubject} disabled={!newSubjectName.trim() || !newSubjectCode.trim()} style={{ padding: "9px 16px", background: THEME.surface, color: THEME.link, border: `1px solid ${THEME.navy}`, borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: !newSubjectName.trim() || !newSubjectCode.trim() ? 0.5 : 1 }}><PlusCircleIcon size={13} />{t("common.add")}</button>
                </div>
                <p style={{ fontSize: 11.5, color: THEME.muted, margin: "6px 0 0" }}>{t("ua.subjectBothRequired")}</p>
              </div>
              <div style={{ ...grid2(isMobile), alignItems: "start" }}>
                <Field label={t("ua.classesTaught")} hint={t("ua.classesHint")}>
                  <div style={chipsBox}>
                    {FORMS.map((f) => (
                      <Chip key={f} active={form.assigned_forms.includes(f)} onClick={() => toggleForm(f)}>{f}</Chip>
                    ))}
                  </div>
                </Field>
                {isClassTeacherRole(form.role, form.extra_roles) && (
                  <Field label={t("ua.classTeacherOf")} hint={t("ua.classTeacherOfHint")}>
                    <select value={form.class_teacher_of} onChange={(e) => setForm({ ...form, class_teacher_of: e.target.value })} style={{ ...fieldInput, background: THEME.surface }}>
                      <option value="">{t("ua.selectClass")}</option>
                      {FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </Field>
                )}
              </div>
            </FormSection>
          )}
        </div>

        <div style={{ padding: isMobile ? "14px 16px" : "14px 22px", borderTop: `1px solid ${THEME.border}`, background: THEME.bg, display: "flex", flexDirection: isMobile ? "column-reverse" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 10, borderRadius: "0 0 6px 6px" }}>
          <div style={{ fontSize: 12.5, color: result ? (result.ok ? THEME.success : THEME.danger) : THEME.muted }}>
            {result ? result.text : <>{t("ua.fieldsMarkedPre")} <span style={{ color: THEME.danger }}>*</span> {t("ua.fieldsMarkedPost")}</>}
          </div>
          <button disabled={busy} style={{ padding: "10px 22px", minWidth: isMobile ? undefined : 190, background: THEME.navy, color: "#fff", border: "none", borderRadius: 4, fontWeight: 700, fontSize: 13.5, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            {busy ? <SpinnerIcon size={14} /> : <UserHistoryIcon size={14} />}{busy ? t("ua.creating") : t("ua.createAccount")}
          </button>
        </div>
      </form>

      {[me?.role, ...(me?.roles || [])].some((r) => r === "admin" || r === "second_master") && (
        <ExamTypesManager token={token} isMobile={isMobile} />
      )}

      <div style={isCompactList ? { display: "grid", gap: 10 } : { background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4 }}>
        {result && !result.ok && (
          <p style={{ margin: isCompactList ? "0 0 4px" : 0, padding: "10px 16px", fontSize: 12.5, color: THEME.danger, background: THEME.dangerLight, borderRadius: 4, borderBottom: isCompactList ? "none" : `1px solid ${THEME.border}` }}>{result.text}</p>
        )}
        {users.map((u, i) => {
          const canManageThisTarget = u.role !== "second_master" || me.role === "admin";
          const menu = ((u.role !== "admin" && u.role !== "developer") || u.id === me.id) && (
            <ActionMenu>
              <MenuItem icon={<EditIcon />} onClick={() => setEditUser(u)}>{t("common.edit")}</MenuItem>
              <MenuItem icon={<KeyIcon />} onClick={() => setResetPwdUser(u)}>{t("ua.resetPassword")}</MenuItem>
              {u.role !== "admin" && canManageThisTarget && (u.is_active
                ? <MenuItem icon={<PauseCircleIcon />} onClick={() => deactivate(u.id, u.full_name)}>{t("ua.deactivate")}</MenuItem>
                : <MenuItem icon={<RefreshIcon />} onClick={() => reactivate(u.id, u.full_name)}>{t("ua.reactivate")}</MenuItem>)}
              {u.role !== "admin" && canManageThisTarget && (
                <MenuItem icon={<TrashIcon />} danger onClick={() => removeUser(u.id, u.full_name)}>{t("ua.deleteRemove")}</MenuItem>
              )}
            </ActionMenu>
          );
          const statusBadge = (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: u.is_active ? THEME.successLight : THEME.dangerLight, color: u.is_active ? THEME.success : THEME.danger }}>
              {u.is_active ? t("ua.active") : t("ua.inactive")}
            </span>
          );
          const rolePill = (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: THEME.navy, padding: "3px 10px", borderRadius: 4, lineHeight: 1.4 }}>
              {allHeldRoles(u.role, u.extra_roles).map((r) => roleLabelT(lang, r)).join(" + ")}
            </span>
          );
          const employmentBadge = (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "3px 9px 3px 7px", borderRadius: 4,
              background: u.employment_type === "Temporary" ? THEME.warningLight : THEME.successLight,
              color: u.employment_type === "Temporary" ? THEME.warning : THEME.success,
            }}>
              {u.employment_type === "Temporary" ? <ClockIcon size={11} /> : <ShieldIcon size={11} />}
              {u.employment_type === "Temporary" ? t("ua.partTime") : t("ua.government")}
            </span>
          );
          return isCompactList ? (
            // ── MOBILE / TABLET: a self-contained card per account, easier to
            // scan and tap than a dense multi-column row squeezed onto a
            // narrow screen. ──
            <div key={u.id} className="account-card" style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: isMobile ? "12px 14px" : "14px 18px", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                  <AccountAvatar name={u.full_name} photoUrl={u.photo_url} size={38}
                    onClick={u.photo_url ? () => setViewPhoto({ photoUrl: u.photo_url, name: u.full_name }) : undefined} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: isMobile ? 13.5 : 14, color: THEME.text, overflowWrap: "anywhere" }}>{u.full_name}</div>
                    <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 2 }}>@{u.username}{u.phone ? ` · ${u.phone}` : ""}</div>
                  </div>
                </div>
                {menu}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, alignItems: "center" }}>
                {rolePill}
                {employmentBadge}
                {statusBadge}
              </div>
              {(u.subject_names?.length > 0 || u.assigned_forms?.length > 0 || u.class_teacher_of) && (
                <div style={{ display: "grid", gap: 5, marginTop: 9, paddingTop: 9, borderTop: `1px solid ${THEME.border}` }}>
                  {u.subject_names?.length > 0 && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 11.5, color: THEME.muted }}>
                      <span style={{ display: "flex", flexShrink: 0, marginTop: 1, color: THEME.heading, opacity: 0.75 }}><BookIcon size={13} /></span>
                      <span style={{ overflowWrap: "anywhere" }}>{u.subject_names.join(", ")}</span>
                    </div>
                  )}
                  {u.assigned_forms?.length > 0 && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 11.5, color: THEME.muted }}>
                      <span style={{ display: "flex", flexShrink: 0, marginTop: 1, color: THEME.heading, opacity: 0.75 }}><SchoolIcon size={13} /></span>
                      <span style={{ overflowWrap: "anywhere" }}>{t("ua.teaches", { forms: u.assigned_forms.join(", ") })}</span>
                    </div>
                  )}
                  {u.class_teacher_of && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 11.5, color: THEME.muted }}>
                      <span style={{ display: "flex", flexShrink: 0, marginTop: 1, color: THEME.heading, opacity: 0.75 }}><SchoolIcon size={13} /></span>
                      <span style={{ overflowWrap: "anywhere" }}>{t("ua.classTeacherOfLabel")} <b>{u.class_teacher_of}</b></span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            // ── DESKTOP row: the account's DETAILS (name, roles, subjects,
            // classes taught, class-teacher-of) live in a flexible middle
            // section that wraps onto extra lines as needed when an account
            // holds a lot of roles/subjects (e.g. Teacher + Class Teacher +
            // Food Teacher + School Patron). The Employment badge, Active/
            // Inactive badge, and the ⋮ actions menu live in their OWN fixed
            // right-hand cluster (flexShrink: 0) so they NEVER get pushed
            // down onto a wrapped line — they stay put in the same spot on
            // the right regardless of how much other detail an account has.
            <div key={u.id} className="account-card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 16px", borderTop: i > 0 ? `1px solid ${THEME.border}` : "none", fontSize: 13 }}>
              <AccountAvatar name={u.full_name} photoUrl={u.photo_url} size={34}
                onClick={u.photo_url ? () => setViewPhoto({ photoUrl: u.photo_url, name: u.full_name }) : undefined} />
              <div style={{ flex: 1, minWidth: 160, display: "flex", flexWrap: "wrap", alignItems: "center", rowGap: 6, columnGap: 14 }}>
                <span>{u.full_name} <span style={{ color: THEME.muted, fontSize: 11 }}>({u.username}{u.phone ? ` · ${u.phone}` : ""})</span></span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: THEME.heading }}>{allHeldRoles(u.role, u.extra_roles).map((r) => roleLabelT(lang, r)).join(" + ")}</span>
                {u.subject_names?.length > 0 && <span style={{ fontSize: 11.5, color: THEME.muted }}>{u.subject_names.join(", ")}</span>}
                {u.assigned_forms?.length > 0 && <span style={{ fontSize: 11.5, color: THEME.muted }}>{t("ua.teaches", { forms: u.assigned_forms.join(", ") })}</span>}
                {u.class_teacher_of && <span style={{ fontSize: 11.5, color: THEME.muted }}>{t("ua.classTeacherOfLabel")} <b>{u.class_teacher_of}</b></span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {employmentBadge}
                {statusBadge}
                {/* The Head Master (admin) account can never be deactivated or
                    deleted (the backend refuses it either way), so that row only
                    gets Edit + Reset Password, and only when it's your OWN
                    account - a Second Master must never see actions on the Head
                    Master's row. Every other account gets the full menu. */}
                {menu}
              </div>
            </div>
          );
        })}
      </div>
      {ConfirmDialogPortal}
      {editUser && (
        <EditUserModal user={editUser} subjects={subjects} myRole={me.role} onClose={() => setEditUser(null)} onSave={saveEdit} />
      )}
      {resetPwdUser && (
        <ResetPasswordModal
          user={resetPwdUser}
          onClose={() => setResetPwdUser(null)}
          onSubmit={async (newPassword) => {
            await resetUserPassword(resetPwdUser.id, newPassword);
            showSuccess(t("ua.passwordResetTitle"), t("ua.passwordResetDone", { name: resetPwdUser.full_name }));
            setResetPwdUser(null);
          }}
        />
      )}
      {viewPhoto && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) setViewPhoto(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9700, padding: 16 }}
        >
          <div style={{ background: "#0E355C", borderRadius: 4, padding: 22, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.12)", maxWidth: "90vw" }}>
            <div style={{ width: 200, height: 200, maxWidth: "70vw", maxHeight: "70vw", borderRadius: "50%", overflow: "hidden", margin: "0 auto 14px", border: "2px solid rgba(255,255,255,0.2)" }}>
              <img src={viewPhoto.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>{viewPhoto.name}</div>
            <button onClick={() => setViewPhoto(null)} style={{ marginTop: 14, padding: "9px 20px", background: THEME.gold, color: THEME.navyDark, border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              {t("common.close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditUserModal({ user, subjects, onClose, onSave, myRole }) {
  const { t, lang } = useLang();
  const isHeadMaster = user.role === "admin";
  const [f, setF] = useState({
    id: user.id, username: user.username, full_name: user.full_name, email: user.email || "", phone: user.phone || "",
    role: user.role, extra_roles: [...(user.extra_roles || [])],
    subject_ids: [...(user.subject_ids || [])], assigned_forms: [...(user.assigned_forms || [])],
    class_teacher_of: user.class_teacher_of || "",
    employment_type: user.employment_type || "Permanent",
  });
  const toggleSubject = (id) => setF((p) => ({ ...p, subject_ids: p.subject_ids.includes(id) ? p.subject_ids.filter((x) => x !== id) : [...p.subject_ids, id] }));
  const toggleForm = (fm) => setF((p) => ({ ...p, assigned_forms: p.assigned_forms.includes(fm) ? p.assigned_forms.filter((x) => x !== fm) : [...p.assigned_forms, fm] }));
  const toggleExtraRole = (val) => setF((p) => ({ ...p, extra_roles: p.extra_roles.includes(val) ? p.extra_roles.filter((x) => x !== val) : [...p.extra_roles, val] }));
  // Subjects/Classes are shown as soon as ANY held role (primary OR
  // additional) needs them - hidden only when every role on the account is
  // Patron/Matron (pure hostel roles with nothing to teach). This covers
  // whichever roles are currently selected, so assigning a subject + class
  // right after changing/adding a role works in one step, and that's what
  // lets them enter results for the subject(s)/class(es) they teach.
  // Email is shown for every role - Patron/Matron accounts need one too,
  // so they can use Gmail "Forgot Password" self-service.
  const showsSubjects = needsTeachingFields(f.role, f.extra_roles);
  const showsForms = needsTeachingFields(f.role, f.extra_roles);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000, padding: 16 }}>
      <div style={{ background: THEME.surface, borderRadius: 4, padding: 22, width: "100%", maxWidth: 460, maxHeight: "85vh", overflowY: "auto" }}>
        <h3 style={{ marginTop: 0, marginBottom: 16, color: THEME.heading, fontSize: 16 }}>{t("ua.editTitle", { name: user.username })}</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <label style={labelStyle}>{t("ua.usernameLogin")}</label>
            <input placeholder={t("ua.username")} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t("ua.phoneSms")}</label>
            <input type="tel" placeholder="e.g. 0677123443" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} style={inputStyle} />
          </div>
          <EmploymentTypeCheckbox value={f.employment_type} onChange={(v) => setF({ ...f, employment_type: v })} />
          {isHeadMaster ? (
            <p style={{ margin: 0, fontSize: 12, color: THEME.muted }}>
              {t("ua.headMasterFixed")}
            </p>
          ) : (
            <>
              <input placeholder={t("ua.fullName")} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} style={inputStyle} />
              <div>
                <label style={labelStyle}>{t("ua.role")}</label>
                <select value={f.role} onChange={(e) => {
                  const newRole = e.target.value;
                  setF((p) => ({ ...p, role: newRole, extra_roles: p.extra_roles.filter((x) => x !== newRole) }));
                }} style={inputStyle}>
                  {ROLES.filter((r) => r.value !== "second_master" || myRole === "admin").map((r) => <option key={r.value} value={r.value}>{roleLabelT(lang, r.value)}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t("ua.extraRolesLong")}</label>
                <div style={chipsBox}>
                  {ROLES.filter((r) => r.value !== f.role && (r.value !== "second_master" || myRole === "admin")).map((r) => (
                    <Chip key={r.value} active={f.extra_roles.includes(r.value)} onClick={() => toggleExtraRole(r.value)}>{roleLabelT(lang, r.value)}</Chip>
                  ))}
                </div>
              </div>
            </>
          )}
          <input type="email" placeholder={t("ua.gmailPh")} required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} style={inputStyle} />
          {showsSubjects && (
            <div>
              <label style={labelStyle}>{t("ua.subjectsTaught")}</label>
              <div style={chipsBox}>
                {subjects.map((s) => <Chip key={s.id} active={f.subject_ids.includes(s.id)} onClick={() => toggleSubject(s.id)}>{s.name}</Chip>)}
              </div>
            </div>
          )}
          {showsForms && (
            <div>
              <label style={labelStyle}>{t("ua.classesLong")}</label>
              <div style={chipsBox}>
                {FORMS.map((fm) => <Chip key={fm} active={f.assigned_forms.includes(fm)} onClick={() => toggleForm(fm)}>{fm}</Chip>)}
              </div>
            </div>
          )}
          {isClassTeacherRole(f.role, f.extra_roles) && (
            <div>
              <label style={labelStyle}>{t("ua.classTeacherOfLong")}</label>
              <select value={f.class_teacher_of} onChange={(e) => setF({ ...f, class_teacher_of: e.target.value })} style={inputStyle}>
                <option value="">{t("ua.selectClass")}</option>
                {FORMS.map((fm) => <option key={fm} value={fm}>{fm}</option>)}
              </select>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: "9px 16px", background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, cursor: "pointer", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}><CloseIcon size={13} />{t("common.cancel")}</button>
          <button onClick={() => onSave(isHeadMaster ? { ...f, role: undefined, extra_roles: undefined } : f)} style={{ padding: "9px 16px", background: THEME.navy, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}><CheckIcon size={13} />{t("common.save")}</button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordModal({ user, onClose, onSubmit }) {
  const { t } = useLang();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const pwErr = passwordProblem(newPassword);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("ua.pwMismatch"));
      return;
    }
    setBusy(true);
    try {
      await onSubmit(newPassword);
      // Success: the parent closes (unmounts) this modal right after -
      // don't touch state here, or React will warn about setting state
      // on an unmounted component.
    } catch (err) {
      setError(err.message || t("ua.resetFail"));
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000, padding: 16 }}>
      <form onSubmit={submit} style={{ background: THEME.surface, borderRadius: 4, padding: 22, width: 380, maxWidth: "100%" }}>
        <h3 style={{ marginTop: 0, marginBottom: 6, color: THEME.heading, fontSize: 16 }}>{t("ua.resetPassword")}</h3>
        <p style={{ margin: "0 0 16px", fontSize: 12.5, color: THEME.muted }}>
          {t("ua.resetIntro", { name: user.full_name, username: user.username })}
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <label style={labelStyle}>{t("ua.newPassword")}</label>
            <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t("ua.pwPh")} autoFocus />
          </div>
          <div>
            <label style={labelStyle}>{t("ua.confirmPassword")}</label>
            <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t("ua.confirmPwPh")} />
          </div>
        </div>
        {error && (
          <div style={{ marginTop: 12, color: THEME.danger, background: THEME.dangerLight, fontSize: 12.5, padding: "9px 12px", borderRadius: 4 }}>{error}</div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" onClick={onClose} style={{ padding: "9px 16px", background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, cursor: "pointer", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}><CloseIcon size={13} />{t("common.cancel")}</button>
          <button type="submit" disabled={busy} style={{ padding: "9px 16px", background: THEME.navy, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: busy ? 0.7 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}>
            {busy ? <SpinnerIcon size={13} /> : <KeyIcon size={13} />}{busy ? t("common.saving") : t("ua.resetPassword")}
          </button>
        </div>
      </form>
    </div>
  );
}

// A single checkbox: ticked = Government (Permanent employee), unticked =
// Temporary. Large touch target and a short helper
// line under it so the meaning is unambiguous on a phone/tablet, where a
// bare checkbox + label is easy to mis-tap or misread.
function EmploymentTypeCheckbox({ value, onChange }) {
  const { t } = useLang();
  const checked = value !== "Temporary";
  return (
    <label style={{
      display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px",
      background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 4, cursor: "pointer",
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked ? "Permanent" : "Temporary")}
        style={{ width: 19, height: 19, marginTop: 1, accentColor: THEME.navy, cursor: "pointer", flexShrink: 0 }}
      />
      <span style={{ fontSize: 12.5, color: THEME.text, lineHeight: 1.5 }}>
        <b>{t("ua.permanentGov")}</b>
        <br />
        <span style={{ color: THEME.muted, fontSize: 11.5 }}>
          {checked
            ? t("ua.checkedGov")
            : t("ua.uncheckedPartTime")}
        </span>
      </span>
    </label>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: "5px 12px", borderRadius: 4, border: `1px solid ${active ? THEME.navy : THEME.border}`,
      background: active ? THEME.navy : THEME.surface, color: active ? "#fff" : THEME.text,
      fontSize: 12, cursor: "pointer",
    }}>{children}</button>
  );
}


const inputStyle = { padding: "9px 12px", border: `1px solid ${THEME.border}`, borderRadius: 4, fontSize: 13 };
// Create-account form layout helpers.
const PANEL_MAX = 900;
const fieldInput = { ...inputStyle, width: "100%", boxSizing: "border-box", fontSize: 13.5, padding: "10px 12px", color: THEME.text, background: THEME.surface };
const grid2 = (isMobile) => ({ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 14 : "14px 18px" });
// Each part of the form is its own card: a numbered header (step, title,
// one-line explanation) and the fields below it, so a first-time user can
// see at a glance what to fill in and in which order.
function FormSection({ step, title, desc, isMobile, children }) {
  return (
    <section style={{ border: `1px solid ${THEME.border}`, borderRadius: 6, background: THEME.surface, overflow: "hidden", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: isMobile ? "11px 14px" : "12px 18px", background: `color-mix(in srgb, ${THEME.link} 7%, ${THEME.surface})`, borderBottom: `1px solid ${THEME.border}` }}>
        {step != null && (
          <span aria-hidden="true" style={{ flex: "none", width: 26, height: 26, borderRadius: "50%", background: THEME.navy, color: "#fff", fontSize: 13, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{step}</span>
        )}
        <div style={{ minWidth: 0 }}>
          <h4 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: THEME.heading }}>{title}</h4>
          {desc && <p style={{ margin: "2px 0 0", fontSize: 12, color: THEME.muted, lineHeight: 1.45 }}>{desc}</p>}
        </div>
      </header>
      <div style={{ padding: isMobile ? 14 : 18, display: "grid", gap: 14 }}>
        {children}
      </div>
    </section>
  );
}
function Field({ label, required, hint, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.text, marginBottom: 6 }}>{label}{required && <span style={{ color: THEME.danger }}> *</span>}</div>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 5, lineHeight: 1.45 }}>{hint}</div>}
    </div>
  );
}
const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 };
const chipsBox = { display: "flex", flexWrap: "wrap", gap: 6 };
