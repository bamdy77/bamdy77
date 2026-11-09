import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../utils/api";
import { THEME } from "../styles/theme";
import { useConfirm } from "../components/ConfirmDialog";
import { showSuccess } from "../components/SuccessModal";
import { showError } from "../components/ErrorModal";
import { PasswordInput } from "../components/PasswordInput";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { DotsVerticalIcon, EditIcon, KeyIcon, PauseCircleIcon, RefreshIcon, TrashIcon, BookIcon, SchoolIcon, ShieldIcon, ClockIcon, PlusCircleIcon, UserHistoryIcon, CheckIcon, CloseIcon, PersonSilhouetteIcon, SpinnerIcon } from "../components/icons";

const ROLES = [
  { value: "academic", label: "Academic Master" },
  { value: "teacher", label: "Teacher" },
  { value: "patron", label: "School Patron" },
  { value: "matron", label: "School Matron" },
  { value: "second_master", label: "Second Master" },
  { value: "class_teacher", label: "Class Teacher" },
  { value: "food_teacher", label: "Food Teacher" },
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
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={photoUrl ? `View ${name}'s photo` : undefined}
      title={photoUrl ? "View photo" : undefined}
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
      showSuccess("Account", data.message || "Account Successfully Created.");
      setForm({ username: "", full_name: "", role: "teacher", extra_roles: [], email: "", phone: "", subject_ids: [], assigned_forms: [], class_teacher_of: "", teacher_id: "", employment_type: "Permanent" });
      load();
    } catch (err) {
      setResult({ ok: false, text: err.message });
    } finally { setBusy(false); }
  };

  const deactivate = (id, name) => confirm(`Are you sure you want to deactivate the account for ${name}?`, async () => {
    try {
      await apiFetch(`/users/${id}`, { method: "DELETE" }, token);
      showSuccess("Account", `${name}'s account has been deactivated.`);
      load();
    } catch (err) {
      setResult({ ok: false, text: err.message });
    }
  });

  const reactivate = async (id, name) => {
    try {
      await apiFetch(`/users/${id}`, { method: "PATCH", body: JSON.stringify({ is_active: true }) }, token);
      showSuccess("Account", `${name ? name + "'s" : "The"} account has been reactivated.`);
      load();
    } catch (err) { setResult({ ok: false, text: err.message }); }
  };

  const removeUser = (id, name) => confirm(`Permanently delete the account for ${name}? This cannot be undone.`, async () => {
    try {
      await apiFetch(`/users/${id}/permanent`, { method: "DELETE" }, token);
      showSuccess("Account", `${name}'s account has been permanently deleted.`);
      load();
    } catch (err) {
      setResult({ ok: false, text: err.message });
    }
  }, { danger: true });

  const saveEdit = async (updated) => {
    try {
      await apiFetch(`/users/${updated.id}`, { method: "PATCH", body: JSON.stringify(updated) }, token);
      showSuccess("Account", "Account Successfully Updated.");
      setEditUser(null);
      load();
    } catch (err) { showError("Could Not Update Account", err.message); } // modal is on top of the list - the list's error banner wouldn't be visible here
  };

  const resetUserPassword = async (id, newPassword) => {
    await apiFetch(`/users/${id}/reset`, { method: "POST", body: JSON.stringify({ new_password: newPassword }) }, token);
  };

  return (
    <div style={{ padding: isMobile ? "16px 12px" : isTablet ? "24px 20px" : 40 }}>
      <h2 style={{ color: THEME.heading, fontSize: isMobile ? 16 : isTablet ? 18 : 20, marginBottom: 18 }}>User Accounts</h2>
      {loadError && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, fontSize: 13, background: THEME.dangerLight, color: THEME.danger, maxWidth: 480, display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <span>⚠ {loadError}</span>
          <button onClick={() => { setLoadError(""); load(); }} style={{ background: "none", border: `1px solid ${THEME.danger}`, color: THEME.danger, borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5 }}><RefreshIcon size={12} />Retry</button>
        </div>
      )}

      <form onSubmit={submit} style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: isMobile ? 16 : 18, marginBottom: 28, maxWidth: isMobile ? "100%" : isTablet ? 560 : 480, display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
          <input placeholder="Username" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} style={inputStyle} />
          <input placeholder="Full Name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <input type="tel" placeholder="Phone Number, e.g. 0754xxxxxx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={{ ...inputStyle, width: "100%" }} />
          <p style={{ fontSize: 11, color: THEME.muted, margin: "4px 0 0" }}>Used for SMS Service - this account's name and number will show up under Communications → SMS Service automatically.</p>
        </div>
        <EmploymentTypeCheckbox value={form.employment_type} onChange={(v) => setForm({ ...form, employment_type: v })} />
        <select value={form.role} onChange={(e) => {
          const newRole = e.target.value;
          setForm((f) => ({ ...f, role: newRole, extra_roles: f.extra_roles.filter((x) => x !== newRole) }));
        }} style={inputStyle}>
          {ROLES.filter((r) => r.value !== "second_master" || me.role === "admin").map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <div>
          <label style={labelStyle}>Additional Roles (optional) - a teacher can hold more than one Role at once</label>
          <div style={chipsBox}>
            {ROLES.filter((r) => r.value !== form.role && (r.value !== "second_master" || me.role === "admin")).map((r) => (
              <Chip key={r.value} active={form.extra_roles.includes(r.value)} onClick={() => toggleExtraRole(r.value)}>{r.label}</Chip>
            ))}
          </div>
        </div>
        <input type="email" placeholder="Gmail (for Forgot Password)" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} />
        {needsTeachingFields(form.role, form.extra_roles) && (
          <>
            <div>
              <label style={labelStyle}>Subjects (a teacher may teach more than one)</label>
              <div style={chipsBox}>
                {subjects.map((s) => (
                  <Chip key={s.id} active={form.subject_ids.includes(s.id)} onClick={() => toggleSubject(s.id)}>{s.name}</Chip>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 6, marginTop: 8 }}>
                <input placeholder="Subject missing? Type full name here" value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)} style={{ ...inputStyle, flex: 2, fontSize: 12, width: isMobile ? "100%" : undefined }} />
                <input placeholder="Abbreviation (e.g. B/MATH)" value={newSubjectCode} onChange={(e) => setNewSubjectCode(e.target.value)} style={{ ...inputStyle, flex: 1, fontSize: 12, width: isMobile ? "100%" : undefined }} />
                <button type="button" onClick={addSubject} disabled={!newSubjectName.trim() || !newSubjectCode.trim()} style={{ padding: isMobile ? "9px 12px" : "0 12px", background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 8, fontSize: 12, cursor: "pointer", width: isMobile ? "100%" : undefined, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}><PlusCircleIcon size={13} />Add</button>
              </div>
              <p style={{ fontSize: 10.5, color: THEME.muted, marginTop: 4 }}>Both the full subject name and its abbreviation are required - the abbreviation is what appears in Results Management.</p>
            </div>
            <div>
              <label style={labelStyle}>Classes / Forms Taught (determines which class's results/subjects this account can enter in Results Management)</label>
              <div style={chipsBox}>
                {FORMS.map((f) => (
                  <Chip key={f} active={form.assigned_forms.includes(f)} onClick={() => toggleForm(f)}>{f}</Chip>
                ))}
              </div>
            </div>
            {isClassTeacherRole(form.role, form.extra_roles) && (
              <div>
                <label style={labelStyle}>Class Teacher Of - the ONE class whose students appear automatically in Contribution Management</label>
                <select value={form.class_teacher_of} onChange={(e) => setForm({ ...form, class_teacher_of: e.target.value })} style={inputStyle}>
                  <option value="">- Select class -</option>
                  {FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            )}
          </>
        )}
        <button disabled={busy} style={{ padding: "10px 0", background: THEME.navy, color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
          {busy ? <SpinnerIcon size={14} /> : <UserHistoryIcon size={14} />}{busy ? "Creating..." : "Create Account"}
        </button>
        {result && (
          <p style={{ fontSize: 12.5, color: result.ok ? THEME.success : THEME.danger }}>{result.text}</p>
        )}
      </form>

      <div style={isCompactList ? { display: "grid", gap: 10 } : { background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 10 }}>
        {result && !result.ok && (
          <p style={{ margin: isCompactList ? "0 0 4px" : 0, padding: "10px 16px", fontSize: 12.5, color: THEME.danger, background: THEME.dangerLight, borderRadius: isCompactList ? 8 : 0, borderBottom: isCompactList ? "none" : `1px solid ${THEME.border}` }}>{result.text}</p>
        )}
        {users.map((u, i) => {
          const canManageThisTarget = u.role !== "second_master" || me.role === "admin";
          const menu = (u.role !== "admin" || u.id === me.id) && (
            <ActionMenu>
              <MenuItem icon={<EditIcon />} onClick={() => setEditUser(u)}>Edit</MenuItem>
              <MenuItem icon={<KeyIcon />} onClick={() => setResetPwdUser(u)}>Reset Password</MenuItem>
              {u.role !== "admin" && canManageThisTarget && (u.is_active
                ? <MenuItem icon={<PauseCircleIcon />} onClick={() => deactivate(u.id, u.full_name)}>Deactivate</MenuItem>
                : <MenuItem icon={<RefreshIcon />} onClick={() => reactivate(u.id, u.full_name)}>Reactivate</MenuItem>)}
              {u.role !== "admin" && canManageThisTarget && (
                <MenuItem icon={<TrashIcon />} danger onClick={() => removeUser(u.id, u.full_name)}>Delete / Remove</MenuItem>
              )}
            </ActionMenu>
          );
          const statusBadge = (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: u.is_active ? THEME.successLight : THEME.dangerLight, color: u.is_active ? THEME.success : THEME.danger }}>
              {u.is_active ? "Active" : "Inactive"}
            </span>
          );
          const rolePill = (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: THEME.navy, padding: "3px 10px", borderRadius: 20, lineHeight: 1.4 }}>
              {allHeldRoles(u.role, u.extra_roles).map(roleLabel).join(" + ")}
            </span>
          );
          const employmentBadge = (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "3px 9px 3px 7px", borderRadius: 20,
              background: u.employment_type === "Temporary" ? THEME.warningLight : THEME.successLight,
              color: u.employment_type === "Temporary" ? THEME.warning : THEME.success,
            }}>
              {u.employment_type === "Temporary" ? <ClockIcon size={11} /> : <ShieldIcon size={11} />}
              {u.employment_type === "Temporary" ? "Part-Time" : "Government"}
            </span>
          );
          return isCompactList ? (
            // ── MOBILE / TABLET: a self-contained card per account, easier to
            // scan and tap than a dense multi-column row squeezed onto a
            // narrow screen. ──
            <div key={u.id} className="account-card" style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: isMobile ? "12px 14px" : "14px 18px", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
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
                      <span style={{ overflowWrap: "anywhere" }}>Teaches: {u.assigned_forms.join(", ")}</span>
                    </div>
                  )}
                  {u.class_teacher_of && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 11.5, color: THEME.muted }}>
                      <span style={{ display: "flex", flexShrink: 0, marginTop: 1, color: THEME.heading, opacity: 0.75 }}><SchoolIcon size={13} /></span>
                      <span style={{ overflowWrap: "anywhere" }}>Class Teacher of: <b>{u.class_teacher_of}</b></span>
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
                <span style={{ fontSize: 11.5, fontWeight: 700, color: THEME.heading }}>{allHeldRoles(u.role, u.extra_roles).map(roleLabel).join(" + ")}</span>
                {u.subject_names?.length > 0 && <span style={{ fontSize: 11.5, color: THEME.muted }}>{u.subject_names.join(", ")}</span>}
                {u.assigned_forms?.length > 0 && <span style={{ fontSize: 11.5, color: THEME.muted }}>Teaches: {u.assigned_forms.join(", ")}</span>}
                {u.class_teacher_of && <span style={{ fontSize: 11.5, color: THEME.muted }}>Class Teacher of: <b>{u.class_teacher_of}</b></span>}
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
            showSuccess("Password Reset", `${resetPwdUser.full_name}'s password has been reset. Share the new password with them directly.`);
            setResetPwdUser(null);
          }}
        />
      )}
      {viewPhoto && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) setViewPhoto(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9700, padding: 16 }}
        >
          <div style={{ background: "#0E355C", borderRadius: 14, padding: 22, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.12)", maxWidth: "90vw" }}>
            <div style={{ width: 200, height: 200, maxWidth: "70vw", maxHeight: "70vw", borderRadius: "50%", overflow: "hidden", margin: "0 auto 14px", border: "2px solid rgba(255,255,255,0.2)" }}>
              <img src={viewPhoto.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>{viewPhoto.name}</div>
            <button onClick={() => setViewPhoto(null)} style={{ marginTop: 14, padding: "9px 20px", background: THEME.gold, color: THEME.navyDark, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Portal-based + flip-aware, same approach as Student Management's
// ActionsMenu: a plain `position:absolute` dropdown (the old implementation)
// gets pushed off-screen for the LAST account card on a phone/tablet,
// because it always opens *downward* with no room left below it - making it
// look like the menu (and its buttons) simply don't exist. Rendering into a
// document.body portal and flipping upward when there isn't room below
// fixes that for every card, not just the ones with space beneath them.
function ActionMenu({ children }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const itemCount = Array.isArray(children) ? children.filter(Boolean).length : (children ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target) && !e.target.closest("[data-usermenu-portal]")) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const menuWidth = 170;
      const menuHeight = itemCount * 38 + 8;
      const spaceBelow = window.innerHeight - r.bottom;
      const openUpward = spaceBelow < menuHeight + 10 && r.top > menuHeight + 10;
      setPos({
        top: openUpward
          ? Math.max(8, r.top - menuHeight - 4)
          : Math.min(r.bottom + 4, Math.max(8, window.innerHeight - menuHeight - 8)),
        left: Math.max(8, Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 8)),
      });
    }
    setOpen((o) => !o);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button ref={btnRef} onClick={toggle} aria-label="Actions" title="Actions" style={{
        width: 28, height: 28, borderRadius: 6, border: `1px solid ${THEME.border}`, background: THEME.surface,
        cursor: "pointer", color: THEME.text, display: "flex", alignItems: "center", justifyContent: "center",
      }}><DotsVerticalIcon size={16} /></button>
      {open && createPortal(
        <div data-usermenu-portal style={{
          position: "fixed", top: pos.top, left: pos.left, background: THEME.surface, border: `1px solid ${THEME.border}`,
          borderRadius: 8, boxShadow: "0 6px 18px rgba(0,0,0,0.12)", zIndex: 9600, minWidth: 160, overflow: "hidden",
        }} onClick={() => setOpen(false)}>
          {children}
        </div>,
        document.body
      )}
    </div>
  );
}
function MenuItem({ onClick, danger, icon, children }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", padding: "9px 14px", fontSize: 12.5,
      background: THEME.surface, border: "none", borderTop: `1px solid ${THEME.border}`, cursor: "pointer",
      color: danger ? THEME.danger : THEME.text,
    }}>
      {icon && <span style={{ display: "flex", flexShrink: 0, opacity: 0.85 }}>{icon}</span>}
      {children}
    </button>
  );
}

