import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { apiFetch, API_BASE } from "../utils/api";
import { THEME } from "../styles/theme";
import { showSuccess } from "../components/SuccessModal";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { BedIcon, SunIcon, CalendarIcon, ClockIcon, PlusCircleIcon, CheckIcon, CloseIcon, ChevronLeftIcon, ChevronRightIcon, SpinnerIcon } from "../components/icons";

const FORMS = ["Form I", "Form II", "Form III", "Form IV"];

// Colored stat card - matches the tinted look Student Management/Timetable
// (and now Contributions Management) already use, instead of the single
// flat neutral card every stat used to share here, which made it hard to
// tell "students who contributed" apart from totals at a glance.
function StatCard({ label, value, sub, color = THEME.navy }) {
  return (
    <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, padding: "12px 18px", minWidth: 160 }}>
      <div style={{ fontSize: 11.5, color: THEME.muted }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: THEME.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Two ways to view this page (class_teacher must never reach it at all -
// gated out at the route/menu level):
//  - Recorder (food_teacher): Boarding, Day, Daily Collections. Recording
//    contributions is their job, but History is oversight-only - even the
//    Food Teacher doesn't see it here.
//  - Oversight (admin/second_master): read-only, every class - Daily
//    Collections, History.
export default function FoodContributions() {
  const { user } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const myRoles = user?.roles && user.roles.length ? user.roles : [user?.role];
  const isRecorder = myRoles.includes("food_teacher");
  const isOverseer = !isRecorder && myRoles.some((r) => ["admin", "second_master"].includes(r));
  const [tab, setTab] = useState(isRecorder ? "boarding" : "daily");

  const tabs = isRecorder
    ? [["boarding", "Boarding Students"], ["day", "Day Students"], ["daily", "Daily Collections"]]
    : [["daily", "Daily Collections"], ["history", "History"]];
  const tabIcons = { boarding: BedIcon, day: SunIcon, daily: CalendarIcon, history: ClockIcon };

  return (
    <div style={{ padding: isMobile ? "16px 12px" : isTablet ? "24px 20px" : 32 }}>
      <h2 style={{ color: THEME.heading, fontSize: isMobile ? 16 : isTablet ? 18 : 20, marginBottom: 4 }}>Manage Foods</h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 18 }}>
        {isRecorder
          ? "Track food contributions separately for boarding and day students - a student can bring more than one type, and can bring the same type in several installments."
          : "Read-only view - recording contributions is handled by the Food Teacher."}
      </p>
      <div className={isCompact ? "table-scroll" : undefined} style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: isCompact ? "nowrap" : "wrap", paddingBottom: isCompact ? 4 : 0 }}>
        {tabs.map(([key, label]) => {
          const TIcon = tabIcons[key];
          return (
            <button key={key} onClick={() => setTab(key)} style={{ ...(tab === key ? tabActive : tabInactive), ...(isCompact ? tabCompact : {}), display: "inline-flex", alignItems: "center", gap: 6 }}><TIcon size={13} />{label}</button>
          );
        })}
      </div>
      {isRecorder && tab === "boarding" && <FoodList category="boarding" />}
      {isRecorder && tab === "day" && <FoodList category="day" />}
      {tab === "daily" && <FoodDailyCollections showClassFilter={isOverseer} />}
      {isOverseer && tab === "history" && <FoodHistory showClassFilter={true} />}
    </div>
  );
}

