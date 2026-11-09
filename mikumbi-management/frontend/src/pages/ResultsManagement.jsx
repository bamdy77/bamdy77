import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch, API_BASE } from "../utils/api";
import { THEME, COMPETENCY_COLORS, competencyGrade } from "../styles/theme";
import { useConfirm } from "../components/ConfirmDialog";
import { showSuccess } from "../components/SuccessModal";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { DotsVerticalIcon, RefreshIcon, KeyIcon, TrashIcon, CheckIcon, PauseCircleIcon, CalendarIcon, EditIcon, LayersIcon, CheckCircleIcon, MegaphoneIcon, ClockIcon, DownloadIcon, SaveIcon, LockIcon, SendIcon, ChevronRightIcon, TrophyIcon, TrendingDownIcon, SearchIcon, PrinterIcon, CloseIcon, SpinnerIcon, MessageIcon, InfoIcon, ChevronDownIcon } from "../components/icons";

const FORMS = ["Form I", "Form II", "Form III", "Form IV"];
const EXAM_TYPES = ["Monthly Test", "Mid-Term Examination", "Terminal Examination", "Mock Examination", "District Mock Examination", "Annual Examination", "School Examination", "Fitness Examination", "Good Neighborliness Examination Mikumbi & Mkoma", "Good Neighborliness Examination Mikumbi & Chihangu", "Good Neighborliness Examination Mikumbi & Mnyambe"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SW_MONTHS_FRONT = ["Januari", "Februari", "Machi", "Aprili", "Mei", "Juni", "Julai", "Agosti", "Septemba", "Oktoba", "Novemba", "Desemba"];
const MHULA_OPTIONS_FRONT = ["Nusu Mhula wa I", "Mhula Wa I", "Nusu Mhula wa II", "Mhula Wa II"];
const sexLabel = (gender) => (gender === "Female" ? "F" : gender === "Male" ? "M" : (gender || "-"));

export default function ResultsManagement() {
  const { user, token } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const [subjects, setSubjects] = useState([]);
  const [period, setPeriod] = useState(null); // { id, form, exam_type, month, year }
  const [selection, setSelection] = useState({
    form: (user.assigned_forms && user.assigned_forms[0]) || (user.role === "class_teacher" && user.class_teacher_of) || "Form I", exam_type: EXAM_TYPES[0], month: MONTHS[new Date().getMonth()], year: new Date().getFullYear(),
  });

  // Keeps the locked Form value in sync with a LIVE reassignment. The Form
  // <select> below was only ever seeded once at mount from
  // user.assigned_forms/class_teacher_of - fine normally, but Layout
  // refreshes `user` from the server on every navigation (see
  // AuthContext.refreshUser), so if the Head Master reassigns this teacher
  // to a different class/subject in User Accounts, `user` updates but this
  // already-computed `selection.form` did not - the dropdown is also
  // DISABLED for a single-class teacher/class_teacher, so there was no way
  // to fix it from the UI either. The teacher would stay stuck submitting
  // against their OLD class (which now looks "inactive"/wrong to them)
  // until they logged out and back in. This re-seeds selection.form
  // whenever the person's real locked class changes, without touching
  // admin/second_master/academic's freely-editable Form field.
  useEffect(() => {
    const lockedForm =
      user.role === "teacher" && (user.assigned_forms || []).length === 1 ? user.assigned_forms[0]
      : user.role === "class_teacher" && user.class_teacher_of ? user.class_teacher_of
      : null;
    if (lockedForm) {
      setSelection((s) => (s.form === lockedForm ? s : { ...s, form: lockedForm }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.assigned_forms, user.class_teacher_of, user.role]);

  const myRoles = user.roles && user.roles.length ? user.roles : [user.role];
  // Only the Academic Master administers the Results Management workflow
  // (Sheets & Status, Exam Activation, Publishing, History) - that's where
  // every other teacher submits their scores for review/inclusion, and from
  // where the Academic Master later includes and publishes them. Head Master
  // (admin) and Second Master must see ONLY the mark-entry sections here,
  // exactly like any other teacher - no oversight tabs at all, including
  // Exam Activation.
  const ACADEMIC_TABS = ["enter", "sheets", "results", "reports", "published", "history"];
  // The "Results" tab (compiled/general results - division summary, subject
  // performance, teacher/subject performance breakdown) is restricted to
  // Academic, Admin (Head Master) & Second Master ONLY, per explicit spec.
  // Teacher/Class Teacher keep "Enter Marks" (their own mark-entry tab is
  // untouched) but lose "Results". Patron/Matron/Food Teacher previously had
  // ONLY "results" here, so they now have no tab left on this page - that is
  // the intended effect of restricting "Results" to the three roles above,
  // not an accidental removal of any other button.
  const ADMIN_LIKE_TABS = ["enter", "results", "reports"];
  const TEACHER_TABS = ["enter"];
  // A Class Teacher gets "Enter Marks" (same as any teacher) PLUS "Parents
  // Reports" for their OWN class only - the Parent Report PDF section shows
  // for them, the SMS section stays hidden (still Admin/Second
  // Master/Academic only, unchanged) - see ParentsReports below.
  const CLASS_TEACHER_TABS = ["enter", "reports"];
  const VIEW_ONLY_TABS = [];
  const TABS_BY_ROLE = {
    admin: ADMIN_LIKE_TABS, second_master: ADMIN_LIKE_TABS, academic: ACADEMIC_TABS,
    teacher: TEACHER_TABS, class_teacher: CLASS_TEACHER_TABS,
    patron: VIEW_ONLY_TABS, matron: VIEW_ONLY_TABS, food_teacher: VIEW_ONLY_TABS,
  };
  const tabs = Array.from(new Set(myRoles.flatMap((r) => TABS_BY_ROLE[r] || [])));

  // Default to the first tab actually available to this person - NOT a
  // hardcoded guess, and NEVER "results" unless it's actually in their
  // allowed tabs (previously this fell back to the literal string
  // "results" even when the tab bar had nothing to click, which would have
  // silently rendered the compiled-results panel anyway for roles who are
  // no longer supposed to see it).
  const [tab, setTab] = useState(tabs[0] || null);

  useEffect(() => {
    apiFetch("/subjects", {}, token).then((d) => setSubjects(d.data || [])).catch(() => {});
  }, [token]);

  const [periodError, setPeriodError] = useState("");
  const [periodBusy, setPeriodBusy] = useState(false);
  // "Search Student Results" lives at the very top of the page now - it
  // doesn't depend on a period being selected at all (the modal itself asks
  // which exam period to view), so it no longer waits behind "Select
  // Period" the way it used to when it lived inside the Results tab.
  const canSearchStudent = myRoles.includes("academic");
  const [studentLookupOpen, setStudentLookupOpen] = useState(false);

  // Teachers Evaluation - Admin (Head Master) only, per explicit spec: not
  // Second Master, not Academic Master, even if that account also holds
  // one of those as a combined role.
  const canTeacherEval = myRoles.includes("admin");
  const [teacherEvalOpen, setTeacherEvalOpen] = useState(false);

  const findOrCreatePeriod = useCallback(async () => {
    setPeriodBusy(true); setPeriodError("");
    try {
      const data = await apiFetch("/results-mgmt/periods", { method: "POST", body: JSON.stringify(selection) }, token);
      setPeriod(data);
      // Ensure a score sheet exists for this period+form too.
      await apiFetch("/results-mgmt/sheet", { method: "POST", body: JSON.stringify({ period_id: data.id, form: selection.form }) }, token);
    } catch (err) {
      setPeriodError(err.message || "Could not select this period - please try again.");
      setPeriod(null);
    } finally { setPeriodBusy(false); }
  }, [selection, token]);

  const openPeriodFromHistory = async (p) => {
    setSelection({ form: p.form, exam_type: p.exam_type, month: p.month, year: p.year });
    setPeriodError("");
    try {
      const data = await apiFetch("/results-mgmt/periods", { method: "POST", body: JSON.stringify({ form: p.form, exam_type: p.exam_type, month: p.month, year: p.year }) }, token);
      setPeriod(data);
      setTab("results");
    } catch (err) { setPeriodError(err.message || "Could not open this period."); }
  };

  const tabLabels = {
    enter: "Enter Marks", sheets: "Sheets & Status", results: "Results", reports: "Parents Reports",
    published: "Published Results", history: "History",
  };
  const tabIcons = { enter: EditIcon, sheets: LayersIcon, results: CheckCircleIcon, reports: SendIcon, published: MegaphoneIcon, history: ClockIcon };

  return (
    <div style={{ padding: isMobile ? "16px 12px" : isTablet ? "24px 20px" : 40 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <h2 style={{ color: THEME.heading, fontSize: isMobile ? 16 : isTablet ? 18 : 20, margin: 0 }}>Results Management</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", ...(isMobile ? { width: "100%" } : {}) }}>
          {canTeacherEval && (
            <button onClick={() => setTeacherEvalOpen(true)} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, ...(isMobile ? { width: "100%" } : {}) }}>
              <CheckCircleIcon size={14} />TEACHERS ASSESMENT
            </button>
          )}
          {canSearchStudent && (
            <button onClick={() => setStudentLookupOpen(true)} style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, ...(isMobile ? { width: "100%" } : {}) }}>
              <SearchIcon size={14} />Search Student Results
            </button>
          )}
        </div>
      </div>
      {studentLookupOpen && <AcademicStudentResultsModal token={token} onClose={() => setStudentLookupOpen(false)} />}
      {teacherEvalOpen && <TeacherEvaluationModal token={token} onClose={() => setTeacherEvalOpen(false)} />}

      {/* Period selector - shared across tabs */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10, flexWrap: "wrap", alignItems: isMobile ? "stretch" : "flex-end", marginBottom: 24, background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, padding: isMobile ? 12 : 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field label="Form">
            <select
              value={selection.form}
              onChange={(e) => setSelection({ ...selection, form: e.target.value })}
              style={{ ...selectStyle, ...(isCompact ? { flex: 1, minWidth: 100 } : {}) }}
              disabled={(user.role === "teacher" && (user.assigned_forms || []).length === 1) || (user.role === "class_teacher" && !!user.class_teacher_of)}
            >
              {(user.role === "teacher" && (user.assigned_forms || []).length ? user.assigned_forms
                : user.role === "class_teacher" && user.class_teacher_of ? [user.class_teacher_of]
                : FORMS).map((f) => <option key={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Exam Type">
            <select value={selection.exam_type} onChange={(e) => setSelection({ ...selection, exam_type: e.target.value })} style={{ ...selectStyle, ...(isCompact ? { flex: 1, minWidth: 140 } : {}) }}>
              {EXAM_TYPES.map((f) => <option key={f}>{f}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field label="Month">
            <select value={selection.month} onChange={(e) => setSelection({ ...selection, month: e.target.value })} style={{ ...selectStyle, ...(isCompact ? { flex: 1, minWidth: 100 } : {}) }}>
              {MONTHS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Year">
            <input type="number" value={selection.year} onChange={(e) => setSelection({ ...selection, year: Number(e.target.value) })} style={{ ...selectStyle, width: isMobile ? 80 : 90 }} />
          </Field>
        </div>
        <button onClick={findOrCreatePeriod} style={{ ...btnPrimary, ...(isMobile ? { width: "100%" } : {}), display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }} disabled={periodBusy}><CalendarIcon size={14} />{periodBusy ? "Selecting..." : "Select Period"}</button>
        {period && <span style={{ fontSize: 12.5, color: THEME.success, alignSelf: isMobile ? "flex-start" : "center" }}>✓ {period.form} · {period.exam_type} · {period.month} {period.year}</span>}
        {periodError && <span style={{ fontSize: 12.5, color: THEME.danger, alignSelf: isMobile ? "flex-start" : "center" }}>⚠ {periodError}</span>}
      </div>

      {/* Tabs - a single scrollable row on phones/tablets instead of
          wrapping into a tall, cluttered stack of oversized buttons.
          "Parents Reports" specifically stays disabled (greyed out,
          unclickable) until a period has been selected above - unlike the
          other tabs, which stay clickable and just show the "Select a
          period" placeholder message. */}
      <div className={isCompact ? "table-scroll" : undefined} style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: isCompact ? "nowrap" : "wrap", paddingBottom: isCompact ? 4 : 0 }}>
        {tabs.map((t) => {
          const TIcon = tabIcons[t];
          const disabled = t === "reports" && !period;
          return (
            <button
              key={t}
              onClick={() => !disabled && setTab(t)}
              disabled={disabled}
              title={disabled ? "Select a period above first" : undefined}
              style={{
                ...(tab === t ? tabActive : tabInactive),
                ...(isCompact ? { padding: "7px 12px", fontSize: 12, flexShrink: 0, whiteSpace: "nowrap" } : {}),
                display: "inline-flex", alignItems: "center", gap: 6,
                ...(disabled ? { opacity: 0.45, cursor: "not-allowed" } : {}),
              }}
            >{TIcon && <TIcon size={13} />}{tabLabels[t]}</button>
          );
        })}
      </div>

      {tab === "history" ? (
        <ResultsHistory onOpenPeriod={openPeriodFromHistory} />
      ) : !period ? (
        <p style={{ color: THEME.muted, fontSize: 13.5 }}>Select a period above to begin.</p>
      ) : (
        <>
          {tab === "enter" && <EnterMarks period={period} subjects={subjects} />}
          {tab === "sheets" && <TeacherStatus period={period} />}
          {tab === "results" && <CompiledResults period={period} />}
          {tab === "reports" && <ParentsReports period={period} />}
          {tab === "published" && <PublishedResults period={period} />}
        </>
      )}
    </div>
  );
}

// ══════════════════ ADMIN/ACADEMIC: FULL RESULTS HISTORY ══════════════════
function ResultsHistory({ onOpenPeriod }) {
  const { token } = useAuth();
  const { isMobile } = useBreakpoint();
  const [rows, setRows] = useState([]);
  const [formFilter, setFormFilter] = useState("");

  const load = useCallback(() => {
    apiFetch(`/results-mgmt/history${formFilter ? `?form=${encodeURIComponent(formFilter)}` : ""}`, {}, token)
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]));
  }, [token, formFilter]);
  useEffect(load, [load]);

  return (
    <div>
      <div style={{ marginBottom: 14, maxWidth: 220 }}>
        <Field label="Filter by Form">
          <select value={formFilter} onChange={(e) => setFormFilter(e.target.value)} style={selectStyle}>
            <option value="">All Forms</option>
            {FORMS.map((f) => <option key={f}>{f}</option>)}
          </select>
        </Field>
      </div>
      {isMobile && <div style={{ fontSize: 11, color: THEME.muted, marginBottom: 6 }}>↔ Swipe sideways to see every column</div>}
      <div style={{ overflowX: "auto" }}>
      <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, overflow: "hidden", minWidth: isMobile ? 640 : "auto" }}>
        <div style={{ display: "flex", padding: "9px 16px", fontSize: 11.5, fontWeight: 700, color: THEME.muted, background: THEME.bg }}>
          <span style={{ flex: 1.5 }}>Form / Exam</span>
          <span style={{ flex: 1 }}>Period</span>
          <span style={{ flex: 1 }}>Submitted</span>
          <span style={{ flex: 1 }}>Candidates</span>
          <span style={{ flex: 1 }}>Passed</span>
          <span style={{ flex: 1 }}>School GPA</span>
          <span style={{ width: 90 }} />
        </div>
        {rows.length === 0 && <p style={{ padding: 16, fontSize: 13, color: THEME.muted }}>No submitted results yet.</p>}
        {rows.map((r, i) => (
          <div key={r.sheet_id} style={{ display: "flex", alignItems: "center", padding: "9px 16px", fontSize: 12.5, borderTop: i > 0 ? `1px solid ${THEME.border}` : "none" }}>
            <span style={{ flex: 1.5 }}>{r.form} - {r.exam_type}</span>
            <span style={{ flex: 1 }}>{r.month} {r.year}</span>
            <span style={{ flex: 1 }}>{r.submitted_teachers} teacher(s)</span>
            <span style={{ flex: 1 }}>{r.total_candidates ?? "-"}</span>
            <span style={{ flex: 1 }}>{r.total_passed ?? "-"}</span>
            <span style={{ flex: 1 }}>{r.school_gpa ?? "-"}</span>
            <span style={{ width: 90 }}><button onClick={() => onOpenPeriod(r)} style={{ ...btnTiny, display: "inline-flex", alignItems: "center", gap: 4 }}>Open<ChevronRightIcon size={12} /></button></span>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <div><label style={{ display: "block", fontSize: 11, color: THEME.muted, marginBottom: 4 }}>{label}</label>{children}</div>;
}

// ══════════════════ TEACHER: ENTER MARKS ══════════════════
function EnterMarks({ period, subjects }) {
  const { user, token } = useAuth();
  const { isMobile } = useBreakpoint();
  const [sheet, setSheet] = useState(null);
  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState({}); // student_id -> marks string
  const [grades, setGrades] = useState({}); // student_id -> grade
  const [lock, setLock] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [markErr, setMarkErr] = useState("");
  const [busyPdf, setBusyPdf] = useState(false);
  const [subjectId, setSubjectId] = useState(user.subject_ids?.[0] || null);
  const [unlockReqBusy, setUnlockReqBusy] = useState(false);
  const [unlockReqSent, setUnlockReqSent] = useState(false);
  const { confirm, ConfirmDialogPortal } = useConfirm();

  const mySubjectName = subjects.find((s) => s.id === subjectId)?.name || "-";

  const load = useCallback(async () => {
    if (!subjectId) return;
    const sh = await apiFetch(`/results-mgmt/sheet?period_id=${period.id}&form=${encodeURIComponent(period.form)}&subject_id=${subjectId}`, {}, token);
    setSheet(sh);
    const [studentsData, myScores, lockData] = await Promise.all([
      apiFetch(`/students?form=${encodeURIComponent(period.form)}&status=Active`, {}, token),
      sh ? apiFetch(`/results-mgmt/my-scores?sheet_id=${sh.id}&subject_id=${subjectId}`, {}, token) : {},
      sh ? apiFetch(`/results-mgmt/teacher-lock?sheet_id=${sh.id}&teacher_id=${user.id}&subject_id=${subjectId}`, {}, token) : null,
    ]);
    // Alphabetical A–Z, but girls first, then boys - per spec.
    const sorted = [...(studentsData.data || [])].sort((a, b) => {
      const g = (a.gender || "").localeCompare(b.gender || ""); // "F" < "M"
      if (g !== 0) return g;
      return `${a.first_name} ${a.middle_name || ""} ${a.last_name}`.localeCompare(`${b.first_name} ${b.middle_name || ""} ${b.last_name}`);
    });
    setStudents(sorted);
    const m = {}; const g = {};
    sorted.forEach((s) => { m[s.id] = myScores[s.id]?.marks ?? ""; g[s.id] = myScores[s.id]?.grade ?? ""; });
    setMarks(m); setGrades(g);
    setLock(lockData);
    setUnlockReqSent(false);
  }, [period, token, user.id, subjectId]);

  useEffect(() => { load(); }, [load]);

  if (!user.subject_ids || !user.subject_ids.length) return <Warn>You have no subject assigned to your account. Please contact the Head Master.</Warn>;

  const save = async (silent) => {
    if (!sheet) return;
    setSaving(true); setMsg("");
    try {
      const scores = students.map((s) => ({ student_id: s.id, subject_id: subjectId, marks: marks[s.id] === "" ? null : marks[s.id] }));
      await apiFetch("/results-mgmt/save", { method: "PUT", body: JSON.stringify({ sheet_id: sheet.id, scores }) }, token);
      setMsg("Marks saved.");
      if (!silent) showSuccess("Marks", "Marks Successfully Saved.");
    } catch (err) { setMsg(err.message); } finally { setSaving(false); }
  };

  const doSubmitLock = async () => {
    await save(true);
    await apiFetch("/results-mgmt/lock-teacher", { method: "POST", body: JSON.stringify({ sheet_id: sheet.id, subject_id: subjectId }) }, token);
    showSuccess("Marks", "Marks Successfully Submitted - locked until the Academic Master unlocks them.");
    load();
  };
  const submitLock = () => confirm(
    "Are you sure you want to submit these marks? Once submitted, you won't be able to edit them again until the Academic Master unlocks your submission.",
    doSubmitLock,
    { danger: false }
  );

  // "Request Unlock" — one button, no free-text reason (per spec). Sends
  // an unlock request straight to the Academic Master's Notification Center.
  const requestUnlock = async () => {
    if (!sheet) return;
    setUnlockReqBusy(true);
    try {
      await apiFetch("/results-mgmt/unlock-request", { method: "POST", body: JSON.stringify({ sheet_id: sheet.id, subject_id: subjectId }) }, token);
      setUnlockReqSent(true);
      showSuccess("Request Sent", "Your unlock request has been sent to the Academic Master.");
    } catch (err) { setMsg(err.message); } finally { setUnlockReqBusy(false); }
  };

  // Print opens the PDF inline (via a blob URL so the browser shows its own
  // viewer/print dialog); Export PDF saves the same file to disk. Both share
  // one fetch so a network failure surfaces the same short message either way.
  const pdfAction = async (mode) => {
    if (!sheet) return;
    setBusyPdf(true);
    try {
      const res = await fetch(`${API_BASE}/results-mgmt/my-scores/export-pdf?sheet_id=${sheet.id}&subject_id=${subjectId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Could not generate the PDF.");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      if (mode === "print") {
        window.open(url, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = url; a.download = `${mySubjectName}-${period.form}-scores.pdf`.replace(/\s+/g, "-");
        document.body.appendChild(a); a.click(); a.remove();
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 30000);
    } catch (err) { setMsg(err.message); } finally { setBusyPdf(false); }
  };

  const locked = lock?.is_locked;

  return (
    <div>
      {user.subject_ids.length > 1 && (
        <div style={{ marginBottom: 14 }}>
          <Field label="Subject">
            <select value={subjectId || ""} onChange={(e) => setSubjectId(Number(e.target.value))} style={selectStyle}>
              {user.subject_ids.map((id) => (
                <option key={id} value={id}>{subjects.find((s) => s.id === id)?.name || id}</option>
              ))}
            </select>
          </Field>
        </div>
      )}
      <p style={{ fontSize: 13, color: THEME.muted, marginBottom: 14 }}>Your subject: <b>{mySubjectName}</b> · Students: {students.length}</p>
      {locked && (
        <Warn>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <span style={{ flex: 1, minWidth: 200 }}>You have already submitted {mySubjectName} marks (locked). Contact the Academic Master if you need them unlocked. (Your other subjects, if any, are unaffected - switch subject above to enter them.)</span>
            <button
              onClick={requestUnlock}
              disabled={unlockReqBusy || unlockReqSent}
              style={{
                ...btnSecondary, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                opacity: unlockReqSent ? 0.7 : 1,
              }}
            >
              {unlockReqBusy ? <SpinnerIcon size={14} /> : <SendIcon size={14} />}
              {unlockReqSent ? "Request Sent" : "Request Unlock"}
            </button>
          </div>
        </Warn>
      )}

      <div style={{ overflowX: "auto" }}>
      <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, overflow: "hidden", maxWidth: 700, minWidth: isMobile ? 440 : "auto" }}>
        <div style={{ display: "flex", padding: "8px 14px", fontSize: 11.5, fontWeight: 700, color: THEME.muted, background: THEME.bg }}>
          <span style={{ width: 90 }}>Reg.No</span>
          <span style={{ flex: 1 }}>Name</span>
          <span style={{ width: 50, textAlign: "center" }}>Sex</span>
          <span style={{ width: 70, textAlign: "center" }}>Score</span>
          <span style={{ width: 60, textAlign: "center" }}>Grade</span>
        </div>
        {students.map((s, i) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", padding: "9px 14px", borderTop: i > 0 ? `1px solid ${THEME.border}` : "none" }}>
            <span style={{ width: 90, fontSize: 12, color: THEME.muted }}>{s.reg_no || s.entry_no || "-"}</span>
            <span style={{ flex: 1, fontSize: 13 }}>{s.first_name} {s.middle_name} {s.last_name}</span>
            <span style={{ width: 50, textAlign: "center", fontSize: 12, color: THEME.muted }}>{sexLabel(s.gender)}</span>
            <input
              type="number" min="0" max="100" disabled={locked}
              value={marks[s.id] ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                // Reject anything outside 0–100 right away (empty clears the
                // cell) instead of storing an out-of-range mark - short
                // inline error, no silent clamping.
                if (v !== "" && (!Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 100)) {
                  setMarkErr("Marks must be 0–100.");
                  return;
                }
                setMarkErr("");
                setMarks({ ...marks, [s.id]: v });
              }}
              style={{ width: 60, padding: "6px 8px", border: `1px solid ${THEME.border}`, borderRadius: 0, textAlign: "center" }}
            />
            <span style={{ width: 60, textAlign: "center", fontSize: 13, fontWeight: 700, color: THEME.heading }}>{grades[s.id] || "-"}</span>
          </div>
        ))}
      </div>
      </div>

      {markErr && <p style={{ fontSize: 12.5, color: THEME.danger, marginTop: 10 }}>{markErr}</p>}
      {msg && <p style={{ fontSize: 13, color: THEME.success, marginTop: 10 }}>{msg}</p>}

      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10, marginTop: 16 }}>
        {!locked && (
          <>
            <button onClick={save} disabled={saving} style={{ ...btnSecondary, ...(isMobile ? { width: "100%" } : {}), display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>{saving ? <SpinnerIcon size={14} /> : <SaveIcon size={14} />}{saving ? "Saving..." : "Save (Draft)"}</button>
            <button onClick={submitLock} disabled={saving} style={{ ...btnPrimary, ...(isMobile ? { width: "100%" } : {}), display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>{saving ? <SpinnerIcon size={14} /> : <LockIcon size={14} />}Submit Marks (Submit &amp; Lock)</button>
          </>
        )}
        <button onClick={() => pdfAction("print")} disabled={!sheet || busyPdf} style={{ ...btnSecondary, ...(isMobile ? { width: "100%" } : {}), display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>{busyPdf ? <SpinnerIcon size={14} /> : <PrinterIcon size={14} />}Print</button>
        <button onClick={() => pdfAction("export")} disabled={!sheet || busyPdf} style={{ ...btnSecondary, ...(isMobile ? { width: "100%" } : {}), display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>{busyPdf ? <SpinnerIcon size={14} /> : <DownloadIcon size={14} />}Export PDF</button>
      </div>
      {ConfirmDialogPortal}
    </div>
  );
}

// ══════════════════ ADMIN/ACADEMIC: TEACHER STATUS ══════════════════
function TeacherStatus({ period }) {
  const { token } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const [rows, setRows] = useState([]);
  const { confirm, ConfirmDialogPortal } = useConfirm();

  const load = useCallback(() => {
    apiFetch(`/results-mgmt/teacher-status?form=${encodeURIComponent(period.form)}&exam_type=${encodeURIComponent(period.exam_type)}&month=${encodeURIComponent(period.month)}&year=${period.year}`, {}, token)
      .then(setRows).catch(() => setRows([]));
  }, [period, token]);
  useEffect(load, [load]);

  const unlock = async (r) => {
    await apiFetch("/results-mgmt/unlock", { method: "POST", body: JSON.stringify({ sheet_id: r.sheet_id, teacher_id: r.id, subject_id: r.subject_id }) }, token);
    showSuccess("Marks", `${r.full_name}'s ${r.subject_name} submission has been unlocked for editing.`);
    load();
  };
  const toggleInclude = async (r) => {
    await apiFetch("/results-mgmt/teacher-status/include", { method: "PATCH", body: JSON.stringify({ sheet_id: r.sheet_id, teacher_id: r.id, subject_id: r.subject_id }) }, token);
    showSuccess("Marks", "Successfully updated.");
    load();
  };
  const deleteTeacherScores = (r) => confirm(`Are you sure you want to delete all marks by ${r.full_name} (${r.subject_name}) for this period?`, async () => {
    await apiFetch("/results-mgmt/teacher-results", { method: "DELETE", body: JSON.stringify({ sheet_id: r.sheet_id, teacher_id: r.id, subject_id: r.subject_id }) }, token);
    showSuccess("Marks", "Marks Successfully Deleted.");
    load();
  });

  return (
    <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0 }}>
      {rows.map((r, i) => (
        <div key={r.id} style={{ padding: isMobile ? "12px 14px" : "10px 16px", borderTop: i > 0 ? `1px solid ${THEME.border}` : "none", fontSize: 13 }}>
          {isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <span style={{ flex: 1 }}>{r.full_name} <span style={{ color: THEME.muted, fontSize: 11.5 }}>({r.subject_name})</span></span>
                {r.submitted && (
                  <ActionMenu>
                    <MenuItem icon={r.included_in_results ? <PauseCircleIcon /> : <CheckIcon />} onClick={() => toggleInclude(r)}>{r.included_in_results ? "Exclude from Results" : "Include in Results"}</MenuItem>
                    <MenuItem icon={<KeyIcon />} onClick={() => unlock(r)}>Unlock</MenuItem>
                    <MenuItem icon={<TrashIcon />} danger onClick={() => deleteTeacherScores(r)}>Delete Marks</MenuItem>
                  </ActionMenu>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <StatusPill ok={r.submitted}>{r.submitted ? "Submitted" : "Pending"}</StatusPill>
                <StatusPill ok={r.included_in_results}>{r.included_in_results ? "Included" : "Not Included"}</StatusPill>
                {r.pending_unlock_request && <StatusPill ok={false}>Unlock Requested</StatusPill>}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: isCompact ? "wrap" : "nowrap", alignItems: "center", gap: isCompact ? 8 : 14 }}>
              <span style={{ flex: isCompact ? "1 1 100%" : 1 }}>{r.full_name} <span style={{ color: THEME.muted, fontSize: 11.5 }}>({r.subject_name})</span></span>
              <StatusPill ok={r.submitted}>{r.submitted ? "Submitted" : "Pending"}</StatusPill>
              <StatusPill ok={r.included_in_results}>{r.included_in_results ? "Included" : "Not Included"}</StatusPill>
              {r.pending_unlock_request && <StatusPill ok={false}>Unlock Requested</StatusPill>}
              {r.submitted && (
                <ActionMenu>
                  <MenuItem icon={r.included_in_results ? <PauseCircleIcon /> : <CheckIcon />} onClick={() => toggleInclude(r)}>{r.included_in_results ? "Exclude from Results" : "Include in Results"}</MenuItem>
                  <MenuItem icon={<KeyIcon />} onClick={() => unlock(r)}>Unlock</MenuItem>
                  <MenuItem icon={<TrashIcon />} danger onClick={() => deleteTeacherScores(r)}>Delete Marks</MenuItem>
                </ActionMenu>
              )}
            </div>
          )}
        </div>
      ))}
      {rows.length === 0 && <p style={{ padding: 16, fontSize: 13, color: THEME.muted }}>No teachers have a subject assigned for this form.</p>}
      {ConfirmDialogPortal}
    </div>
  );
}
// Portal-based + flip-aware, matching the same fix already used in User
// Accounts: rendering the dropdown into a document.body portal (positioned
// from the button's real screen coordinates, not CSS position:absolute
// relative to a flex-wrap card) and flipping it upward when there isn't
// room below is what keeps Hide/Delete correctly placed on Mobile/Tablet -
// a relatively-positioned dropdown inside a card that's part of a
// `flexWrap: "wrap"` row can end up mis-anchored or clipped once the row
// wraps onto a narrower screen.
function ActionMenu({ children }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const MENU_WIDTH = 180;
  const itemCount = Array.isArray(children) ? children.filter(Boolean).length : (children ? 1 : 0);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const menuHeight = itemCount * 38 + 8;
      const spaceBelow = window.innerHeight - r.bottom;
      const openUpward = spaceBelow < menuHeight + 10 && r.top > menuHeight + 10;
      setPos({
        top: openUpward
          ? Math.max(8, r.top - menuHeight - 4)
          : Math.min(r.bottom + 4, Math.max(8, window.innerHeight - menuHeight - 8)),
        left: Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
      });
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target) && !e.target.closest("[data-resultsmenu-portal]")) setOpen(false);
    };
    const onClose = () => setOpen(false);
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        ref={btnRef} onClick={toggle} aria-label="Actions" aria-haspopup="menu" aria-expanded={open}
        title="Actions" data-open={open} className="mk-actionmenu-btn"
        style={{
          width: 34, height: 34, borderRadius: 0, border: `1.5px solid ${THEME.border}`, background: THEME.surface,
          cursor: "pointer", color: THEME.text, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}
      ><DotsVerticalIcon size={17} /></button>
      {open && createPortal(
        <div
          data-resultsmenu-portal role="menu" className="mk-actionmenu-panel"
          style={{
            position: "fixed", top: pos.top, left: pos.left, background: THEME.surface, border: `1px solid ${THEME.border}`,
            borderRadius: 0, boxShadow: "0 10px 30px rgba(15,23,42,0.18)", zIndex: 1000, width: MENU_WIDTH,
            overflow: "hidden", padding: 5,
          }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>,
        document.body
      )}
    </div>
  );
}
function MenuItem({ onClick, danger, icon, children }) {
  return (
    <button onClick={onClick} role="menuitem" className="mk-actionmenu-item" style={{
      display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 10px", fontSize: 12.5,
      fontWeight: 500, background: "transparent", border: "none", borderRadius: 0, cursor: "pointer",
      color: danger ? THEME.danger : THEME.text,
    }}>
      {icon && (
        <span style={{
          display: "flex", flexShrink: 0, alignItems: "center", justifyContent: "center", width: 22, height: 22,
          borderRadius: 0, background: danger ? THEME.dangerLight : THEME.bg, color: danger ? THEME.danger : THEME.muted,
        }}>{icon}</span>
      )}
      {children}
    </button>
  );
}
function StatusPill({ ok, children }) {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 0, background: ok ? THEME.successLight : THEME.warningLight, color: ok ? THEME.success : THEME.warning }}>{children}</span>;
}

// ══════════════════ COMPILED RESULTS (all roles) ══════════════════
// Laid out to match the printed NECTA-style report (CNO / CAND NAME / SEX /
// AGGT / DIV / DETAILS SUBJECTS, a compact Division Performance Summary,
// and an Exam Centre Overall/Subjects Performance block) - students are
// already returned by the backend ordered by registration number ascending,
// girls first then boys (see resultsController.js ORDER BY).
// ══════════════════ RIPOTI YA MZAZI (PARENT REPORT) ══════════════════
// Small options picker (Mhula + school closing/opening dates) shown right
// before either a single student's or the whole class's Parent Report PDF
// is generated - the report itself is entirely in Kiswahili, but this
// picker and its Download button stay English like the rest of the app UI.
function ParentReportOptionsModal({ sheetId, studentId, studentName, onClose }) {
  const { token } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const now = new Date();
  const [mhula, setMhula] = useState(MHULA_OPTIONS_FRONT[0]);
  const [closeDay, setCloseDay] = useState("");
  const [closeMonth, setCloseMonth] = useState("");
  const [closeYear, setCloseYear] = useState(String(now.getFullYear()));
  const [openDay, setOpenDay] = useState("");
  const [openMonth, setOpenMonth] = useState("");
  const [openYear, setOpenYear] = useState(String(now.getFullYear()));
  const [busy, setBusy] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [err, setErr] = useState("");

  const dayOptions = Array.from({ length: 31 }, (_, i) => String(i + 1));
  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(String);

  // Shared by both Download and Print - builds the same query string and
  // fetches the same PDF from the backend, so the two buttons can never
  // produce a different report from one another.
  const fetchReportBlob = async () => {
    const params = new URLSearchParams({
      sheet_id: sheetId, mhula,
      closing_day: closeDay, closing_month: closeMonth, closing_year: closeYear,
      opening_day: openDay, opening_month: openMonth, opening_year: openYear,
    });
    if (studentId) params.set("student_id", studentId);
    const path = studentId ? "/results-mgmt/parent-report/export-pdf" : "/results-mgmt/parent-report/export-pdf-all";
    const res = await fetch(`${API_BASE}${path}?${params.toString()}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error("Could not generate the report.");
    return res.blob();
  };

  const download = async () => {
    setBusy(true); setErr("");
    try {
      const blob = await fetchReportBlob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = studentId ? `Ripoti-ya-Mzazi-${(studentName || "mwanafunzi").replace(/\s+/g, "-")}.pdf` : "Ripoti-za-Wazazi.pdf";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 30000);
      onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  // Prints the report directly instead of making the person download it
  // first. The OS print dialog (where a printer - or "Save as PDF" - is
  // chosen) is a browser security boundary that no web page can skip or
  // pre-fill; this only removes the extra download step before that dialog
  // appears.
  //
  // Two different mechanisms are needed:
  // - Desktop: a hidden iframe loaded with the PDF, then
  //   iframe.contentWindow.print() opens the native print dialog directly.
  // - Mobile/tablet: iframe.print() is unreliable on iOS/Android browsers
  //   (Safari in particular silently ignores it), so instead the PDF opens
  //   in a new tab, where the phone/tablet's own PDF viewer already shows a
  //   Print/Share button in its toolbar - the one reliable path there.
  //   The tab is opened synchronously on the click itself (before the
  //   network request), because opening it only after the PDF has been
  //   fetched loses the "user gesture" and gets blocked as a pop-up by
  //   Safari/Chrome.
  const printReport = async () => {
    setErr("");
    const useNewTab = isMobile || isTablet;
    const preOpenedWin = useNewTab ? window.open("", "_blank") : null;
    if (useNewTab && !preOpenedWin) {
      setErr("Kivinjari kimezuia dirisha jipya (pop-up) - ruhusu pop-ups kwa tovuti hii kisha jaribu tena.");
      return;
    }
    setPrintBusy(true);
    try {
      const blob = await fetchReportBlob();
      const url = window.URL.createObjectURL(blob);
      if (preOpenedWin) {
        preOpenedWin.location = url;
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      } else {
        const iframe = document.createElement("iframe");
        iframe.style.position = "fixed";
        iframe.style.right = "0";
        iframe.style.bottom = "0";
        iframe.style.width = "0";
        iframe.style.height = "0";
        iframe.style.border = "0";
        iframe.src = url;
        iframe.onload = () => {
          try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
          catch { window.open(url, "_blank"); }
        };
        document.body.appendChild(iframe);
        setTimeout(() => { iframe.remove(); window.URL.revokeObjectURL(url); }, 60000);
      }
      onClose();
    } catch (e) {
      if (preOpenedWin) preOpenedWin.close();
      setErr(e.message);
    } finally { setPrintBusy(false); }
  };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 3100, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: THEME.surface, borderRadius: 0, width: "100%", maxWidth: 460, maxHeight: isMobile ? "92vh" : "88vh", overflowY: "auto", padding: isMobile ? 16 : 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15.5, color: THEME.heading }}>{studentId ? `Parent Report — ${studentName}` : "Parent Reports — All Students"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: THEME.muted }}><CloseIcon size={18} /></button>
        </div>

        {err && <div style={{ background: THEME.dangerLight, color: THEME.danger, padding: "8px 12px", borderRadius: 0, fontSize: 12.5, marginBottom: 12 }}>{err}</div>}

        <label style={labelStyle}>Mhula</label>
        <select value={mhula} onChange={(e) => setMhula(e.target.value)} style={{ ...selectStyle, width: "100%", marginBottom: 14 }}>
          {MHULA_OPTIONS_FRONT.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        <label style={labelStyle}>Tarehe ya Kufunga Shule</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <select value={closeDay} onChange={(e) => setCloseDay(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
            <option value="">Siku</option>{dayOptions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={closeMonth} onChange={(e) => setCloseMonth(e.target.value)} style={{ ...selectStyle, flex: 1.7 }}>
            <option value="">Mwezi</option>{SW_MONTHS_FRONT.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={closeYear} onChange={(e) => setCloseYear(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <label style={labelStyle}>Tarehe ya Kufungua Shule</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <select value={openDay} onChange={(e) => setOpenDay(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
            <option value="">Siku</option>{dayOptions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={openMonth} onChange={(e) => setOpenMonth(e.target.value)} style={{ ...selectStyle, flex: 1.7 }}>
            <option value="">Mwezi</option>{SW_MONTHS_FRONT.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={openYear} onChange={(e) => setOpenYear(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: isMobile ? "column-reverse" : "row", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={busy || printBusy} style={{ ...btnSecondary, ...(isMobile ? { width: "100%" } : {}) }}>Cancel</button>
          <button
            onClick={printReport} disabled={busy || printBusy}
            style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, ...(isMobile ? { width: "100%" } : {}) }}
          >
            {printBusy ? <SpinnerIcon size={14} /> : <PrinterIcon size={14} />}{printBusy ? "Inatayarisha…" : "Print"}
          </button>
          <button
            onClick={download} disabled={busy || printBusy}
            style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, ...(isMobile ? { width: "100%" } : {}) }}
          >
            {busy ? <SpinnerIcon size={14} /> : <DownloadIcon size={14} />}{busy ? "Generating…" : "Download PDF"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Same default text as the backend's DEFAULT_TEMPLATE (resultsSmsController.js)
// - shown pre-filled so most schools never need to type anything, but every
// token stays fully editable/removable before the first Preview. Short,
// single-SMS-part message for most names; "MHULA WA II" and the reopening
// date are literal text to edit by hand each term (not derivable from any
// field in the system) - everything else fills in per student.
const DEFAULT_RESULTS_SMS_TEMPLATE =
  "{school_short}: {student_name} - MHULA WA II ({month_name_sw} {year}). " +
  "Jumla {total_marks}, Wastani {average}, Daraja {avg_grade}, Nafasi {position}/{total_students}, " +
  "Point {points}, Div {division}. Shule Itafunguliwa: [tarehe]";

// Used when Provider = Android SMS Gateway (sent from the school's own
// phone/SIM, so per-segment cost isn't a concern the way it is with
// NextSMS) — mirrors the school's old printed report layout, per spec.
// Must match DEFAULT_TEMPLATE_ANDROID in resultsSmsController.js exactly.
const DEFAULT_RESULTS_SMS_TEMPLATE_ANDROID =
  "SHULE YA SEKONDARI MIKUMBI\n" +
  "RIPOTI YA MAENDELEO YA MWANAFUNZI KATIKA {exam_type_sw} {month_sw} MWAKA {year}\n" +
  "KWA MZAZI/MLEZI WA: {student_name}\n" +
  "JINSIA KIDATO NAMBA YA USAJILI\n" +
  "{gender_letter} {form_sw} {reg_no}\n" +
  "A: TAARIFA YA MAENDELEO YA KITAALUMA\n" +
  "SOMO ALAMA ZA MTIHANI DARAJA MAONI\n" +
  "{subjects_breakdown_long}\n" +
  "JUMLA YA ALAMA: {total_marks}\n" +
  "WASTANI: {average} DARAJA: {avg_grade}\n" +
  "AMEKUWA MWANAFUNZI WA {position} KATI YA {total_students} WALIOFANYA MTIHANI\n" +
  "AMEPATA POINT {points} SAWA NA DIVISION {division}\n" +
  "Shule Imefungwa leo tarehe [tarehe], na Itafunguliwa tarehe [tarehe]";

const RESULTS_SMS_PLACEHOLDERS = [
  { token: "{school_name}", label: "School Name" },
  { token: "{school_short}", label: "School Name (Short)" },
  { token: "{student_name}", label: "Student Name" },
  { token: "{parent_name}", label: "Parent/Guardian" },
  { token: "{reg_no}", label: "Reg No" },
  { token: "{form}", label: "Form" },
  { token: "{form_sw}", label: "Form (Kidato...)" },
  { token: "{gender_letter}", label: "Gender (F/M)" },
  { token: "{exam_type}", label: "Exam Type" },
  { token: "{exam_type_sw}", label: "Exam Type (Kiswahili)" },
  { token: "{month}", label: "Month" },
  { token: "{month_sw}", label: "Month (Mwezi wa...)" },
  { token: "{month_name_sw}", label: "Month (Agosti)" },
  { token: "{year}", label: "Year" },
  { token: "{subjects_breakdown}", label: "Subjects & Marks" },
  { token: "{subjects_breakdown_long}", label: "Subjects, Marks, Grade & Comment" },
  { token: "{total_marks}", label: "Total Marks" },
  { token: "{subjects_sat}", label: "Subjects Sat" },
  { token: "{average}", label: "Average (Wastani)" },
  { token: "{division}", label: "Division" },
  { token: "{avg_grade}", label: "Avg Grade" },
  { token: "{points}", label: "Points" },
  { token: "{position}", label: "Position" },
  { token: "{total_students}", label: "Out Of" },
];

function ResultsSmsModal({ sheetId, periodLabel, onClose }) {
  const { token } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const { confirm, ConfirmDialogPortal } = useConfirm();
  const textareaRef = useRef(null);

  const [step, setStep] = useState("compose"); // compose | review | done
  const [provider, setProvider] = useState("nextsms"); // nextsms | android_gateway
  const [template, setTemplate] = useState(DEFAULT_RESULTS_SMS_TEMPLATE);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState(null); // { sheet, matched, unmatched, total_students }
  const [selectedIds, setSelectedIds] = useState([]);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // Switching provider swaps in that provider's default template — but ONLY
  // if the sender hasn't started customizing their own text, so this can
  // never silently overwrite something they were already editing.
  const changeProvider = (next) => {
    setProvider(next);
    const otherDefault = next === "android_gateway" ? DEFAULT_RESULTS_SMS_TEMPLATE : DEFAULT_RESULTS_SMS_TEMPLATE_ANDROID;
    const thisDefault = next === "android_gateway" ? DEFAULT_RESULTS_SMS_TEMPLATE_ANDROID : DEFAULT_RESULTS_SMS_TEMPLATE;
    if (template === otherDefault || !template.trim()) setTemplate(thisDefault);
  };

  // Inserts a placeholder token at the cursor's current position (not just
  // tacked onto the end) so composing/editing the message stays natural -
  // click into the middle of a sentence, tap a token, keep typing.
  const insertPlaceholder = (tok) => {
    const ta = textareaRef.current;
    const start = ta ? (ta.selectionStart ?? template.length) : template.length;
    const end = ta ? (ta.selectionEnd ?? template.length) : template.length;
    const next = template.slice(0, start) + tok + template.slice(end);
    setTemplate(next);
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      const pos = start + tok.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const runPreview = async () => {
    if (!template.trim()) { setErr("Write a message template first."); return; }
    setBusy(true); setErr("");
    try {
      const data = await apiFetch("/results-mgmt/results-sms/preview", { method: "POST", body: JSON.stringify({ sheet_id: sheetId, template, provider }) }, token);
      setPreview(data);
      setSelectedIds(data.matched.map((m) => m.student_id));
      setStep("review");
    } catch (e) { setErr(e.message || "Could not build the preview."); } finally { setBusy(false); }
  };

  const toggleOne = (id) => setSelectedIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const selectAll = () => setSelectedIds(preview.matched.map((m) => m.student_id));
  const clearAll = () => setSelectedIds([]);

  const doSend = () => {
    if (!selectedIds.length) return;
    confirm(
      `Send this result message to ${selectedIds.length} parent${selectedIds.length === 1 ? "" : "s"}? This cannot be undone.`,
      async () => {
        setBusy(true); setErr("");
        try {
          const data = await apiFetch("/results-mgmt/results-sms/send", { method: "POST", body: JSON.stringify({ sheet_id: sheetId, template, student_ids: selectedIds, provider }) }, token);
          setSendResult(data);
          setStep("done");
          if (data.status === "sent") showSuccess("Results SMS", data.message);
        } catch (e) { setErr(e.message || "Could not send the results SMS."); } finally { setBusy(false); }
      },
      { confirmLabel: "Yes, Send", cancelLabel: "Cancel", danger: false }
    );
  };

  const selectedCount = selectedIds.length;
  const selectedSegments = preview ? preview.matched.filter((m) => selectedIds.includes(m.student_id)).reduce((a, m) => a + m.sms_segments, 0) : 0;

  return createPortal(
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 3200, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 20 }} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: THEME.surface, borderRadius: 0, width: "100%", maxWidth: 620, maxHeight: isMobile ? "94vh" : "90vh", overflowY: "auto", padding: isMobile ? 16 : 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4, gap: 10 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15.5, color: THEME.heading, display: "flex", alignItems: "center", gap: 8 }}><MessageIcon size={16} />Send Results via SMS</h3>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, color: THEME.muted }}>{periodLabel}</p>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: THEME.muted, flexShrink: 0 }}><CloseIcon size={18} /></button>
          </div>

          {err && <div style={{ background: THEME.dangerLight, color: THEME.danger, padding: "8px 12px", borderRadius: 0, fontSize: 12.5, margin: "12px 0" }}>⚠ {err}</div>}

          {step === "compose" && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 12, color: THEME.muted, lineHeight: 1.5, margin: "0 0 12px" }}>
                Every parent gets a message with their own child's details filled in automatically - nothing here is shared verbatim between students.
              </p>

              <label style={labelStyle}>Provider</label>
              <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                {[["nextsms", "NEXTSMS"], ["android_gateway", "Android SMS Gateway"]].map(([val, label]) => (
                  <label key={val} style={{
                    display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 0,
                    border: `1.5px solid ${provider === val ? THEME.navy : THEME.border}`,
                    background: provider === val ? `${THEME.navy}10` : "transparent", cursor: "pointer", fontSize: 12.5,
                  }}>
                    <input type="radio" name="results_sms_provider" checked={provider === val} onChange={() => changeProvider(val)} />
                    {label}
                  </label>
                ))}
              </div>

              <label style={labelStyle}>Message Template</label>
              <textarea
                ref={textareaRef}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                rows={6}
                style={{ ...inputStyle, width: "100%", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {RESULTS_SMS_PLACEHOLDERS.map((p) => (
                  <button type="button" key={p.token} onClick={() => insertPlaceholder(p.token)} style={chipBtnStyle}>+ {p.label}</button>
                ))}
              </div>
              <p style={{ fontSize: 11, color: THEME.muted, marginTop: 10 }}>{template.length} characters · roughly {template.length <= 160 ? 1 : Math.ceil(template.length / 153)} SMS part(s) per student (varies slightly once names/marks are filled in).</p>

              <div style={{ display: "flex", flexDirection: isMobile ? "column-reverse" : "row", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
                <button onClick={onClose} disabled={busy} style={{ ...btnSecondary, ...(isMobile ? { width: "100%" } : {}) }}>Cancel</button>
                <button onClick={runPreview} disabled={busy} style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, ...(isMobile ? { width: "100%" } : {}) }}>
                  {busy ? <SpinnerIcon size={14} /> : <SearchIcon size={14} />}{busy ? "Preparing…" : "Preview Messages"}
                </button>
              </div>
            </div>
          )}

          {step === "review" && preview && (
            <div style={{ marginTop: 14 }}>
              <div style={{ background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 0, padding: "8px 12px", fontSize: 12, color: THEME.text, marginBottom: 12 }}>
                {preview.total_students} student(s) with results · {preview.matched.length} have a parent phone on file · {preview.unmatched.length} do not
              </div>

              {preview.unmatched.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <button type="button" onClick={() => setShowUnmatched((v) => !v)} style={{ ...chipBtnStyle, background: THEME.warningLight, borderColor: THEME.warning, color: THEME.warning, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <InfoIcon size={12} />{preview.unmatched.length} student(s) will be skipped (no parent phone)
                    <ChevronDownIcon size={11} style={{ transform: showUnmatched ? "rotate(180deg)" : "none" }} />
                  </button>
                  {showUnmatched && (
                    <div style={{ marginTop: 6, border: `1px solid ${THEME.border}`, borderRadius: 0, maxHeight: 140, overflowY: "auto" }}>
                      {preview.unmatched.map((u) => (
                        <div key={u.student_id} style={{ padding: "7px 12px", borderBottom: `1px solid ${THEME.border}`, fontSize: 12 }}>
                          <b>{u.full_name}</b> <span style={{ color: THEME.muted }}>· Reg No: {u.reg_no || "-"}</span>
                          <div style={{ color: THEME.muted, fontSize: 11 }}>{u.reason}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11.5, color: THEME.muted }}>{selectedCount} of {preview.matched.length} selected · ~{selectedSegments} SMS part(s) total</span>
                <div style={{ display: "flex", gap: 12 }}>
                  <button type="button" onClick={selectAll} style={{ ...linkBtnStyle, display: "inline-flex", alignItems: "center", gap: 4 }}><CheckIcon size={11} />Select all</button>
                  <button type="button" onClick={clearAll} style={{ ...linkBtnStyle, display: "inline-flex", alignItems: "center", gap: 4 }}><CloseIcon size={11} />Clear</button>
                </div>
              </div>

              <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${THEME.border}`, borderRadius: 0 }}>
                {preview.matched.length === 0 && (
                  <div style={{ padding: 14, fontSize: 12.5, color: THEME.muted }}>No student on this sheet has a saved parent phone number yet.</div>
                )}
                {preview.matched.map((m) => (
                  <label key={m.student_id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderBottom: `1px solid ${THEME.border}`, cursor: "pointer" }}>
                    <input type="checkbox" checked={selectedIds.includes(m.student_id)} onChange={() => toggleOne(m.student_id)} style={{ marginTop: 3, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, display: "grid", gap: 3 }}>
                      <span style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <b style={{ fontSize: 12.5 }}>{m.full_name}</b>
                        <span style={{ color: THEME.muted, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{m.phone}</span>
                      </span>
                      <span style={{ color: THEME.muted, fontSize: 11 }}>{m.parent_name || "Parent/Guardian"} · Reg No: {m.reg_no || "-"}</span>
                      <span style={{ background: THEME.bg, borderRadius: 0, padding: "6px 8px", fontSize: 11.5, color: THEME.text, lineHeight: 1.5, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{m.message}</span>
                      <span style={{ color: THEME.muted, fontSize: 10.5 }}>{m.char_count} characters · {m.sms_segments} SMS part(s)</span>
                    </span>
                  </label>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: isMobile ? "column-reverse" : "row", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
                <button onClick={() => setStep("compose")} disabled={busy} style={{ ...btnSecondary, ...(isMobile ? { width: "100%" } : {}) }}>Back to Edit</button>
                <button onClick={doSend} disabled={busy || !selectedCount} style={{ ...btnPrimary, opacity: (busy || !selectedCount) ? 0.55 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, ...(isMobile ? { width: "100%" } : {}) }}>
                  {busy ? <SpinnerIcon size={14} /> : <SendIcon size={14} />}{busy ? "Sending…" : `Send to ${selectedCount} Parent${selectedCount === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          )}

          {step === "done" && sendResult && (
            <div style={{ marginTop: 14 }}>
              <div style={{
                background: sendResult.status === "sent" ? THEME.successLight : sendResult.status === "partial" ? THEME.warningLight : THEME.dangerLight,
                color: sendResult.status === "sent" ? THEME.success : sendResult.status === "partial" ? THEME.warning : THEME.danger,
                borderRadius: 0, padding: "12px 14px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8,
              }}>
                <CheckCircleIcon size={16} />{sendResult.message}
              </div>

              {sendResult.failures && sendResult.failures.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: THEME.danger, margin: "0 0 6px" }}>Failed to send ({sendResult.failures.length}):</p>
                  <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 0, maxHeight: 140, overflowY: "auto" }}>
                    {sendResult.failures.map((f, i) => (
                      <div key={i} style={{ padding: "7px 12px", borderBottom: `1px solid ${THEME.border}`, fontSize: 12 }}>
                        <b>{f.student_name}</b> <span style={{ color: THEME.muted }}>· {f.phone}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {sendResult.skipped && sendResult.skipped.length > 0 && (
                <p style={{ fontSize: 11.5, color: THEME.muted, marginTop: 10 }}>Skipped (no parent phone): {sendResult.skipped.join(", ")}</p>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
                <button onClick={onClose} style={{ ...btnPrimary, ...(isMobile ? { width: "100%" } : {}) }}>Close</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {ConfirmDialogPortal}
    </>,
    document.body
  );
}

const chipBtnStyle = { padding: "5px 10px", borderRadius: 0, border: `1px solid ${THEME.border}`, background: THEME.bg, color: THEME.text, fontSize: 11, fontWeight: 600, cursor: "pointer" };
const linkBtnStyle = { background: "none", border: "none", color: THEME.heading, fontSize: 11.5, fontWeight: 600, cursor: "pointer", padding: 0 };

function CompiledResults({ period }) {
  const { token } = useAuth();
  const { isMobile } = useBreakpoint();
  const [data, setData] = useState(null);
  const [sheetId, setSheetId] = useState(null);
  const [busyPdf, setBusyPdf] = useState(false);
  const [pdfErr, setPdfErr] = useState("");

  useEffect(() => {
    apiFetch(`/results-mgmt/sheet?period_id=${period.id}&form=${encodeURIComponent(period.form)}`, {}, token).then((sh) => {
      if (!sh) return;
      setSheetId(sh.id);
      apiFetch(`/results-mgmt/results?sheet_id=${sh.id}`, {}, token).then(setData).catch(() => {});
    });
  }, [period, token]);

  // Print opens the compiled-results PDF inline via a blob URL (browser's
  // own viewer/print dialog); Export PDF saves the same file to disk.
  const pdfAction = async (mode) => {
    if (!sheetId) return;
    setBusyPdf(true); setPdfErr("");
    try {
      const res = await fetch(`${API_BASE}/results-mgmt/export-pdf?sheet_id=${sheetId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Could not generate the PDF.");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      if (mode === "print") {
        window.open(url, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = url; a.download = `${period.form}-${period.exam_type}-results.pdf`.replace(/\s+/g, "-");
        document.body.appendChild(a); a.click(); a.remove();
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 30000);
    } catch (err) { setPdfErr(err.message); } finally { setBusyPdf(false); }
  };

  if (!data) return <p style={{ color: THEME.muted, fontSize: 13.5, display: "flex", alignItems: "center", gap: 7 }}><SpinnerIcon size={14} /> Loading...</p>;
  if (!data.students.length) return <p style={{ color: THEME.muted, fontSize: 13.5 }}>No results yet for this period.</p>;

  // Subject order/names come from subject_performance (already sorted by
  // sort_order server-side) so "DETAILS SUBJECTS" lists subjects in the
  // same order for every student, matching the printed report.
  const subjectList = (data.subject_performance || []).map((sp) => ({ code: sp.subject_code, name: sp.subject_name }));

  const divisions = ["I", "II", "III", "IV", "0"];
  const divGrid = { F: {}, M: {} };
  let totalF = 0, totalM = 0;
  const colTotals = {};
  (data.division_summary || []).forEach((r) => {
    const g = r.gender === "Female" ? "F" : r.gender === "Male" ? "M" : null;
    if (!g) return;
    divGrid[g][r.division] = Number(r.count);
    colTotals[r.division] = (colTotals[r.division] || 0) + Number(r.count);
    if (g === "F") totalF += Number(r.count); else totalM += Number(r.count);
  });

  return (
    <div style={{ background: NECTA_SUMMARY_BG, padding: "14px 16px", borderRadius: 0 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={() => pdfAction("print")} disabled={!sheetId || busyPdf} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, ...(isMobile ? { flex: 1, textAlign: "center" } : {}) }}>{busyPdf ? <SpinnerIcon size={14} /> : <PrinterIcon size={14} />}Print</button>
        <button onClick={() => pdfAction("export")} disabled={!sheetId || busyPdf} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, ...(isMobile ? { flex: 1, textAlign: "center" } : {}) }}>{busyPdf ? <SpinnerIcon size={14} /> : <DownloadIcon size={14} />}Export PDF</button>
      </div>
      {pdfErr && <p style={{ fontSize: 12.5, color: THEME.danger, marginTop: -6, marginBottom: 12 }}>{pdfErr}</p>}

      {/* ── DIVISION PERFORMANCE SUMMARY - deliberately compact/small,
          like the printed report, not a full-width table. The light-blue
          backdrop (rgb(173, 216, 230) - NECTA_SUMMARY_BG) now covers the
          WHOLE results page (see the outer wrapping div above), matching
          necta.go.tz's own report, not just this one section. ── */}
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 11.5, fontWeight: 700, color: NECTA_TEXT, marginBottom: 6, letterSpacing: 0.3 }}>DIVISION PERFORMANCE SUMMARY</p>
        <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 10.5, width: "auto", maxWidth: 340 }}>
          <thead>
            <tr>
              <th style={nectaThGroove}>SEX</th>
              {divisions.map((d) => <th key={d} style={nectaThGroove}>{d}</th>)}
              <th style={nectaThGroove}>T</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={nectaTdGroove}>F</td>
              {divisions.map((d) => <td key={d} style={nectaTdGroove}>{divGrid.F[d] || 0}</td>)}
              <td style={{ ...nectaTdGroove, fontWeight: 700 }}>{totalF}</td>
            </tr>
            <tr>
              <td style={nectaTdGroove}>M</td>
              {divisions.map((d) => <td key={d} style={nectaTdGroove}>{divGrid.M[d] || 0}</td>)}
              <td style={{ ...nectaTdGroove, fontWeight: 700 }}>{totalM}</td>
            </tr>
            <tr style={{ fontWeight: 700 }}>
              <td style={nectaTdGroove}>T</td>
              {divisions.map((d) => <td key={d} style={nectaTdGroove}>{colTotals[d] || 0}</td>)}
              <td style={nectaTdGroove}>{totalF + totalM}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>

      {isMobile && <div style={{ fontSize: 11, color: THEME.muted, marginBottom: 6 }}>↔ Swipe sideways to see every column</div>}
      <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 720 }}>
        <thead>
          <tr>
            <th style={nectaThGroove}>Reg.No</th><th style={{ ...nectaThGroove, textAlign: "left" }}>CAND NAME</th><th style={nectaThGroove}>SEX</th><th style={nectaThGroove}>AGGT</th><th style={nectaThGroove}>DIV</th><th style={nectaThGroove}>POS</th><th style={{ ...nectaThGroove, textAlign: "left" }}>DETAILS SUBJECTS</th>
          </tr>
        </thead>
        <tbody>
          {data.students.map((s, i) => {
            const details = subjectList
              .map(({ code }) => {
                const cell = s.scores[code];
                // A subject the student wasn't given marks for never shows.
                if (!cell || cell.marks == null || !cell.grade) return null;
                const marks = Math.round(Number(cell.marks));
                return `${code} - ${marks} '${cell.grade}'`;
              })
              .filter(Boolean)
              .join(", ");
            return (
              <tr key={s.student_id}>
                <td style={nectaTdGroove}>{s.reg_no || s.entry_no || "-"}</td>
                <td style={{ ...nectaTdGroove, textAlign: "left" }}>{s.full_name}</td>
                <td style={nectaTdGroove}>{sexLabel(s.gender)}</td>
                <td style={nectaTdGroove}>{s.points ?? "-"}</td>
                <td style={nectaTdGroove}>{s.division ?? "-"}</td>
                <td style={nectaTdGroove}>{s.position ?? "-"}</td>
                <td style={{ ...nectaTdGroove, textAlign: "left", whiteSpace: "normal", minWidth: 300 }}>{details || "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {/* ── SCHOOL EXAMINATION SUBJECT PERFORMANCE ── */}
      {data.subject_performance?.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: THEME.heading, marginBottom: 6, letterSpacing: 0.3 }}>SCHOOL EXAMINATION SUBJECT PERFORMANCE</p>
          <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 10.5, minWidth: 680 }}>
            <thead>
              <tr>
                <th style={{ ...nectaTh, textAlign: "left" }}>SUBJECT</th><th style={nectaTh}>A</th><th style={nectaTh}>B</th><th style={nectaTh}>C</th><th style={nectaTh}>D</th><th style={nectaTh}>F</th>
                <th style={nectaTh}>SAT</th><th style={nectaTh}>PASS %</th><th style={nectaTh}>GPA</th><th style={nectaTh}>COMPETENCY LEVEL</th>
              </tr>
            </thead>
            <tbody>
              {data.subject_performance.map((sp) => {
                const grade = competencyGrade(sp.competency_level);
                const colors = COMPETENCY_COLORS[grade] || {};
                return (
                  <tr key={sp.subject_code}>
                    <td style={{ ...nectaTd, textAlign: "left" }}>{sp.subject_name}</td>
                    <td style={nectaTd}>{sp.grade_a}</td>
                    <td style={nectaTd}>{sp.grade_b}</td>
                    <td style={nectaTd}>{sp.grade_c}</td>
                    <td style={nectaTd}>{sp.grade_d}</td>
                    <td style={nectaTd}>{sp.grade_f}</td>
                    <td style={nectaTd}>{sp.total_sat}</td>
                    <td style={nectaTd}>{Math.round(Number(sp.pass_pct))}</td>
                    <td style={nectaTd}>{sp.gpa}</td>
                    <td style={{ ...nectaTd, fontWeight: 700, background: colors.background, color: colors.color }}>{sp.competency_level || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* ── TEACHER / SUBJECT PERFORMANCE - every count (SAT/A-F/A-C/A-D/PASS/GPA)
          computed server-side in the same subject_performance view as the
          table above, plus the Female/Male split per grade band, attaching
          the responsible teacher's name. Mirrors the school's paper mark
          sheet: TEACHER | SOMO | SAT | A..F/A-C/A-D/PASS each as F|M|T|% | GPA. ── */}
      {data.teacher_subject_performance?.length > 0 && (() => {
        const tspGroups = [
          { key: "A", label: "A", colors: COMPETENCY_COLORS.A, fKey: "grade_a_f", mKey: "grade_a_m", tKey: "grade_a", pKey: "pct_a" },
          { key: "B", label: "B", colors: COMPETENCY_COLORS.B, fKey: "grade_b_f", mKey: "grade_b_m", tKey: "grade_b", pKey: "pct_b" },
          { key: "C", label: "C", colors: COMPETENCY_COLORS.C, fKey: "grade_c_f", mKey: "grade_c_m", tKey: "grade_c", pKey: "pct_c" },
          { key: "D", label: "D", colors: COMPETENCY_COLORS.D, fKey: "grade_d_f", mKey: "grade_d_m", tKey: "grade_d", pKey: "pct_d" },
          { key: "F", label: "F", colors: COMPETENCY_COLORS.F, fKey: "grade_f_f", mKey: "grade_f_m", tKey: "grade_f", pKey: "pct_f" },
          { key: "AC", label: "A-C", colors: RANGE_COLORS.AC, fKey: "a_to_c_f", mKey: "a_to_c_m", tKey: "a_to_c_count", pKey: "a_to_c_pct" },
          { key: "AD", label: "A-D", colors: RANGE_COLORS.AD, fKey: "a_to_d_f", mKey: "a_to_d_m", tKey: "a_to_d_count", pKey: "a_to_d_pct" },
          { key: "PASS", label: "PASS", colors: RANGE_COLORS.PASS, fKey: "pass_f", mKey: "pass_m", tKey: "pass_count", pKey: "pass_pct" },
        ];
        return (
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 11.5, fontWeight: 700, color: THEME.heading, marginBottom: 6, letterSpacing: 0.3 }}>SUBJECT PERFORMANCE</p>
            <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 10.5, minWidth: 1200 }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ ...nectaTh, textAlign: "left", verticalAlign: "middle" }}>SOMO</th>
                  <th rowSpan={2} style={{ ...nectaTh, verticalAlign: "middle" }}>SAT</th>
                  {tspGroups.map((g) => (
                    <th key={g.key} colSpan={4} style={{ ...nectaTh, background: g.colors.background, color: g.colors.color }}>{g.label}</th>
                  ))}
                  <th rowSpan={2} style={{ ...nectaTh, verticalAlign: "middle" }}>GPA</th>
                </tr>
                <tr>
                  {tspGroups.map((g) => (
                    <Fragment key={g.key}>
                      <th style={{ ...nectaTh, background: g.colors.background, color: g.colors.color, fontSize: 9 }}>F</th>
                      <th style={{ ...nectaTh, background: g.colors.background, color: g.colors.color, fontSize: 9 }}>M</th>
                      <th style={{ ...nectaTh, background: g.colors.background, color: g.colors.color, fontSize: 9 }}>T</th>
                      <th style={{ ...nectaTh, background: g.colors.background, color: g.colors.color, fontSize: 9 }}>%</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.teacher_subject_performance.map((tp) => (
                  <tr key={tp.subject_id}>
                    <td style={{ ...nectaTd, textAlign: "left" }}>{tp.subject_name}</td>
                    <td style={nectaTd}>{tp.total_sat}</td>
                    {tspGroups.map((g) => (
                      <Fragment key={g.key}>
                        <td style={{ ...nectaTd, background: g.colors.background, color: g.colors.color }}>{tp[g.fKey] ?? 0}</td>
                        <td style={{ ...nectaTd, background: g.colors.background, color: g.colors.color }}>{tp[g.mKey] ?? 0}</td>
                        <td style={{ ...nectaTd, background: g.colors.background, color: g.colors.color, fontWeight: 700 }}>{tp[g.tKey] ?? 0}</td>
                        <td style={{ ...nectaTd, background: g.colors.background, color: g.colors.color }}>{tp[g.pKey] == null ? "-" : Math.round(Number(tp[g.pKey]))}</td>
                      </Fragment>
                    ))}
                    <td style={nectaTd}>{tp.gpa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        );
      })()}

      {/* ── TOP 10 / BOTTOM 10 PERFORMERS - shown right after SCHOOL
          EXAMINATION SUBJECT PERFORMANCE, matching the exported PDF's order. ── */}
      <div style={{ marginTop: 20 }}>
        <TopBottomPerformers students={data.students} isMobile={isMobile} />
      </div>
    </div>
  );
}

// ══════════════════ PARENTS REPORTS (PDF + SMS) ══════════════════
// Groups the two parent-facing tools - the Parent Report PDF and the SMS
// broadcast - into their own tab, separate from the compiled/general
// "Results" tab. Parent Report (PDF) is available to Admin, Second Master,
// Academic, AND a Class Teacher for their own class only (the backend
// enforces that scoping regardless of what the UI shows); Send Results via
// SMS stays Admin/Second Master/Academic only, unchanged.
function ParentsReports({ period }) {
  const { user, token } = useAuth();
  const { isMobile } = useBreakpoint();
  const [data, setData] = useState(null);
  const [sheetId, setSheetId] = useState(null);
  const [loadErr, setLoadErr] = useState("");

  const myRoles = user.roles && user.roles.length ? user.roles : [user.role];
  const canParentReport = myRoles.includes("admin") || myRoles.includes("second_master") || myRoles.includes("academic") || myRoles.includes("class_teacher");
  const canSms = myRoles.includes("admin") || myRoles.includes("second_master") || myRoles.includes("academic");
  const [prSearch, setPrSearch] = useState("");
  const [prPicker, setPrPicker] = useState(null); // null | { studentId, studentName } | "all"
  const [smsModalOpen, setSmsModalOpen] = useState(false);

  useEffect(() => {
    setData(null); setSheetId(null); setLoadErr("");
    apiFetch(`/results-mgmt/sheet?period_id=${period.id}&form=${encodeURIComponent(period.form)}`, {}, token).then((sh) => {
      if (!sh) return;
      setSheetId(sh.id);
      apiFetch(`/results-mgmt/results?sheet_id=${sh.id}`, {}, token).then(setData).catch((err) => setLoadErr(err.message));
    }).catch((err) => setLoadErr(err.message));
  }, [period, token]);

  if (loadErr) return <p style={{ color: THEME.danger, fontSize: 13.5 }}>{loadErr}</p>;
  if (!data) return <p style={{ color: THEME.muted, fontSize: 13.5, display: "flex", alignItems: "center", gap: 7 }}><SpinnerIcon size={14} /> Loading...</p>;
  if (!data.students.length) return <p style={{ color: THEME.muted, fontSize: 13.5 }}>No results yet for this period.</p>;

  return (
    <div>
      {canParentReport && sheetId && (
        <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, padding: isMobile ? 12 : 14, marginBottom: 18, maxWidth: 640 }}>
          <p style={{ margin: "0 0 10px", fontSize: 12.5, fontWeight: 700, color: THEME.heading }}>Parent Report (PDF)</p>
          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8, flexWrap: "wrap", alignItems: isMobile ? "stretch" : "center" }}>
            <input
              value={prSearch}
              onChange={(e) => setPrSearch(e.target.value)}
              placeholder="Type student name for one report…"
              style={{ ...inputStyle, flex: 1, minWidth: isMobile ? "auto" : 200 }}
            />
            <button onClick={() => setPrPicker("all")} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, whiteSpace: "nowrap", ...(isMobile ? { width: "100%" } : {}) }}>
              <DownloadIcon size={14} />Download All (PDF)
            </button>
          </div>
          {prSearch.trim().length >= 2 && (
            <div style={{ marginTop: 8, border: `1px solid ${THEME.border}`, borderRadius: 0, overflow: "hidden", maxHeight: 180, overflowY: "auto" }}>
              {data.students
                .filter((s) => s.full_name.toLowerCase().includes(prSearch.trim().toLowerCase()))
                .slice(0, 8)
                .map((s) => (
                  <button
                    key={s.student_id}
                    onClick={() => { setPrPicker({ studentId: s.student_id, studentName: s.full_name }); setPrSearch(""); }}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderBottom: `1px solid ${THEME.border}`, background: THEME.surface, cursor: "pointer", fontSize: 13 }}
                  >
                    {s.full_name} <span style={{ color: THEME.muted, fontSize: 11.5 }}>· Reg No: {s.reg_no || "-"}</span>
                  </button>
                ))}
              {!data.students.some((s) => s.full_name.toLowerCase().includes(prSearch.trim().toLowerCase())) && (
                <div style={{ padding: 10, fontSize: 12.5, color: THEME.muted }}>No students matched "{prSearch}".</div>
              )}
            </div>
          )}
        </div>
      )}

      {prPicker && (
        <ParentReportOptionsModal
          sheetId={sheetId}
          studentId={prPicker === "all" ? null : prPicker.studentId}
          studentName={prPicker === "all" ? null : prPicker.studentName}
          onClose={() => setPrPicker(null)}
        />
      )}

      {canSms && sheetId && (
        <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, padding: isMobile ? 12 : 14, marginBottom: 18, maxWidth: 640 }}>
          <p style={{ margin: "0 0 4px", fontSize: 12.5, fontWeight: 700, color: THEME.heading }}>Send Results to Parents (SMS)</p>
          <p style={{ margin: "0 0 10px", fontSize: 11.5, color: THEME.muted, lineHeight: 1.5 }}>
            Automatically texts each student's own compiled result to their own registered parent number - matched by student, never mixed up.
            You choose whether it goes to every matched parent or only the ones you select, and you can always review the exact message before anything is sent.
          </p>
          <button onClick={() => setSmsModalOpen(true)} style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, ...(isMobile ? { width: "100%" } : {}) }}>
            <MessageIcon size={14} />Send Results via SMS
          </button>
        </div>
      )}

      {smsModalOpen && (
        <ResultsSmsModal
          sheetId={sheetId}
          periodLabel={`${period.form} · ${period.exam_type} · ${period.month} ${period.year}`}
          onClose={() => setSmsModalOpen(false)}
        />
      )}

      {!canParentReport && !canSms && (
        <p style={{ color: THEME.muted, fontSize: 13.5 }}>Nothing available here for your account.</p>
      )}
    </div>
  );
}