function EditUserModal({ user, subjects, onClose, onSave, myRole }) {
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
      <div style={{ background: THEME.surface, borderRadius: 12, padding: 22, width: "100%", maxWidth: 460, maxHeight: "85vh", overflowY: "auto" }}>
        <h3 style={{ marginTop: 0, marginBottom: 16, color: THEME.heading, fontSize: 16 }}>Edit - {user.username}</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <label style={labelStyle}>Username (also used to log in)</label>
            <input placeholder="Username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Phone Number (for SMS Service)</label>
            <input type="tel" placeholder="e.g. 0754xxxxxx" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} style={inputStyle} />
          </div>
          <EmploymentTypeCheckbox value={f.employment_type} onChange={(v) => setF({ ...f, employment_type: v })} />
          {isHeadMaster ? (
            <p style={{ margin: 0, fontSize: 12, color: THEME.muted }}>
              The Head Master account's Name and Role stay fixed - only the Username (shown on the Timetable), Subjects, and Email can be changed here.
            </p>
          ) : (
            <>
              <input placeholder="Full Name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} style={inputStyle} />
              <div>
                <label style={labelStyle}>Role</label>
                <select value={f.role} onChange={(e) => {
                  const newRole = e.target.value;
                  setF((p) => ({ ...p, role: newRole, extra_roles: p.extra_roles.filter((x) => x !== newRole) }));
                }} style={inputStyle}>
                  {ROLES.filter((r) => r.value !== "second_master" || myRole === "admin").map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Additional Roles (optional) - a teacher can hold more than one Role at once</label>
                <div style={chipsBox}>
                  {ROLES.filter((r) => r.value !== f.role && (r.value !== "second_master" || myRole === "admin")).map((r) => (
                    <Chip key={r.value} active={f.extra_roles.includes(r.value)} onClick={() => toggleExtraRole(r.value)}>{r.label}</Chip>
                  ))}
                </div>
              </div>
            </>
          )}
          <input type="email" placeholder="Gmail (for Forgot Password)" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} style={inputStyle} />
          {showsSubjects && (
            <div>
              <label style={labelStyle}>Subjects Taught</label>
              <div style={chipsBox}>
                {subjects.map((s) => <Chip key={s.id} active={f.subject_ids.includes(s.id)} onClick={() => toggleSubject(s.id)}>{s.name}</Chip>)}
              </div>
            </div>
          )}
          {showsForms && (
            <div>
              <label style={labelStyle}>Classes / Forms Taught - determines which class's results/subjects this account can enter</label>
              <div style={chipsBox}>
                {FORMS.map((fm) => <Chip key={fm} active={f.assigned_forms.includes(fm)} onClick={() => toggleForm(fm)}>{fm}</Chip>)}
              </div>
            </div>
          )}
          {isClassTeacherRole(f.role, f.extra_roles) && (
            <div>
              <label style={labelStyle}>Class Teacher Of - the ONE class whose students appear automatically in Contribution Management</label>
              <select value={f.class_teacher_of} onChange={(e) => setF({ ...f, class_teacher_of: e.target.value })} style={inputStyle}>
                <option value="">- Select class -</option>
                {FORMS.map((fm) => <option key={fm} value={fm}>{fm}</option>)}
              </select>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: "9px 16px", background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 8, cursor: "pointer", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}><CloseIcon size={13} />Cancel</button>
          <button onClick={() => onSave(isHeadMaster ? { ...f, role: undefined, extra_roles: undefined } : f)} style={{ padding: "9px 16px", background: THEME.navy, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}><CheckIcon size={13} />Save</button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordModal({ user, onClose, onSubmit }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Password and confirmation do not match.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit(newPassword);
      // Success: the parent closes (unmounts) this modal right after -
      // don't touch state here, or React will warn about setting state
      // on an unmounted component.
    } catch (err) {
      setError(err.message || "Could not reset password. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000, padding: 16 }}>
      <form onSubmit={submit} style={{ background: THEME.surface, borderRadius: 12, padding: 22, width: 380, maxWidth: "100%" }}>
        <h3 style={{ marginTop: 0, marginBottom: 6, color: THEME.heading, fontSize: 16 }}>Reset Password</h3>
        <p style={{ margin: "0 0 16px", fontSize: 12.5, color: THEME.muted }}>
          Set a new password for <b>{user.full_name}</b> ({user.username}). They will need this new password next time they log in.
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <label style={labelStyle}>New Password</label>
            <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" autoFocus />
          </div>
          <div>
            <label style={labelStyle}>Confirm New Password</label>
            <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter the new password" />
          </div>
        </div>
        {error && (
          <div style={{ marginTop: 12, color: THEME.danger, background: THEME.dangerLight, fontSize: 12.5, padding: "9px 12px", borderRadius: 8 }}>{error}</div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" onClick={onClose} style={{ padding: "9px 16px", background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 8, cursor: "pointer", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}><CloseIcon size={13} />Cancel</button>
          <button type="submit" disabled={busy} style={{ padding: "9px 16px", background: THEME.navy, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: busy ? 0.7 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}>
            {busy ? <SpinnerIcon size={13} /> : <KeyIcon size={13} />}{busy ? "Saving..." : "Reset Password"}
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
  const checked = value !== "Temporary";
  return (
    <label style={{
      display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px",
      background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 8, cursor: "pointer",
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked ? "Permanent" : "Temporary")}
        style={{ width: 19, height: 19, marginTop: 1, accentColor: THEME.navy, cursor: "pointer", flexShrink: 0 }}
      />
      <span style={{ fontSize: 12.5, color: THEME.text, lineHeight: 1.5 }}>
        <b>Permanent Employee (Government)</b>
        <br />
        <span style={{ color: THEME.muted, fontSize: 11.5 }}>
          {checked
            ? "Checked - will appear as \"Government\"."
            : "Unchecked - will appear as \"Part-Time\" (not yet employed by the Government)."}
        </span>
      </span>
    </label>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: "5px 12px", borderRadius: 14, border: `1px solid ${active ? THEME.navy : THEME.border}`,
      background: active ? THEME.navy : THEME.surface, color: active ? "#fff" : THEME.text,
      fontSize: 12, cursor: "pointer",
    }}>{children}</button>
  );
}

function roleLabel(role) {
  return {
    admin: "Head Master", second_master: "Second Master", academic: "Academic Master",
    teacher: "Teacher", patron: "School Patron", matron: "School Matron",
    class_teacher: "Class Teacher", food_teacher: "Food Teacher",
  }[role] || role;
}

const inputStyle = { padding: "9px 12px", border: `1px solid ${THEME.border}`, borderRadius: 8, fontSize: 13 };
const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 };
const chipsBox = { display: "flex", flexWrap: "wrap", gap: 6 };