// Shared by the Food Teacher (sees every class) and the read-only viewers
// (Head Master/Second Master, who may narrow with ?form=, and Class
// Teachers, who are auto-scoped to their own class server-side) - a date
// picker defaulting to today, showing exactly which food items were
// brought that day and by whom.
//
// The backend returns one row per ITEM entry (a student who brought both
// Mahindi and Njugu today has 2 rows; brought Mahindi in two separate
// installments today has 2 Mahindi rows) - grouped here into one row per
// STUDENT instead, same as every other list in this module already does
// (see FoodList and the History tab below). With 10 students each bringing
// several items, this is the difference between 10 rows and 40+ - "View
// details" opens the full item-by-item breakdown for just that student.
function FoodDailyCollections({ showClassFilter }) {
  const { token } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" });
  const [date, setDate] = useState(todayISO());
  const [form, setForm] = useState("");
  const [category, setCategory] = useState("");
  const [rows, setRows] = useState([]);
  const [studentsContributed, setStudentsContributed] = useState(0);
  const [types, setTypes] = useState([]);
  const [error, setError] = useState("");
  const [noClass, setNoClass] = useState(false);
  const [viewStudent, setViewStudent] = useState(null); // grouped student row currently drilled into, or null

  const load = useCallback(() => {
    setError(""); setNoClass(false);
    const params = new URLSearchParams({ date });
    if (form) params.set("form", form);
    if (category) params.set("category", category);
    apiFetch(`/food/daily?${params.toString()}`, {}, token)
      .then((d) => {
        setRows(d.data || []);
        setStudentsContributed(Number(d.students_contributed || 0));
        setTypes(d.types || []);
        if (d.message && !d.data?.length) setNoClass(true);
      })
      .catch((err) => setError(err.message));
  }, [token, date, form, category]);
  useEffect(load, [load]);

  const unitFor = (key) => (types.find((t) => t.key === key)?.unit === "LITRES" ? "L" : "kg");
  const labelFor = (key) => types.find((t) => t.key === key)?.label || key;

  // One group per student, in first-seen order (the backend already orders
  // by created_at ASC, so this reads top-to-bottom as "who contributed
  // first today"). Each group keeps every individual item entry so "View
  // details" can show them all, plus a de-duplicated list of collectors in
  // case more than one person recorded entries for the same student today.
  const grouped = [];
  const byStudent = new Map();
  rows.forEach((r) => {
    let g = byStudent.get(r.student_id);
    if (!g) {
      g = { student_id: r.student_id, first_name: r.first_name, middle_name: r.middle_name, last_name: r.last_name, form: r.form, category: r.category, entries: [] };
      byStudent.set(r.student_id, g);
      grouped.push(g);
    }
    g.entries.push(r);
  });

  return (
    <div>
      <h2 style={{ color: THEME.heading, fontSize: isMobile ? 16 : 20, marginBottom: 4 }}>Daily Collections</h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 18 }}>Pick a day to see exactly which food items were brought that day, and by whom.</p>

      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <StatCard label={`Students Contributed (${date})`} value={studentsContributed} color={THEME.success} />
        <StatCard label={`Items Recorded (${date})`} value={rows.length} color={THEME.navy} />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...selectStyle, ...(isCompact ? { flex: 1, minWidth: 150 } : {}) }} />
        {showClassFilter && (
          <select value={form} onChange={(e) => setForm(e.target.value)} style={{ ...selectStyle, ...(isCompact ? { flex: 1, minWidth: 130 } : {}) }}>
            <option value="">All Classes</option>
            {FORMS.map((f) => <option key={f}>{f}</option>)}
          </select>
        )}
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...selectStyle, ...(isCompact ? { flex: 1, minWidth: 130 } : {}) }}>
          <option value="">Boarding + Day</option>
          <option value="boarding">Boarding Only</option>
          <option value="day">Day Only</option>
        </select>
      </div>

      {error && <ErrorBox msg={error} />}
      {noClass && <ErrorBox msg="You have no class assigned yet - ask the Head Master to assign your class in User Accounts." />}

      {isCompact ? (
        <div style={cardList}>
          {grouped.map((g) => (
            <div key={g.student_id} className="mk-row-card" style={rowCard}>
              <div style={cardHeadRow}>
                <span style={cardTitle}>{[g.first_name, g.middle_name, g.last_name].filter(Boolean).join(" ")}</span>
                <span style={{ fontSize: 12, color: THEME.muted, fontWeight: 600 }}>{g.form}</span>
              </div>
              <div style={cardField}><span style={cardFieldLabel}>Category</span><span style={cardFieldValue}>{g.category === "boarding" ? "Boarding" : "Day"}</span></div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
                {g.entries.map((e) => <span key={e.id} style={badge}>{labelFor(e.contribution_type)} {Number(e.quantity)}{unitFor(e.contribution_type)}</span>)}
              </div>
              <button onClick={() => setViewStudent(g)} style={{ ...btnRecord, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><ClockIcon size={13} />View details</button>
            </div>
          ))}
          {!grouped.length && !noClass && <p style={{ fontSize: 13, color: THEME.muted }}>No food contributions were recorded on {date}.</p>}
        </div>
      ) : (
      <div className="table-scroll" style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", padding: "9px 16px", fontSize: 11.5, fontWeight: 700, color: THEME.muted, background: THEME.bg, minWidth: 620 }}>
          <span style={{ flex: 1.4 }}>Name</span>
          <span style={{ flex: 0.6 }}>Class</span>
          <span style={{ flex: 0.7 }}>Category</span>
          <span style={{ flex: 2 }}>Items Brought</span>
          <span style={{ width: 120 }} />
        </div>
        {grouped.map((g, i) => (
          <div key={g.student_id} style={{ display: "flex", alignItems: "center", padding: "9px 16px", fontSize: 13, borderTop: i > 0 ? `1px solid ${THEME.border}` : "none", flexWrap: "wrap", gap: 6, minWidth: 620 }}>
            <span style={{ flex: 1.4 }}>{[g.first_name, g.middle_name, g.last_name].filter(Boolean).join(" ")}</span>
            <span style={{ flex: 0.6 }}>{g.form}</span>
            <span style={{ flex: 0.7 }}>{g.category === "boarding" ? "Boarding" : "Day"}</span>
            <span style={{ flex: 2, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {g.entries.map((e) => <span key={e.id} style={badge}>{labelFor(e.contribution_type)} {Number(e.quantity)}{unitFor(e.contribution_type)}</span>)}
            </span>
            <span style={{ width: 120 }}><button onClick={() => setViewStudent(g)} style={{ ...btnRecord, display: "inline-flex", alignItems: "center", gap: 6 }}><ClockIcon size={13} />View details</button></span>
          </div>
        ))}
        {!grouped.length && !noClass && <p style={{ padding: 16, fontSize: 13, color: THEME.muted }}>No food contributions were recorded on {date}.</p>}
      </div>
      )}
      {viewStudent && (
        <Modal title={`${date} - ${[viewStudent.first_name, viewStudent.middle_name, viewStudent.last_name].filter(Boolean).join(" ")}`} onClose={() => setViewStudent(null)}>
          <div style={{ display: "grid", gap: 8 }}>
            {viewStudent.entries.map((e) => (
              <div key={e.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 10px", background: THEME.bg, borderRadius: 0, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600 }}>{labelFor(e.contribution_type)}</span>
                  <span>{Number(e.quantity)} {unitFor(e.contribution_type)}</span>
                </div>
                <div style={{ fontSize: 11.5, color: THEME.muted }}>{e.recorded_by_name ? `Collected by ${e.recorded_by_name}` : ""}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function FoodList({ category }) {
  const { token } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState([]);
  const [types, setTypes] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [recordFor, setRecordFor] = useState(null); // student row currently recording a contribution for
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(() => {
    setError("");
    apiFetch(`/food/students?category=${category}&year=${year}`, {}, token)
      .then((d) => { setRows(d.data || []); setTypes(d.types || []); })
      .catch((err) => setError(err.message));
  }, [token, category, year]);
  useEffect(load, [load]);

  const filtered = rows.filter((s) => !search.trim() || `${s.first_name} ${s.middle_name || ""} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()));

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${API_BASE}/food/students/pdf?category=${category}&year=${year}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Could not generate PDF.");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `food-contributions-${category}-${year}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); }
    finally { setDownloading(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <StatCard label="Students" value={rows.length} color={THEME.navy} />
        <StatCard label={`Have Contributed (${year})`} value={`${rows.filter((s) => Number(s.entry_count) > 0).length} / ${rows.length}`} color={THEME.success} />
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...selectStyle, ...(isCompact ? { flex: 1, minWidth: 90 } : {}) }}>
          {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <input placeholder="Search student name..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...selectStyle, flex: 1, minWidth: isCompact ? "100%" : 200 }} />
        <button onClick={downloadPdf} disabled={downloading} style={{ ...btnRecord, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          {downloading ? <SpinnerIcon size={13} /> : null}{downloading ? "Generating..." : "Download PDF"}
        </button>
      </div>
      {error && <ErrorBox msg={error} />}
      {isCompact ? (
        <div style={cardList}>
          {filtered.map((s) => (
            <div key={s.student_id} className="mk-row-card" style={rowCard}>
              <div style={cardHeadRow}>
                <span style={cardTitle}>{[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ")}</span>
                <span style={{ fontSize: 12, color: THEME.muted, fontWeight: 600 }}>{s.form}</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {types.filter((t) => Number(s.totals?.[t.key]) > 0).map((t) => (
                  <span key={t.key} style={badge}>{t.label} {s.totals[t.key]}{t.unit === "LITRES" ? "L" : "kg"}</span>
                ))}
                {!types.some((t) => Number(s.totals?.[t.key]) > 0) && <span style={{ color: THEME.muted, fontSize: 12 }}>Not contributed yet</span>}
              </div>
              <button onClick={() => setRecordFor(s)} style={{ ...btnRecord, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><PlusCircleIcon size={13} />Record Contribution</button>
            </div>
          ))}
          {!filtered.length && <p style={{ fontSize: 13, color: THEME.muted }}>{search ? "No matching student found." : "No students found."}</p>}
        </div>
      ) : (
      <div className="table-scroll" style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", padding: "9px 16px", fontSize: 11.5, fontWeight: 700, color: THEME.muted, background: THEME.bg, minWidth: 620 }}>
          <span style={{ flex: 1.3 }}>Name</span><span style={{ flex: 0.6 }}>Class</span><span style={{ flex: 2.5 }}>Contributed so far ({year})</span><span style={{ width: 130 }} />
        </div>
        {filtered.map((s, i) => (
          <div key={s.student_id} style={{ display: "flex", alignItems: "center", padding: "9px 16px", fontSize: 13, borderTop: i > 0 ? `1px solid ${THEME.border}` : "none", flexWrap: "wrap", gap: 6, minWidth: 620 }}>
            <span style={{ flex: 1.3 }}>{[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ")}</span>
            <span style={{ flex: 0.6 }}>{s.form}</span>
            <span style={{ flex: 2.5, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {types.filter((t) => Number(s.totals?.[t.key]) > 0).map((t) => (
                <span key={t.key} style={badge}>{t.label} {s.totals[t.key]}{t.unit === "LITRES" ? "L" : "kg"}</span>
              ))}
              {!types.some((t) => Number(s.totals?.[t.key]) > 0) && <span style={{ color: THEME.muted, fontSize: 12 }}>Not contributed yet</span>}
            </span>
            <span style={{ width: 130 }}>
              <button onClick={() => setRecordFor(s)} style={{ ...btnRecord, display: "inline-flex", alignItems: "center", gap: 6 }}><PlusCircleIcon size={13} />Record Contribution</button>
            </span>
          </div>
        ))}
        {!filtered.length && <p style={{ padding: 16, fontSize: 13, color: THEME.muted }}>{search ? "No matching student found." : "No students found."}</p>}
      </div>
      )}
      {recordFor && (
        <RecordModal
          student={recordFor}
          category={category}
          year={year}
          types={types}
          onClose={() => setRecordFor(null)}
          onRecorded={load}
        />
      )}
    </div>
  );
}

// Record-contribution flow: pick a type → enter quantity → Submit → "Una
// uhakika?" (Are you sure?) confirm → "Submitted Successfully" → the modal
// stays open with the type reset, so the food teacher can immediately pick
// ANOTHER type for the same student if they brought more than one item,
// without reopening anything.
function RecordModal({ student, category, year, types, onClose, onRecorded }) {
  const { token } = useAuth();
  const [type, setType] = useState(types[0]?.key || "");
  const [quantity, setQuantity] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const typeInfo = types.find((t) => t.key === type);
  const studentName = [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ");

  const askConfirm = (e) => {
    e.preventDefault();
    setError("");
    if (!type) { setError("Please choose a type."); return; }
    if (!(Number(quantity) > 0)) { setError("Please enter a valid quantity greater than zero."); return; }
    setConfirmStep(true);
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch(`/food/${student.student_id}`, {
        method: "POST",
        body: JSON.stringify({ category, contribution_type: type, quantity, year }),
      }, token);
      showSuccess("Contribution", data.message || "Contribution Successfully Recorded.");
      setConfirmStep(false);
      setQuantity("");
      onRecorded();
    } catch (err) {
      setError(err.message);
      setConfirmStep(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Record Contribution - ${studentName}`} onClose={onClose}>
      {confirmStep ? (
        <div>
          <p style={{ fontSize: 14, marginBottom: 20 }}>
            Are you sure {studentName} is bringing <b>{quantity} {typeInfo?.unit}</b> of <b>{typeInfo?.label}</b>?
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setConfirmStep(false)} style={{ ...btnCancelRed, display: "inline-flex", alignItems: "center", gap: 6 }} disabled={busy}><CloseIcon size={13} />No</button>
            <button onClick={submit} style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", gap: 6 }} disabled={busy}>{busy ? <SpinnerIcon size={13} /> : <CheckIcon size={13} />}{busy ? "Submitting..." : "Yes"}</button>
          </div>
        </div>
      ) : (
        <form onSubmit={askConfirm} style={{ display: "grid", gap: 12 }}>
          {error && <ErrorBox msg={error} />}
          <label style={labelStyle}>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} style={selectStyle}>
            {types.map((t) => <option key={t.key} value={t.key}>{t.label} ({t.unit})</option>)}
          </select>
          <label style={labelStyle}>Quantity ({typeInfo?.unit})</label>
          <input type="number" min="0.1" step="0.1" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={selectStyle} placeholder={`e.g. 5 ${typeInfo?.unit || ""}`} autoFocus />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
            <button type="button" onClick={onClose} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 6 }}><CheckIcon size={13} />Done</button>
            <button type="submit" style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", gap: 6 }}><PlusCircleIcon size={13} />Submit</button>
          </div>
          <p style={{ fontSize: 11.5, color: THEME.muted, margin: 0 }}>Bringing more than one item? Submit this one, then pick the next type - every submission is kept as its own dated record.</p>
        </form>
      )}
    </Modal>
  );
}

function FoodHistory({ showClassFilter = true }) {
  const { token } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const [year, setYear] = useState(new Date().getFullYear());
  const [form, setForm] = useState("");
  const [category, setCategory] = useState("");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [noClass, setNoClass] = useState(false);
  const [viewStudent, setViewStudent] = useState(null); // student whose full history is currently open

  const load = useCallback(() => {
    setError(""); setNoClass(false);
    const params = new URLSearchParams({ year });
    if (form) params.set("form", form);
    if (category) params.set("category", category);
    apiFetch(`/food/history/students?${params.toString()}`, {}, token)
      .then((d) => {
        setRows(d.data || []);
        if (d.message && !d.data?.length) setNoClass(true);
      })
      .catch((err) => setError(err.message));
  }, [token, year, form, category]);
  useEffect(load, [load]);

  return (
    <div>
      <p style={{ fontSize: 13, color: THEME.muted, marginBottom: 12 }}>Pick a student below to see their full contribution history.</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...selectStyle, ...(isCompact ? { flex: 1, minWidth: 90 } : {}) }}>
          {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {showClassFilter && (
          <select value={form} onChange={(e) => setForm(e.target.value)} style={{ ...selectStyle, ...(isCompact ? { flex: 1, minWidth: 130 } : {}) }}>
            <option value="">All Classes</option>
            {FORMS.map((f) => <option key={f}>{f}</option>)}
          </select>
        )}
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...selectStyle, ...(isCompact ? { flex: 1, minWidth: 130 } : {}) }}>
          <option value="">Boarding + Day</option>
          <option value="boarding">Boarding Only</option>
          <option value="day">Day Only</option>
        </select>
      </div>
      {error && <ErrorBox msg={error} />}
      {noClass && <ErrorBox msg="You have no class assigned yet - ask the Head Master to assign your class in User Accounts." />}
      {isCompact ? (
        <div style={cardList}>
          {rows.map((s) => (
            <div key={s.student_id} className="mk-row-card" style={rowCard}>
              <div style={cardHeadRow}>
                <span style={cardTitle}>{[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ")}</span>
                <span style={{ fontSize: 12, color: THEME.muted, fontWeight: 600 }}>{s.form}</span>
              </div>
              <div style={cardField}><span style={cardFieldLabel}>Category</span><span style={cardFieldValue}>{s.is_boarding ? "Boarding" : "Day"}</span></div>
              <div style={cardField}><span style={cardFieldLabel}>Contributions</span><span style={cardFieldValue}>{s.entry_count}</span></div>
              <div style={cardField}><span style={cardFieldLabel}>Last Date</span><span style={cardFieldValue}>{new Date(s.last_date).toLocaleDateString("en-GB", { timeZone: "Africa/Dar_es_Salaam" })}</span></div>
              <button onClick={() => setViewStudent(s)} style={{ ...btnRecord, width: "100%", marginTop: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><ClockIcon size={13} />View History</button>
            </div>
          ))}
          {!rows.length && !noClass && <p style={{ fontSize: 13, color: THEME.muted }}>No contributions recorded for {year}.</p>}
        </div>
      ) : (
      <div className="table-scroll" style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", padding: "9px 16px", fontSize: 11.5, fontWeight: 700, color: THEME.muted, background: THEME.bg, minWidth: 620 }}>
          <span style={{ flex: 1.6 }}>Name</span><span style={{ flex: 0.8 }}>Class</span><span style={{ flex: 0.8 }}>Category</span>
          <span style={{ flex: 0.8 }}>Contributions</span><span style={{ flex: 1 }}>Last Date</span><span style={{ width: 110 }} />
        </div>
        {rows.map((s, i) => (
          <div key={s.student_id} style={{ display: "flex", alignItems: "center", padding: "9px 16px", fontSize: 13, borderTop: i > 0 ? `1px solid ${THEME.border}` : "none", flexWrap: "wrap", gap: 6, minWidth: 620 }}>
            <span style={{ flex: 1.6 }}>{[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ")}</span>
            <span style={{ flex: 0.8 }}>{s.form}</span>
            <span style={{ flex: 0.8 }}>{s.is_boarding ? "Boarding" : "Day"}</span>
            <span style={{ flex: 0.8 }}>{s.entry_count}</span>
            <span style={{ flex: 1 }}>{new Date(s.last_date).toLocaleDateString("en-GB", { timeZone: "Africa/Dar_es_Salaam" })}</span>
            <span style={{ width: 110 }}><button onClick={() => setViewStudent(s)} style={{ ...btnRecord, display: "inline-flex", alignItems: "center", gap: 6 }}><ClockIcon size={13} />View History</button></span>
          </div>
        ))}
        {!rows.length && !noClass && <p style={{ padding: 16, fontSize: 13, color: THEME.muted }}>No contributions recorded for {year}.</p>}
      </div>
      )}
      {viewStudent && <StudentHistoryModal student={viewStudent} year={year} onClose={() => setViewStudent(null)} />}
    </div>
  );
}

// Full, dated list of every installment ONE student brought this year - kept
// out of the main list, which lists students (not installments), so it
// doesn't turn into hundreds of rows once many students have several
// contributions each.
//
// A student who brought NJUGU 3 times used to show 3 separate NJUGU rows,
// interleaved with MAHARAGE, KUNDE, etc. - a jumble on one page. Instead we
// group entries by type (NJUGU appears once, with a running total), and
// tapping that type opens its own dated sub-history - every date it was
// brought, the quantity each time, and who collected it.
function StudentHistoryModal({ student, year, onClose }) {
  const { token } = useAuth();
  const [entries, setEntries] = useState([]);
  const [types, setTypes] = useState([]);
  const [error, setError] = useState("");
  const [openType, setOpenType] = useState(null); // contribution_type currently drilled into, or null

  useEffect(() => {
    apiFetch(`/food/types`, {}, token).then((d) => setTypes(d.data || [])).catch(() => {});
    apiFetch(`/food/student/${student.student_id}/entries?year=${year}`, {}, token)
      .then((d) => setEntries(d.data || []))
      .catch((err) => setError(err.message));
  }, [token, student.student_id, year]);

  const name = [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ");

  // One group per contribution_type actually present in this student's
  // entries, in the order defined by TYPES (falls back to first-seen order
  // for any custom type not in that list).
  const groups = types
    .map((t) => ({ type: t, entries: entries.filter((e) => e.contribution_type === t.key) }))
    .filter((g) => g.entries.length > 0);
  const openGroup = openType ? groups.find((g) => g.type.key === openType) : null;

  return (
    <Modal title={openGroup ? `${openGroup.type.label} - ${name}` : `Contribution History - ${name}`} onClose={onClose}>
      {error && <ErrorBox msg={error} />}
      {openGroup ? (
        <div>
          <button onClick={() => setOpenType(null)} style={{ ...btnSecondary, marginBottom: 12, display: "inline-flex", alignItems: "center", gap: 6 }}><ChevronLeftIcon size={13} />Back to all types</button>
          <div style={{ display: "grid", gap: 8 }}>
            {openGroup.entries.map((e) => (
              <div key={e.id} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 10px", background: THEME.bg, borderRadius: 0, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600 }}>{new Date(e.created_at).toLocaleDateString("en-GB", { timeZone: "Africa/Dar_es_Salaam" })}</span>
                  <span>{Number(e.quantity)} {openGroup.type.unit === "LITRES" ? "L" : "kg"}</span>
                </div>
                <div style={{ fontSize: 11.5, color: THEME.muted }}>{e.recorded_by_name ? `Collected by ${e.recorded_by_name}` : ""}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {groups.map((g) => {
            const total = g.entries.reduce((sum, e) => sum + Number(e.quantity), 0);
            return (
              <button key={g.type.key} onClick={() => setOpenType(g.type.key)} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left",
                padding: "10px 12px", background: THEME.bg, border: "none", borderRadius: 0, fontSize: 13, cursor: "pointer",
              }}>
                <span style={{ fontWeight: 600 }}>{g.type.label}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: THEME.muted, fontSize: 11.5 }}>{g.entries.length} time{g.entries.length > 1 ? "s" : ""}</span>
                  <span>{total} {g.type.unit === "LITRES" ? "L" : "kg"}</span>
                  <span style={{ color: THEME.muted, display: "flex" }}><ChevronRightIcon size={14} /></span>
                </span>
              </button>
            );
          })}
          {!groups.length && !error && <p style={{ fontSize: 13, color: THEME.muted }}>No entries found.</p>}
        </div>
      )}
    </Modal>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: THEME.surface, borderRadius: 0, padding: 22, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15.5, color: THEME.heading }}>{title}</h3>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: THEME.muted, lineHeight: 1, display: "flex", alignItems: "center" }}><CloseIcon size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorBox({ msg }) {
  return <div style={{ marginBottom: 14, padding: 12, borderRadius: 0, fontSize: 13.5, background: THEME.dangerLight, color: THEME.danger }}>{msg}</div>;
}

const tabActive = { padding: "8px 16px", borderRadius: 0, border: "none", background: THEME.navy, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const tabInactive = { padding: "8px 16px", borderRadius: 0, border: `1px solid ${THEME.border}`, background: THEME.surface, color: THEME.text, fontSize: 13, cursor: "pointer" };
const tabCompact = { padding: "7px 12px", fontSize: 12, flexShrink: 0, whiteSpace: "nowrap" };
const selectStyle = { padding: "8px 12px", border: `1px solid ${THEME.border}`, borderRadius: 0, fontSize: 13 };
const labelStyle = { fontSize: 12, fontWeight: 600, color: THEME.text, margin: 0 };
const badge = { fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 0, background: THEME.successLight, color: THEME.success };
const btnRecord = { padding: "7px 12px", borderRadius: 0, border: `1px solid ${THEME.heading}`, background: THEME.surface, color: THEME.heading, fontSize: 12, fontWeight: 600, cursor: "pointer" };

// Mobile/tablet "row card" - the responsive stand-in for a flex-row table
// column set. Every table in this file that used to force horizontal
// scrolling on a phone or small tablet (via a fixed minWidth) switches to a
// grid of these on isCompact, so nothing sits off-screen.
const cardList = { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" };
const rowCard = { background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, padding: "12px 14px" };
const cardHeadRow = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 };
const cardTitle = { fontSize: 14, fontWeight: 700, color: THEME.text };
const cardField = { display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, padding: "3px 0" };
const cardFieldLabel = { color: THEME.muted, flexShrink: 0 };
const cardFieldValue = { color: THEME.text, fontWeight: 600, textAlign: "right" };
const btnPrimary = { padding: "9px 18px", background: THEME.navy, color: "#fff", border: "none", borderRadius: 0, fontWeight: 600, fontSize: 13, cursor: "pointer" };
const btnSecondary = { padding: "9px 18px", background: THEME.surface, color: THEME.heading, border: `1.5px solid ${THEME.heading}`, borderRadius: 0, fontWeight: 600, fontSize: 13, cursor: "pointer" };
const btnCancelRed = { padding: "9px 18px", background: THEME.surface, color: THEME.danger, border: `1.5px solid ${THEME.danger}`, borderRadius: 0, fontWeight: 600, fontSize: 13, cursor: "pointer" };