// ══════════════════ SEARCH STUDENT RESULTS (Academic Master) ══════════════════
// Class → search student name → pick exam period → view/print/export - the
// Academic Master's own entry point into the same per-student result lookup
// used from Students Management (Admin/Second Master use the ⋮ menu there
// instead, since they're already looking at one chosen student).
function AcademicStudentResultsModal({ token, onClose }) {
  const { isMobile } = useBreakpoint();
  const [form, setForm] = useState(FORMS[0]);
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);
  const [student, setStudent] = useState(null);

  const [periods, setPeriods] = useState([]);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [sel, setSel] = useState({ form: "", exam_type: "", month: "", year: "" });
  const [result, setResult] = useState(null);
  const [loadingResult, setLoadingResult] = useState(false);
  const [busyPdf, setBusyPdf] = useState(false);
  const [err, setErr] = useState("");

  // Guards the search-effect below against its own side effect: picking a
  // student clears the search box (setSearch("")) so the box is tidy for
  // next time, but clearing `search` is itself a change to `search` - which
  // used to re-run the debounced search effect immediately, and that effect
  // unconditionally did setStudent(null) at its top, wiping out the student
  // that was just picked a moment earlier. This flag tells that one effect
  // run "this blank search was OUR reset, not the person clearing the box
  // themselves" so it leaves the picked student alone.
  const justPickedRef = useRef(false);

  // Debounced name search within the chosen class.
  useEffect(() => {
    if (justPickedRef.current) { justPickedRef.current = false; return; }
    setStudent(null); setResult(null);
    if (!search.trim()) { setMatches([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      apiFetch(`/students?form=${encodeURIComponent(form)}&search=${encodeURIComponent(search.trim())}`, {}, token)
        .then((res) => setMatches((res.data || []).slice(0, 8)))
        .catch((e) => setErr(e.message))
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(t);
  }, [search, form, token]);

  const pickStudent = (s) => {
    justPickedRef.current = true;
    setStudent(s); setMatches([]); setSearch(""); setResult(null); setErr("");
    setLoadingPeriods(true);
    apiFetch(`/results-mgmt/student-periods?student_id=${s.id}`, {}, token)
      .then((rows) => {
        setPeriods(rows || []);
        if (rows && rows.length) {
          const first = rows[0];
          setSel({ form: first.form, exam_type: first.exam_type, month: first.month, year: String(first.year) });
        } else setSel({ form: "", exam_type: "", month: "", year: "" });
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoadingPeriods(false));
  };

  const forms = [...new Set(periods.map((p) => p.form))];
  const examTypes = [...new Set(periods.filter((p) => p.form === sel.form).map((p) => p.exam_type))];
  const months = [...new Set(periods.filter((p) => p.form === sel.form && p.exam_type === sel.exam_type).map((p) => p.month))];
  const years = [...new Set(periods.filter((p) => p.form === sel.form && p.exam_type === sel.exam_type && p.month === sel.month).map((p) => String(p.year)))];
  const matched = periods.find((p) => p.form === sel.form && p.exam_type === sel.exam_type && p.month === sel.month && String(p.year) === sel.year);

  const viewResult = async () => {
    if (!matched || !student) return;
    setLoadingResult(true); setErr(""); setResult(null);
    try {
      const data = await apiFetch(`/results-mgmt/student-result?sheet_id=${matched.sheet_id}&student_id=${student.id}`, {}, token);
      setResult(data);
    } catch (e) { setErr(e.message); }
    finally { setLoadingResult(false); }
  };

  const pdfAction = async (mode) => {
    if (!matched || !student) return;
    setBusyPdf(true); setErr("");
    try {
      const res = await fetch(`${API_BASE}/results-mgmt/student-result/export-pdf?sheet_id=${matched.sheet_id}&student_id=${student.id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Could not generate the result PDF.");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      if (mode === "print") {
        window.open(url, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = url; a.download = `${student.entry_no || student.id}-${sel.exam_type}-result.pdf`.replace(/\s+/g, "-");
        document.body.appendChild(a); a.click(); a.remove();
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 30000);
    } catch (e) { setErr(e.message); }
    finally { setBusyPdf(false); }
  };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 3000, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: THEME.surface, borderRadius: 0, width: "100%", maxWidth: 720, maxHeight: isMobile ? "92vh" : "88vh", overflowY: "auto", padding: isMobile ? 16 : 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: THEME.heading, display: "flex", alignItems: "center", gap: 8 }}><SearchIcon size={16} />Search Student Results</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: THEME.muted }}><CloseIcon size={18} /></button>
        </div>

        {err && <div style={{ background: THEME.dangerLight, color: THEME.danger, padding: "8px 12px", borderRadius: 0, fontSize: 12.5, marginBottom: 14 }}>{err}</div>}

        {!student ? (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <select value={form} onChange={(e) => { setForm(e.target.value); setSearch(""); setMatches([]); }} style={selectStyle}>
                {FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type student name…" style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
            </div>
            {searching && <p style={{ fontSize: 12.5, color: THEME.muted }}>Searching…</p>}
            {!!matches.length && (
              <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 0, overflow: "hidden" }}>
                {matches.map((s) => {
                  const name = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");
                  return (
                    <button key={s.id} onClick={() => pickStudent(s)} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderBottom: `1px solid ${THEME.border}`, background: THEME.surface, cursor: "pointer", fontSize: 13.5 }}>
                      <div style={{ fontWeight: 700, color: THEME.text }}>{name}</div>
                      <div style={{ fontSize: 11.5, color: THEME.muted }}>{s.form} · Reg No: {s.reg_no || s.entry_no || "-"}</div>
                    </button>
                  );
                })}
              </div>
            )}
            {!searching && search.trim() && !matches.length && <p style={{ fontSize: 12.5, color: THEME.muted }}>No students matched "{search}" in {form}.</p>}
          </>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, padding: "8px 12px", background: THEME.bg, borderRadius: 0 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: THEME.text }}>{[student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ")}</div>
                <div style={{ fontSize: 11.5, color: THEME.muted }}>{student.form} · Reg No: {student.reg_no || student.entry_no || "-"}</div>
              </div>
              <button onClick={() => { setStudent(null); setResult(null); }} style={{ ...btnSecondary, padding: "6px 12px", fontSize: 12 }}>Change Student</button>
            </div>

            {loadingPeriods ? (
              <p style={{ color: THEME.muted, fontSize: 13 }}>Loading available exam periods…</p>
            ) : !periods.length ? (
              <p style={{ color: THEME.muted, fontSize: 13 }}>No published results found for this student yet.</p>
            ) : (
              <>
                <div style={isMobile ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 } : { display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                  <select value={sel.form} onChange={(e) => setSel({ form: e.target.value, exam_type: "", month: "", year: "" })} style={selectStyle}>
                    {forms.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <select value={sel.exam_type} onChange={(e) => setSel((p) => ({ ...p, exam_type: e.target.value, month: "", year: "" }))} style={selectStyle}>
                    {examTypes.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <select value={sel.month} onChange={(e) => setSel((p) => ({ ...p, month: e.target.value, year: "" }))} style={selectStyle}>
                    {months.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <select value={sel.year} onChange={(e) => setSel((p) => ({ ...p, year: e.target.value }))} style={selectStyle}>
                    {years.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <button onClick={viewResult} disabled={!matched || loadingResult} style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", gap: 7, marginBottom: 18 }}>
                  {loadingResult ? <SpinnerIcon size={14} /> : <SearchIcon size={14} />}{loadingResult ? "Loading…" : "View Results"}
                </button>

                {result && (
                  <StudentResultCard result={result} isMobile={isMobile} busy={busyPdf}
                    onPrint={() => pdfAction("print")} onExport={() => pdfAction("export")} />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// One student's compiled report - subjects table plus GPA/Division/Position
// summary - printed via the browser's own PDF viewer (Print) or saved to
// disk (Export PDF). The same PDF bytes are archived to Cloudinary
// server-side (see exportStudentResultPdf) the moment either button is used.
// ══════════════════ TEACHERS EVALUATION (Admin only) ══════════════════
// Fixed accents for the A-C / A-D combined-range columns - must mirror
// backend/src/controllers/resultsController.js RANGE_COLOR exactly, since
// A-C/A-D aren't single letter grades and so have no entry in the app's
// shared COMPETENCY_COLORS (that map only covers A/B/C/D/F).
const RANGE_COLORS = { AC: { background: "#0EA5E9", color: "#FFFFFF" }, AD: { background: "#7C3AED", color: "#FFFFFF" }, PASS: { background: "#0D9488", color: "#FFFFFF" } };

// Darasa → Exam Type → Month/Year → Teacher (majina matatu, bolded) →
// per-subject grade breakdown, reusing the exact subject_performance
// numbers shown everywhere else in Results Management, plus POS (that
// subject's rank against every other subject sat in the same exam).
function TeacherEvaluationModal({ token, onClose }) {
  const { isMobile } = useBreakpoint();
  const [sel, setSel] = useState({ form: FORMS[0], exam_type: EXAM_TYPES[0], month: MONTHS[new Date().getMonth()], year: new Date().getFullYear() });
  const [teachers, setTeachers] = useState([]);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyPdf, setBusyPdf] = useState(false);
  const [err, setErr] = useState("");

  // Reload the teacher picker whenever the class changes - the list is
  // scoped to whoever is actually assigned to that Darasa.
  useEffect(() => {
    setTeacherId(""); setData(null); setErr("");
    setLoadingTeachers(true);
    apiFetch(`/results-mgmt/teacher-evaluation/teachers?form=${encodeURIComponent(sel.form)}`, {}, token)
      .then(setTeachers)
      .catch((e) => setErr(e.message))
      .finally(() => setLoadingTeachers(false));
  }, [sel.form, token]);

  const query = `form=${encodeURIComponent(sel.form)}&exam_type=${encodeURIComponent(sel.exam_type)}&month=${encodeURIComponent(sel.month)}&year=${sel.year}&teacher_id=${teacherId}`;

  const view = async () => {
    if (!teacherId) return;
    setLoading(true); setErr(""); setData(null);
    try {
      const d = await apiFetch(`/results-mgmt/teacher-evaluation?${query}`, {}, token);
      setData(d);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  // Print opens the evaluation PDF inline via a blob URL (browser's own
  // viewer/print dialog); Export PDF (the former "Download PDF") saves the
  // same file to disk - both share one fetch/error path.
  const pdfAction = async (mode) => {
    if (!teacherId) return;
    setBusyPdf(true); setErr("");
    try {
      const res = await fetch(`${API_BASE}/results-mgmt/teacher-evaluation/export-pdf?${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Could not generate the evaluation PDF.");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      if (mode === "print") {
        window.open(url, "_blank");
      } else {
        const teacherName = (data?.teacher?.full_name || "teacher").replace(/\s+/g, "-");
        const a = document.createElement("a");
        a.href = url; a.download = `Teacher-Assessment-${teacherName}-${sel.form}-${sel.exam_type}.pdf`.replace(/\s+/g, "-");
        document.body.appendChild(a); a.click(); a.remove();
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 30000);
    } catch (e) { setErr(e.message); }
    finally { setBusyPdf(false); }
  };

  // GPA/POS are the only remaining "plain" columns now that PASS has its
  // own Total/% group like every other grade band - they get a neutral
  // gray so the color legend stays limited to A/B/C/D/F/A-C/A-D/PASS.
  const GRAY = { background: "#64748B", color: "#FFFFFF" };
  const groups = [
    { key: "A", label: "A", colors: COMPETENCY_COLORS.A, fKey: "grade_a_f", mKey: "grade_a_m", totalKey: "grade_a", pctKey: "pct_a" },
    { key: "B", label: "B", colors: COMPETENCY_COLORS.B, fKey: "grade_b_f", mKey: "grade_b_m", totalKey: "grade_b", pctKey: "pct_b" },
    { key: "C", label: "C", colors: COMPETENCY_COLORS.C, fKey: "grade_c_f", mKey: "grade_c_m", totalKey: "grade_c", pctKey: "pct_c" },
    { key: "D", label: "D", colors: COMPETENCY_COLORS.D, fKey: "grade_d_f", mKey: "grade_d_m", totalKey: "grade_d", pctKey: "pct_d" },
    { key: "F", label: "F", colors: COMPETENCY_COLORS.F, fKey: "grade_f_f", mKey: "grade_f_m", totalKey: "grade_f", pctKey: "pct_f" },
    { key: "AC", label: "A-C", colors: RANGE_COLORS.AC, fKey: "a_to_c_f", mKey: "a_to_c_m", totalKey: "a_to_c_count", pctKey: "a_to_c_pct" },
    { key: "AD", label: "A-D", colors: RANGE_COLORS.AD, fKey: "a_to_d_f", mKey: "a_to_d_m", totalKey: "a_to_d_count", pctKey: "a_to_d_pct" },
    { key: "PASS", label: "PASS", colors: RANGE_COLORS.PASS, fKey: "pass_f", mKey: "pass_m", totalKey: "pass_count", pctKey: "pass_pct" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 3000, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: THEME.surface, borderRadius: 0, width: "100%", maxWidth: 900, maxHeight: isMobile ? "92vh" : "88vh", overflowY: "auto", padding: isMobile ? 16 : 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: THEME.heading, display: "flex", alignItems: "center", gap: 8 }}><CheckCircleIcon size={16} />TEACHERS ASSESMENT</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: THEME.muted }}><CloseIcon size={18} /></button>
        </div>

        {err && <div style={{ background: THEME.dangerLight, color: THEME.danger, padding: "8px 12px", borderRadius: 0, fontSize: 12.5, marginBottom: 14 }}>{err}</div>}

        <div style={isMobile ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 } : { display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <Field label="Darasa (Form)">
            <select value={sel.form} onChange={(e) => setSel((p) => ({ ...p, form: e.target.value }))} style={selectStyle}>
              {FORMS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Exam Type">
            <select value={sel.exam_type} onChange={(e) => setSel((p) => ({ ...p, exam_type: e.target.value }))} style={selectStyle}>
              {EXAM_TYPES.map((f) => <option key={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Month">
            <select value={sel.month} onChange={(e) => setSel((p) => ({ ...p, month: e.target.value }))} style={selectStyle}>
              {MONTHS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Year">
            <input type="number" value={sel.year} onChange={(e) => setSel((p) => ({ ...p, year: Number(e.target.value) }))} style={{ ...selectStyle, width: 90 }} />
          </Field>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Field label="Jina la Mwalimu (Teacher)">
            <select value={teacherId} onChange={(e) => { setTeacherId(e.target.value); setData(null); }} style={{ ...selectStyle, width: "100%", maxWidth: 420, fontWeight: 700 }} disabled={loadingTeachers}>
              <option value="">{loadingTeachers ? "Loading teachers…" : "Select a teacher…"}</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </Field>
          {!loadingTeachers && !teachers.length && <p style={{ fontSize: 12, color: THEME.muted, marginTop: 6 }}>No teacher is assigned to {sel.form} with a subject yet.</p>}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          <button onClick={view} disabled={!teacherId || loading} style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", gap: 7 }}>
            {loading ? <SpinnerIcon size={14} /> : <SearchIcon size={14} />}{loading ? "Loading…" : "View Evaluation"}
          </button>
          <button onClick={() => pdfAction("print")} disabled={!teacherId || busyPdf} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 7 }}>
            {busyPdf ? <SpinnerIcon size={13} /> : <PrinterIcon size={13} />}{busyPdf ? "Please wait…" : "Print"}
          </button>
          <button onClick={() => pdfAction("export")} disabled={!teacherId || busyPdf} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 7 }}>
            {busyPdf ? <SpinnerIcon size={13} /> : <DownloadIcon size={13} />}{busyPdf ? "Please wait…" : "Export PDF"}
          </button>
        </div>

        {data && (
          <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 0, padding: isMobile ? 14 : 18, background: THEME.bg }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: THEME.muted }}>
                TATHMINI YA MATOKEO YA MTIHANI WA <strong style={{ color: THEME.text }}>{data.period.exam_type.toUpperCase()}</strong> {data.period.month.toUpperCase()}, {data.period.year} - {data.period.form.toUpperCase()}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: THEME.text, marginTop: 4 }}>JINA LA MWALIMU: {data.teacher.full_name.toUpperCase()}</div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 10.5, minWidth: 900 }}>
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ ...thSmall, textAlign: "left", verticalAlign: "middle", background: GRAY.background, color: GRAY.color }}>SUBJECT</th>
                    {groups.map((g) => (
                      <th key={g.key} colSpan={4} style={{ ...thSmall, background: g.colors.background, color: g.colors.color }}>{g.label}</th>
                    ))}
                    <th rowSpan={2} style={{ ...thSmall, verticalAlign: "middle", background: GRAY.background, color: GRAY.color }}>GPA</th>
                    <th rowSpan={2} style={{ ...thSmall, verticalAlign: "middle", background: GRAY.background, color: GRAY.color }}>POS</th>
                  </tr>
                  <tr>
                    {groups.map((g) => (
                      <Fragment key={g.key}>
                        <th style={{ ...thSmall, background: g.colors.background, color: g.colors.color, fontSize: 9 }}>F</th>
                        <th style={{ ...thSmall, background: g.colors.background, color: g.colors.color, fontSize: 9 }}>M</th>
                        <th style={{ ...thSmall, background: g.colors.background, color: g.colors.color, fontSize: 9 }}>T</th>
                        <th style={{ ...thSmall, background: g.colors.background, color: g.colors.color, fontSize: 9 }}>%</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.subjects.map((sp) => (
                    <tr key={sp.subject_id}>
                      <td style={{ ...tdSmall, textAlign: "left", fontWeight: 700 }}>{sp.subject_name}</td>
                      {groups.map((g) => (
                        <Fragment key={g.key}>
                          <td style={{ ...tdSmall, background: g.colors.background, color: g.colors.color, fontWeight: 700 }}>{sp[g.fKey] ?? "-"}</td>
                          <td style={{ ...tdSmall, background: g.colors.background, color: g.colors.color, fontWeight: 700 }}>{sp[g.mKey] ?? "-"}</td>
                          <td style={{ ...tdSmall, background: g.colors.background, color: g.colors.color, fontWeight: 700 }}>{sp[g.totalKey] ?? "-"}</td>
                          <td style={{ ...tdSmall, background: g.colors.background, color: g.colors.color, fontWeight: 700 }}>{sp[g.pctKey] == null ? "-" : Number(sp[g.pctKey]).toFixed(1)}</td>
                        </Fragment>
                      ))}
                      <td style={tdSmall}>{sp.gpa ?? "-"}</td>
                      <td style={{ ...tdSmall, fontWeight: 800 }}>{sp.pos ?? "-"}</td>
                    </tr>
                  ))}
                  {!data.subjects.length && <tr><td style={tdSmall} colSpan={1 + groups.length * 4 + 2}>No subject results found for this teacher in this exam period.</td></tr>}
                </tbody>
              </table>
            </div>
            {data.comparison && data.comparison.lines.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${THEME.border}` }}>
                <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: THEME.heading }}>ULINGANISHO WA UFAULU NA MTIHANI ULIOPITA</p>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {data.comparison.lines.map((line, i) => (
                    <li key={i} style={{ fontSize: 12, color: THEME.text, marginBottom: 4, lineHeight: 1.5 }}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StudentResultCard({ result, isMobile, onPrint, onExport, busy }) {
  const { sheet, student } = result;
  return (
    <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 0, padding: isMobile ? 14 : 18, background: THEME.bg }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: THEME.text }}>{student.full_name}</div>
          <div style={{ fontSize: 12, color: THEME.muted }}>{sheet.form} · {sheet.exam_type} · {sheet.month} {sheet.year} · Reg No: {student.reg_no || student.entry_no || "-"}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button disabled={busy} onClick={onPrint} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px" }}>{busy ? <SpinnerIcon size={13} /> : <PrinterIcon size={13} />}{busy ? "Please wait…" : "Print"}</button>
          <button disabled={busy} onClick={onExport} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px" }}>{busy ? <SpinnerIcon size={13} /> : <DownloadIcon size={13} />}{busy ? "Please wait…" : "Export PDF"}</button>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead>
            <tr style={{ background: THEME.surface }}>
              <th style={{ ...th, fontSize: 11.5 }}>Subject</th><th style={{ ...th, fontSize: 11.5 }}>Marks</th><th style={{ ...th, fontSize: 11.5 }}>Grade</th>
            </tr>
          </thead>
          <tbody>
            {student.scores.map((s, i) => (
              <tr key={s.subject_code} style={{ background: i % 2 ? THEME.surface : THEME.bg }}>
                <td style={{ ...td, whiteSpace: "normal" }}>{s.subject_name}</td><td style={td}>{s.marks ?? "-"}</td><td style={td}>{s.grade || "-"}</td>
              </tr>
            ))}
            {!student.scores.length && <tr><td style={td} colSpan={3}>No subject scores found for this period.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 16 }}>
        {[
          ["Division", student.division],
          ["Points", student.points],
          ["Position", student.position != null && student.total_students != null ? `${student.position} out of ${student.total_students}` : (student.position ?? "-")],
          ["Average Grade", student.avg_grade],
          ["GPA", student.gpa],
          ["Subjects Sat", student.subjects_sat],
        ].map(([label, value]) => (
          <div key={label} style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, padding: "8px 12px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: THEME.text }}>{value ?? "-"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const th = { padding: "8px 12px", textAlign: "left", fontWeight: 600 };
const td = { padding: "7px 12px", borderTop: `1px solid ${THEME.border}`, whiteSpace: "nowrap" };
const thSmall = { padding: "4px 8px", textAlign: "center", fontWeight: 700, fontSize: 10.5, border: `1px solid ${THEME.border}`, color: THEME.muted };
const tdSmall = { padding: "3px 8px", textAlign: "center", border: `1px solid ${THEME.border}` };

// ── NECTA-style report look (printed exam-board format) - full grid lines
// on every cell and a classic serif font, used ONLY by the compiled Results
// report tables inside CompiledResults (Division Performance Summary, the
// main CNO/NAME/DETAILS SUBJECTS table, Subject Performance, and the
// Top/Bottom 10 tables). Deliberately separate from th/td/thSmall/tdSmall
// above, which stay unchanged everywhere else (Teachers Evaluation, the
// per-student results modal, etc.).
const NECTA_FONT = "Arial, Helvetica, sans-serif";
const NECTA_TEXT = "#0A1F5C";
const NECTA_BG = "#FFFEEA";
const NECTA_HEAD_BG = "#FCF3C0";
const NECTA_BORDER = "#7C93B8";
// The light-blue box NECTA's own printed report wraps the DIVISION
// PERFORMANCE SUMMARY heading/table in - matches necta.go.tz exactly.
const NECTA_SUMMARY_BG = "rgb(173, 216, 230)";
const nectaTh = { padding: "5px 8px", textAlign: "center", fontWeight: 700, fontSize: 11, border: `1px solid ${NECTA_BORDER}`, color: NECTA_TEXT, background: NECTA_HEAD_BG, fontFamily: NECTA_FONT };
const nectaTd = { padding: "4px 8px", textAlign: "center", border: `1px solid ${NECTA_BORDER}`, color: NECTA_TEXT, background: NECTA_BG, fontFamily: NECTA_FONT };
// Groove (embossed/3D) border variant - requested for ONLY two tables:
// DIVISION PERFORMANCE SUMMARY and the main Reg.No/CAND NAME/SEX/AGGT/DIV/
// POS/DETAILS SUBJECTS table inside CompiledResults. Deliberately kept
// separate from nectaTh/nectaTd (still flat 1px) so every other NECTA-style
// table - SCHOOL EXAMINATION SUBJECT PERFORMANCE, TOP/BOTTOM 10 PERFORMERS -
// is completely unaffected.
const nectaThGroove = { ...nectaTh, border: `2px groove ${NECTA_BORDER}` };
const nectaTdGroove = { ...nectaTd, border: `2px groove ${NECTA_BORDER}` };

// ══════════════════ TOP 10 / BOTTOM 10 PERFORMERS ══════════════════
// Ranked off the same `position` (RANK() by Best-7 GPA, computed server-side
// in the student_results view) already shown in the main table - students
// without a computed position (INC - fewer than 7 subjects sat) are left
// out of both lists, since they can't be fairly ranked against the rest.
function TopBottomPerformers({ students, isMobile }) {
  const ranked = (students || [])
    .filter((s) => s.position != null && s.division !== "INC")
    .slice()
    .sort((a, b) => a.position - b.position);
  if (!ranked.length) return null;

  const top10 = ranked.slice(0, 10);
  // Worst-first (highest position number first) - numbered 1→10 top-to-
  // bottom, so rank 1 is the single worst performer here, counting up to
  // rank 10 at the boundary with the rest of the class.
  const bottom10 = ranked.slice().sort((a, b) => b.position - a.position).slice(0, 10);

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 20 }}>
      <PerformersTable
        title="TOP 10 PERFORMING STUDENTS" icon={TrophyIcon} accent={THEME.success}
        rows={top10.map((s, i) => ({ ...s, rank: i + 1 }))}
      />
      <PerformersTable
        title="BOTTOM 10 PERFORMING STUDENTS" icon={TrendingDownIcon} accent={THEME.danger}
        rows={bottom10.map((s, i) => ({ ...s, rank: i + 1 }))}
      />
    </div>
  );
}
// Ranking criterion is still GPA (full precision, via `position` computed
// server-side) - GPA itself is just never displayed in this table; DIV and
// POINTS are shown instead (e.g. "DIV III, 22").
function PerformersTable({ title, icon: TitleIcon, accent, rows }) {
  return (
    <div>
      <p style={{ fontSize: 11.5, fontWeight: 700, color: THEME.heading, marginBottom: 6, letterSpacing: 0.3, display: "flex", alignItems: "center", gap: 6 }}>
        <TitleIcon size={13} />{title}
      </p>
      <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 11.5, width: "100%", minWidth: 280 }}>
        <thead>
          <tr>
            <th style={nectaTh}>RANK</th><th style={{ ...nectaTh, textAlign: "left" }}>NAME</th><th style={nectaTh}>DIV</th><th style={nectaTh}>POINTS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.student_id}>
              <td style={{ ...nectaTd, fontWeight: 800, color: accent }}>{s.rank}</td>
              <td style={{ ...nectaTd, textAlign: "left" }}>{s.full_name}</td>
              <td style={nectaTd}>{s.division ?? "-"}</td>
              <td style={nectaTd}>{s.points ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// ══════════════════ PUBLISHED RESULTS ══════════════════
function PublishedResults({ period }) {
  const { token } = useAuth();
  const [sheetId, setSheetId] = useState(null); // resolved from the period selected in "Select Period" above
  const [onlinePublished, setOnlinePublished] = useState(false);
  const [onlineBusy, setOnlineBusy] = useState(false);

  // Resolves the underlying sheet_id for whatever period is selected in
  // "Select Period" above (same lookup CompiledResults uses), so the toggle
  // below always targets exactly what's on screen.
  useEffect(() => {
    if (!period) { setSheetId(null); return; }
    apiFetch(`/results-mgmt/sheet?period_id=${period.id}&form=${encodeURIComponent(period.form)}`, {}, token)
      .then((sh) => { setSheetId(sh ? sh.id : null); setOnlinePublished(sh ? !!sh.published_online : false); })
      .catch(() => { setSheetId(null); setOnlinePublished(false); });
  }, [period, token]);

  // This is the ONLY way results ever reach the public Publications page -
  // each parent/student logs in with THEIR OWN Admission No + phone and
  // sees only THEIR OWN compiled result (see ResultsPortal in
  // components/Publications.jsx and publicResultsMe() in
  // resultsController.js) - never the whole class combined into one
  // document. Turning this on makes the class's students ELIGIBLE to log
  // in and view their own result; it does not expose anyone else's.
  const toggleOnlinePublish = async () => {
    if (!sheetId) return;
    setOnlineBusy(true);
    try {
      const next = !onlinePublished;
      await apiFetch(`/results-mgmt/online-publish/${sheetId}`, { method: "PATCH", body: JSON.stringify({ published: next }) }, token);
      setOnlinePublished(next);
      showSuccess("Results Portal", next ? "Results Successfully Published to the parent/student portal." : "Results removed from the parent/student portal.");
    } catch (err) { showSuccess("Results Portal", err.message); } finally { setOnlineBusy(false); }
  };

  return (
    <div>
      <p style={{ fontSize: 11.5, color: THEME.muted, maxWidth: 520, marginBottom: 14 }}>
        {period
          ? <>Controls online access for <b>{period.form}, {period.exam_type} - {period.month} {period.year}</b> (the period selected above). Each parent/student sees only their own child's result after logging in - never the whole class together.</>
          : "Select a period above first."}
      </p>

      {sheetId ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, background: THEME.surface, border: `1px solid ${THEME.border}`,
          borderRadius: 0, padding: "12px 16px", maxWidth: 520,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5, color: THEME.heading }}>Results Portal (Parents/Students)</div>
            <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 2 }}>Lets parents/students view THEIR OWN result online after logging in with Admission No + phone. View only, no download, one student at a time.</div>
          </div>
          <StatusPill ok={onlinePublished}>{onlinePublished ? "Live" : "Hidden"}</StatusPill>
          <button onClick={toggleOnlinePublish} disabled={onlineBusy} style={onlinePublished ? btnSecondary : btnPrimary}>
            {onlineBusy ? "..." : onlinePublished ? "Unpublish" : "Publish"}
          </button>
        </div>
      ) : period && (
        <p style={{ fontSize: 12.5, color: THEME.muted }}>No results found for the selected period yet - enter and save results first.</p>
      )}
    </div>
  );
}

function Warn({ children }) {
  return <div style={{ background: THEME.warningLight, color: THEME.warning, padding: 12, borderRadius: 0, fontSize: 13, marginBottom: 14 }}>{children}</div>;
}

const selectStyle = { padding: "8px 10px", border: `1px solid ${THEME.border}`, borderRadius: 0, fontSize: 13 };
const labelStyle = { display: "block", fontSize: 11.5, fontWeight: 700, color: THEME.muted, marginBottom: 5 };
const inputStyle = { padding: "9px 12px", border: `1px solid ${THEME.border}`, borderRadius: 0, fontSize: 13 };
const btnPrimary = { padding: "9px 18px", background: THEME.navy, color: "#fff", border: "none", borderRadius: 0, fontWeight: 600, fontSize: 12.5, cursor: "pointer" };
const btnSecondary = { padding: "9px 18px", background: THEME.surface, color: THEME.heading, border: `1.5px solid ${THEME.heading}`, borderRadius: 0, fontWeight: 600, fontSize: 12.5, cursor: "pointer" };
const btnTiny = { padding: "4px 10px", background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, fontSize: 11, cursor: "pointer" };
const tabActive = { padding: "8px 16px", borderRadius: 0, border: "none", background: THEME.navy, color: "#fff", fontWeight: 600, fontSize: 12.5, cursor: "pointer" };
const tabInactive = { ...tabActive, background: THEME.surface, color: THEME.text, border: `1px solid ${THEME.border}` };
