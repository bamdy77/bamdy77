import { useState, useEffect, useCallback, useRef } from "react";
import { openDownload } from "../utils/openDownload";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch, API_BASE } from "../utils/api";
import { THEME } from "../styles/theme";
import { useConfirm } from "../components/ConfirmDialog";
import { showSuccess } from "../components/SuccessModal";
import { showError } from "../components/ErrorModal";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { DotsVerticalIcon, CoinsIcon, CalendarIcon, ReamIcon, WalletIcon, UserHistoryIcon, ClockIcon, CheckCircleIcon, LayersIcon, CalendarPlusIcon, ReceiptIcon, EditIcon, SpinnerIcon } from "../components/icons";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const HOLIDAY_MONTHS = [6, 12];
const FORMS = ["Form I", "Form II", "Form III", "Form IV"];
const MONTHLY_FEE = 2000;

// Shared tab bar for Contributions Management.
//
// Desktop: a segmented pill row (unchanged).
//
// Mobile/tablet: a CSS GRID of full-width "tab cards" - two per row -
// instead of a flex row. flex-wrap technically wraps onto more lines when
// pills don't fit, but on a real phone that relies on every pill's
// intrinsic content width adding up exactly right across however many
// rows; a grid instead FIXES the column count up front (2 columns) and
// lets the grid itself place every single item into a row, so there is no
// arrangement where a tab can end up squeezed out or only the last row
// ends up visible. This is what actually guarantees every tab, icon and
// label is always on-screen and tappable on a phone or tablet - nothing
// is ever hidden or requires scrolling to discover.
// A little extra top margin keeps this first thing on the page from
// sitting flush against the fixed mobile top bar.
function TabBar({ tabs, active, onChange, isCompact }) {
  if (isCompact) {
    return (
      <div className="mk-tabbar-wrap" style={{ marginTop: 6, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          {tabs.map(([key, label, Icon]) => {
            const isActive = active === key;
            return (
              <button key={key} onClick={() => onChange(key)} style={tabCard(isActive)}>
                <span style={tabCardIconWrap(isActive)}>{Icon && <Icon size={16} />}</span>
                <span style={tabCardLabel(isActive)}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div className="mk-tabbar-wrap" style={{ marginBottom: 20 }}>
      <div className="mk-tabbar" style={{ flexWrap: "wrap" }}>
        {tabs.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={active === key ? tabPillActive(isCompact) : tabPillInactive(isCompact)}
          >
            {Icon && <Icon size={14} />}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

const tabPillActive = (isCompact) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: isCompact ? "8px 13px" : "9px 16px", borderRadius: 4, border: "none", background: THEME.navy, color: "#fff", fontSize: isCompact ? 12.5 : 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" });
const tabPillInactive = (isCompact) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: isCompact ? "8px 13px" : "9px 16px", borderRadius: 4, border: `1px solid ${THEME.border}`, background: THEME.surface, color: THEME.text, fontSize: isCompact ? 12.5 : 13, cursor: "pointer", whiteSpace: "nowrap" });

// Colored stat card, matching the tinted look Student Management/Timetable
// already use (a pale wash of `color` behind the number) - Contributions
// Management/Food Contributions previously used a single flat neutral
// card for every stat, which made it hard to tell "collected/paid" figures
// apart from "outstanding/pending" ones at a glance.
function StatCard({ label, value, sub, color = THEME.link }) {
  return (
    <div style={{ background: `color-mix(in srgb, ${color} 16%, ${THEME.surface})`, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: "12px 18px", minWidth: 160 }}>
      <div style={{ fontSize: 11.5, color: THEME.muted }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: THEME.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Modern mobile/tablet tab card - icon in a soft tinted badge, label below,
// active tab gets the navy fill + a bottom accent bar so it reads clearly
// as "selected" even at a glance while scrolling.
const tabCard = (isActive) => ({
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
  padding: "14px 8px 12px", borderRadius: 4, cursor: "pointer", textAlign: "center",
  border: isActive ? `1px solid ${THEME.navy}` : `1px solid ${THEME.border}`,
  background: isActive ? THEME.navy : THEME.surface,
  boxShadow: isActive ? "0 4px 14px rgba(15,23,42,0.18)" : "0 1px 3px rgba(15,23,42,0.05)",
  transition: "background 0.15s ease, box-shadow 0.15s ease",
});
const tabCardIconWrap = (isActive) => ({
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 30, height: 30, borderRadius: "50%",
  background: isActive ? "rgba(255,255,255,0.18)" : THEME.bg,
  color: isActive ? "#fff" : THEME.link,
});
const tabCardLabel = (isActive) => ({
  fontSize: 12, fontWeight: 700, lineHeight: 1.25,
  color: isActive ? "#fff" : THEME.text,
});

export default function Contributions() {
  const { user } = useAuth();
  const myRoles = user.roles && user.roles.length ? user.roles : [user.role];
  const isOverseer = myRoles.some((r) => ["admin", "second_master", "academic"].includes(r));
  if (isOverseer) return <OversightView />;
  return <ClassTeacherView />;
}

function OversightView() {
  const { token } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const [tab, setTab] = useState("parttime");
  const tabs = [
    ["parttime", "Part-Time Teachers", CoinsIcon],
    ["daily", "Daily Collections", CalendarIcon],
    ["ream", "Ream(s)", ReamIcon],
    ["other", "Other Expenses", WalletIcon],
    ["students", "Student History", UserHistoryIcon],
    ["history", "History", ClockIcon],
  ];
  return (
    <div style={{ padding: isMobile ? "16px 12px" : isTablet ? "24px 20px" : 32 }}>
      <h2 style={{ color: THEME.heading, fontSize: isMobile ? 16 : isTablet ? 18 : 20, marginBottom: 4 }}>Contributions Management</h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 18 }}>Full oversight of contributions collected by every class teacher.</p>
      <TabBar tabs={tabs} active={tab} onChange={setTab} isCompact={isCompact} />
      {tab === "parttime" && <PartTimeOversight token={token} />}
      {tab === "daily" && <DailyCollections showClassFilter />}
      {tab === "ream" && <ReamOversight token={token} />}
      {tab === "other" && <OtherExpensesOversight token={token} />}
      {tab === "students" && <PartTimeStudentHistory token={token} />}
      {tab === "history" && <PartTimeHistory token={token} />}
    </div>
  );
}

function PartTimeOversight({ token }) {
  const { user } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const canEditFee = [user?.role, ...(user?.roles || [])].some((r) => r === "admin" || r === "second_master");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [summary, setSummary] = useState([]);
  const [fee, setFee] = useState(null);
  const [editFee, setEditFee] = useState(false);
  const [drillForm, setDrillForm] = useState(null);
  const [drillRows, setDrillRows] = useState([]);
  const [error, setError] = useState("");

  const loadSummary = useCallback(() => {
    setError("");
    apiFetch(`/contributions/parttime/summary?year=${year}&month=${month}`, {}, token)
      .then((d) => { setSummary(d.data || []); if (d.monthly_fee) setFee(Number(d.monthly_fee)); })
      .catch((err) => setError(err.message));
  }, [token, year, month]);
  useEffect(loadSummary, [loadSummary]);

  const openClass = (form) => {
    setDrillForm(form);
    apiFetch(`/contributions/parttime?year=${year}&month=${month}&form=${encodeURIComponent(form)}`, {}, token)
      .then((d) => setDrillRows(d.data || []))
      .catch((err) => setError(err.message));
  };

  const isHoliday = HOLIDAY_MONTHS.includes(Number(month));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap", background: `color-mix(in srgb, ${THEME.link} 8%, ${THEME.surface})`, border: `1px solid ${THEME.border}`, borderRadius: 6, padding: "11px 16px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11.5, color: THEME.muted }}>Monthly amount per student ({MONTHS[month - 1]} {year})</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: THEME.heading }}>{fee == null ? "…" : `TZS ${fee.toLocaleString()}`}</div>
        </div>
        {canEditFee && (
          <button onClick={() => setEditFee(true)} style={{ ...btnSecondary, marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}><EditIcon size={13} />Change amount</button>
        )}
      </div>
      {editFee && <EditPartTimeFeeModal token={token} onClose={() => setEditFee(false)} onDone={() => { setEditFee(false); loadSummary(); }} />}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={month} onChange={(e) => { setMonth(Number(e.target.value)); setDrillForm(null); }} style={{ ...selectStyle, ...(isMobile ? { flex: 1, minWidth: 130 } : {}) }}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setDrillForm(null); }} style={{ ...selectStyle, ...(isMobile ? { flex: 1, minWidth: 90 } : {}) }}>
          {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {error && <ErrorBox msg={error} />}
      {isHoliday ? (
        <p style={{ fontSize: 13.5, color: THEME.muted }}>No contribution is billed in {MONTHS[month - 1]} (school holiday).</p>
      ) : !drillForm ? (
        isCompact ? (
          <div style={cardList}>
            {summary.map((r) => (
              <div key={r.form} onClick={() => openClass(r.form)} className="mk-row-card" style={{ ...rowCard, cursor: "pointer" }}>
                <div style={cardHeadRow}>
                  <span style={cardTitle}>{r.form}</span>
                  <span style={cardChevron}>›</span>
                </div>
                <div style={cardField}><span style={cardFieldLabel}>Students Paid</span><span style={cardFieldValue}>{r.students_paid} / {r.total_students}</span></div>
                <div style={cardField}><span style={cardFieldLabel}>Total Collected</span><span style={cardFieldValue}>TZS {Number(r.total_collected).toLocaleString()}</span></div>
                <div style={cardField}><span style={cardFieldLabel}>Collected By</span><span style={{ ...cardFieldValue, fontWeight: 400 }}>{r.collected_by?.length ? r.collected_by.join(", ") : "-"}</span></div>
              </div>
            ))}
            {!summary.length && <p style={{ fontSize: 13, color: THEME.muted }}>No classes found.</p>}
          </div>
        ) : (
        <div className="table-scroll" style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ display: "flex", padding: "9px 16px", fontSize: 11.5, fontWeight: 700, color: THEME.muted, background: THEME.bg, minWidth: 560 }}>
            <span style={{ flex: 1.5 }}>Class</span>
            <span style={{ flex: 1 }}>Students Paid</span>
            <span style={{ flex: 1 }}>Total Collected</span>
            <span style={{ flex: 2 }}>Collected By</span>
          </div>
          {summary.map((r, i) => (
            <div key={r.form} onClick={() => openClass(r.form)} style={{ display: "flex", alignItems: "center", padding: "10px 16px", fontSize: 13, cursor: "pointer", borderTop: i > 0 ? `1px solid ${THEME.border}` : "none", minWidth: 560 }}>
              <span style={{ flex: 1.5, fontWeight: 600 }}>{r.form}</span>
              <span style={{ flex: 1 }}>{r.students_paid} / {r.total_students}</span>
              <span style={{ flex: 1 }}>TZS {Number(r.total_collected).toLocaleString()}</span>
              <span style={{ flex: 2, fontSize: 12, color: THEME.muted }}>{r.collected_by?.length ? r.collected_by.join(", ") : "-"}</span>
            </div>
          ))}
          {!summary.length && <p style={{ padding: 16, fontSize: 13, color: THEME.muted }}>No classes found.</p>}
        </div>
        )
      ) : (
        <div>
          <button onClick={() => setDrillForm(null)} style={{ ...btnSecondary, marginBottom: 12 }}>Back to all classes</button>
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>{drillForm} - {MONTHS[month - 1]} {year}</h3>
          {isCompact ? (
            <div style={cardList}>
              {drillRows.map((s) => (
                <div key={s.student_id} className="mk-row-card" style={rowCard}>
                  <div style={cardHeadRow}>
                    <span style={{ ...cardTitle, color: THEME.text }}>{[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ")}</span>
                    <StatusPill ok={s.completed}>{s.completed ? "Completed" : s.amount_paid > 0 ? "Partial" : "Not Paid"}</StatusPill>
                  </div>
                  <div style={cardField}><span style={cardFieldLabel}>Collected By</span><span style={{ ...cardFieldValue, fontWeight: 400 }}>{s.collected_by_name || "-"}</span></div>
                </div>
              ))}
              {!drillRows.length && <p style={{ fontSize: 13, color: THEME.muted }}>No students found.</p>}
            </div>
          ) : (
          <div className="table-scroll" style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ display: "flex", padding: "9px 16px", fontSize: 11.5, fontWeight: 700, color: THEME.muted, background: THEME.bg, minWidth: 460 }}>
              <span style={{ flex: 2 }}>Name</span>
              <span style={{ flex: 1 }}>Status</span>
              <span style={{ flex: 1 }}>Collected By</span>
            </div>
            {drillRows.map((s, i) => (
              <div key={s.student_id} style={{ display: "flex", alignItems: "center", padding: "9px 16px", fontSize: 13, borderTop: i > 0 ? `1px solid ${THEME.border}` : "none", minWidth: 460 }}>
                <span style={{ flex: 2 }}>{[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ")}</span>
                <StatusPill ok={s.completed} style={{ flex: 1 }}>{s.completed ? "Completed" : s.amount_paid > 0 ? "Partial" : "Not Paid"}</StatusPill>
                <span style={{ flex: 1, fontSize: 12, color: THEME.muted }}>{s.collected_by_name || "-"}</span>
              </div>
            ))}
          </div>
          )}
        </div>
      )}
    </div>
  );
}

function PartTimeHistory({ token }) {
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const [year, setYear] = useState(new Date().getFullYear());
  const [form, setForm] = useState("");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/contributions/parttime/history?year=${year}${form ? `&form=${encodeURIComponent(form)}` : ""}`, {}, token)
      .then((d) => setRows(d.data || []))
      .catch((err) => setError(err.message));
  }, [token, year, form]);

  return (
    <div>
      <p style={{ fontSize: 13, color: THEME.muted, marginBottom: 12 }}>Browse any past (or future) year's collection record, month by month.</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...selectStyle, ...(isMobile ? { flex: 1, minWidth: 90 } : {}) }}>
          {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={form} onChange={(e) => setForm(e.target.value)} style={{ ...selectStyle, ...(isMobile ? { flex: 1, minWidth: 130 } : {}) }}>
          <option value="">All Classes</option>
          {FORMS.map((f) => <option key={f}>{f}</option>)}
        </select>
      </div>
      {error && <ErrorBox msg={error} />}
      {isCompact ? (
        <div style={cardList}>
          {rows.map((r) => (
            <div key={`${r.month}-${r.form}`} className="mk-row-card" style={rowCard}>
              <div style={cardHeadRow}>
                <span style={cardTitle}>{MONTHS[r.month - 1]}</span>
                <span style={{ fontSize: 12, color: THEME.muted, fontWeight: 600 }}>{r.form}</span>
              </div>
              <div style={cardField}><span style={cardFieldLabel}>Students Paid</span><span style={cardFieldValue}>{r.students_paid}</span></div>
              <div style={cardField}><span style={cardFieldLabel}>Total Collected</span><span style={cardFieldValue}>TZS {Number(r.total_collected).toLocaleString()}</span></div>
            </div>
          ))}
          {!rows.length && <p style={{ fontSize: 13, color: THEME.muted }}>No records for {year}.</p>}
        </div>
      ) : (
      <div className="table-scroll" style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ display: "flex", padding: "9px 16px", fontSize: 11.5, fontWeight: 700, color: THEME.muted, background: THEME.bg, minWidth: 480 }}>
          <span style={{ flex: 1 }}>Month</span>
          <span style={{ flex: 1 }}>Class</span>
          <span style={{ flex: 1 }}>Students Paid</span>
          <span style={{ flex: 1 }}>Total Collected</span>
        </div>
        {rows.map((r, i) => (
          <div key={`${r.month}-${r.form}`} style={{ display: "flex", padding: "8px 16px", fontSize: 13, borderTop: i > 0 ? `1px solid ${THEME.border}` : "none", minWidth: 480 }}>
            <span style={{ flex: 1 }}>{MONTHS[r.month - 1]}</span>
            <span style={{ flex: 1 }}>{r.form}</span>
            <span style={{ flex: 1 }}>{r.students_paid}</span>
            <span style={{ flex: 1 }}>TZS {Number(r.total_collected).toLocaleString()}</span>
          </div>
        ))}
        {!rows.length && <p style={{ padding: 16, fontSize: 13, color: THEME.muted }}>No records for {year}.</p>}
      </div>
      )}
    </div>
  );
}

// One row per STUDENT who has paid Part-Time Teachers contribution this
// year (deduped - a student who paid several months shows once, with a
// running total), plus the combined count of students who've brought
// EITHER Part-time Teachers or Ream this year. Click a student's name to
// see every month they paid, with the date and who collected it.
function PartTimeStudentHistory({ token }) {
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [combinedCount, setCombinedCount] = useState(0);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [viewStudent, setViewStudent] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(() => {
    setError("");
    apiFetch(`/contributions/parttime/students?year=${year}`, {}, token)
      .then((d) => { setRows(d.data || []); setGrandTotal(Number(d.grand_total || 0)); })
      .catch((err) => setError(err.message));
    apiFetch(`/contributions/summary/students-count?year=${year}`, {}, token)
      .then((d) => setCombinedCount(d.data?.total || 0))
      .catch(() => {});
  }, [token, year]);
  useEffect(load, [load]);

  const filtered = rows.filter((s) => !search.trim() || `${s.first_name} ${s.middle_name || ""} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()));

  const [downloadModal, setDownloadModal] = useState(false);

  // `opts` comes from DownloadOptionsModal below - { scope: "year"|"month"|"range", month, fromMonth, toMonth }.
  // A class_teacher never needs to pick a class here - the backend already
  // scopes every one of these queries (list, count, PDF) to their own class
  // via classScopeFor(), same as the on-screen table above.
  const downloadPdf = async (opts) => {
    setDownloading(true);
    try {
      const params = new URLSearchParams({ year: String(year) });
      if (opts?.scope === "month") params.set("month", String(opts.month));
      else if (opts?.scope === "range") { params.set("from_month", String(opts.fromMonth)); params.set("to_month", String(opts.toMonth)); }
      const res = await fetch(`${API_BASE}/contributions/parttime/students/pdf?${params}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Could not generate PDF.");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const suffix = opts?.scope === "month" ? `-${MONTHS[opts.month - 1]}` : opts?.scope === "range" ? `-${MONTHS[opts.fromMonth - 1]}-to-${MONTHS[opts.toMonth - 1]}` : "";
      a.href = url; a.download = `contributions-students-${year}${suffix}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      setDownloadModal(false);
    } catch (err) { setError(err.message); }
    finally { setDownloading(false); }
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: THEME.muted, marginBottom: 12 }}>Each student who has contributed appears once - click "View History" for every month they paid, with the date and who collected it.</p>
      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <StatCard label={`Total Collected - Part-Time Teachers (${year})`} value={`TZS ${grandTotal.toLocaleString()}`} color={THEME.link} />
        <StatCard label={`Students Contributed (${year})`} value={combinedCount} sub="Part-Time Teachers or Ream(s)" color={THEME.success} />
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={selectStyle}>
          {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <input placeholder="Search student name..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...selectStyle, flex: 1, minWidth: 200 }} />
        <button onClick={() => setDownloadModal(true)} disabled={downloading} style={{ ...btnRecord, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          {downloading ? <SpinnerIcon size={13} /> : null}{downloading ? "Generating..." : "Download PDF"}
        </button>
      </div>
      {error && <ErrorBox msg={error} />}
      {downloadModal && (
        <DownloadOptionsModal
          year={year}
          downloading={downloading}
          onClose={() => setDownloadModal(false)}
          onConfirm={downloadPdf}
        />
      )}
      {isCompact ? (
        <div style={cardList}>
          {filtered.map((s) => (
            <div key={s.student_id} className="mk-row-card" style={rowCard}>
              <div style={cardHeadRow}>
                <span style={{ ...cardTitle, color: THEME.text }}>{[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ")}</span>
                <span style={{ fontSize: 12, color: THEME.muted, fontWeight: 600 }}>{s.form}</span>
              </div>
              <div style={cardField}><span style={cardFieldLabel}>Months Paid</span><span style={cardFieldValue}>{s.months_paid}</span></div>
              <div style={cardField}><span style={cardFieldLabel}>Ream(s)</span><span style={{ ...cardFieldValue, color: s.ream_contributed ? THEME.success : THEME.muted }}>{s.ream_contributed ? "Brought" : "-"}</span></div>
              <div style={cardField}><span style={cardFieldLabel}>Total Paid</span><span style={cardFieldValue}>TZS {Number(s.total_paid).toLocaleString()}</span></div>
              <button onClick={() => setViewStudent(s)} style={{ ...btnRecord, width: "100%", marginTop: 8 }}>View History</button>
            </div>
          ))}
          {!filtered.length && <p style={{ fontSize: 13, color: THEME.muted }}>{search ? "No matching student found." : `No contributions recorded for ${year}.`}</p>}
        </div>
      ) : (
      <div className="table-scroll" style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ display: "flex", padding: "9px 16px", fontSize: 11.5, fontWeight: 700, color: THEME.muted, background: THEME.bg, minWidth: 680 }}>
          <span style={{ flex: 1.8 }}>Name</span><span style={{ flex: 0.8 }}>Class</span>
          <span style={{ flex: 1 }}>Months Paid</span><span style={{ flex: 0.7 }}>Ream(s)</span><span style={{ flex: 1 }}>Total Paid</span><span style={{ width: 110 }} />
        </div>
        {filtered.map((s, i) => (
          <div key={s.student_id} style={{ display: "flex", alignItems: "center", padding: "9px 16px", fontSize: 13, borderTop: i > 0 ? `1px solid ${THEME.border}` : "none", gap: 6, minWidth: 680 }}>
            <span style={{ flex: 1.8 }}>{[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ")}</span>
            <span style={{ flex: 0.8 }}>{s.form}</span>
            <span style={{ flex: 1 }}>{s.months_paid}</span>
            <span style={{ flex: 0.7, color: s.ream_contributed ? THEME.success : THEME.muted, fontWeight: s.ream_contributed ? 700 : 400 }}>{s.ream_contributed ? "Brought" : "-"}</span>
            <span style={{ flex: 1 }}>TZS {Number(s.total_paid).toLocaleString()}</span>
            <span style={{ width: 110 }}><button onClick={() => setViewStudent(s)} style={btnRecord}>View History</button></span>
          </div>
        ))}
        {!filtered.length && <p style={{ padding: 16, fontSize: 13, color: THEME.muted }}>{search ? "No matching student found." : `No contributions recorded for ${year}.`}</p>}
      </div>
      )}
      {viewStudent && <StudentPartTimeHistoryModal student={viewStudent} year={year} token={token} onClose={() => setViewStudent(null)} />}
    </div>
  );
}

// One row per month is already how contribution_parttime is stored (a
// student cannot have two separate rows for the same month - a second
// payment the same month adds to the existing row's total instead, tracked
// via `installments`). So unlike Food Contributions, there's nothing to
// mis-group here - but a student who paid in more than one installment for
// a given month gets that called out explicitly, instead of just showing
// one lump total with no sign it was collected across multiple visits.
function StudentPartTimeHistoryModal({ student, year, token, onClose }) {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/contributions/parttime/student/${student.student_id}/entries?year=${year}`, {}, token)
      .then((d) => setEntries(d.data || []))
      .catch((err) => setError(err.message));
  }, [token, student.student_id, year]);

  const name = [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: THEME.surface, borderRadius: 4, padding: 22, width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15.5, color: THEME.heading }}>Contribution History - {name}</h3>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: THEME.muted, lineHeight: 1 }}>&times;</button>
        </div>
        {error && <ErrorBox msg={error} />}
        <div style={{ display: "grid", gap: 8 }}>
          {entries.map((e) => (
            <div key={`${e.source}-${e.id}`} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 10px", background: THEME.bg, borderRadius: 4, fontSize: 13 }}>
              {e.source === "ream" ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600 }}>Ream(s) ({year})</span>
                    <span style={{ color: THEME.success, fontWeight: 600 }}>Brought</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: THEME.muted }}>
                    <span>{e.recorded_by_name ? `Collected by ${e.recorded_by_name}` : ""}</span>
                    <span>{new Date(e.updated_at).toLocaleDateString("en-GB", { timeZone: "Africa/Dar_es_Salaam" })}</span>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600 }}>{MONTHS[e.month - 1]} {year}</span>
                    <span>TZS {Number(e.amount_paid).toLocaleString()} {e.completed ? "" : "(Partial)"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: THEME.muted }}>
                    <span>{e.recorded_by_name ? `Collected by ${e.recorded_by_name}` : ""}</span>
                    <span>{new Date(e.updated_at).toLocaleDateString("en-GB", { timeZone: "Africa/Dar_es_Salaam" })}</span>
                  </div>
                  {Number(e.installments) > 1 && (
                    <div style={{ fontSize: 11, color: THEME.heading, fontWeight: 600 }}>Paid across {e.installments} separate installments this month</div>
                  )}
                </>
              )}
            </div>
          ))}
          {!entries.length && !error && <p style={{ fontSize: 13, color: THEME.muted }}>No entries found.</p>}
        </div>
      </div>
    </div>
  );
}

// Asked before every "Download PDF" on Student History, so whoever is
// downloading (Class Teacher/Academic Master/Admin/Second Master) picks
// exactly WHAT period they want printed - the whole year, one specific
// month, or a range of months - instead of always getting the full year.
// The year itself is whatever's already selected on the page (`year` prop) -
// this only narrows the month(s) within it. Class scoping (a class_teacher
// only ever seeing their own class) is enforced server-side already, same
// as the on-screen list, so there's nothing to pick here for that.
function DownloadOptionsModal({ year, downloading, onClose, onConfirm }) {
  const [scope, setScope] = useState("year"); // year | month | range
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [fromMonth, setFromMonth] = useState(1);
  const [toMonth, setToMonth] = useState(12);
  const [err, setErr] = useState("");

  const confirm = () => {
    if (scope === "range" && Number(fromMonth) > Number(toMonth)) {
      setErr("The starting month must come before the ending month.");
      return;
    }
    setErr("");
    onConfirm(
      scope === "month" ? { scope, month: Number(month) }
      : scope === "range" ? { scope, fromMonth: Number(fromMonth), toMonth: Number(toMonth) }
      : { scope: "year" }
    );
  };

  const radioRow = (value, label) => (
    <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: `1px solid ${THEME.border}`, borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: scope === value ? 700 : 500, background: scope === value ? THEME.bg : "transparent" }}>
      <input type="radio" name="dl-scope" checked={scope === value} onChange={() => setScope(value)} />
      {label}
    </label>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 210, padding: 16 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: THEME.surface, borderRadius: 4, padding: 22, width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15.5, color: THEME.heading }}>Download Contributions Report</h3>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: THEME.muted, lineHeight: 1 }}>&times;</button>
        </div>
        <p style={{ fontSize: 12.5, color: THEME.muted, marginTop: 0, marginBottom: 14 }}>Choose which part of {year} to include in the PDF.</p>
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {radioRow("year", `Whole Year (${year})`)}
          {radioRow("month", "One Specific Month")}
          {radioRow("range", "A Range of Months")}
        </div>
        {scope === "month" && (
          <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...selectStyle, width: "100%", marginBottom: 14 }}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        )}
        {scope === "range" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <select value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>From: {m}</option>)}
            </select>
            <select value={toMonth} onChange={(e) => setToMonth(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>To: {m}</option>)}
            </select>
          </div>
        )}
        {err && <ErrorBox msg={err} />}
        <button onClick={confirm} disabled={downloading} style={{ ...btnRecord, width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: 6, padding: "10px 12px" }}>
          {downloading ? <SpinnerIcon size={13} /> : null}{downloading ? "Generating..." : "Download PDF"}
        </button>
      </div>
    </div>
  );
}

function ReamOversight({ token }) {
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const [summary, setSummary] = useState([]);
  const [list, setList] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch("/contributions/ream/summary", {}, token).then((d) => setSummary(d.data || [])).catch((err) => setError(err.message));
    apiFetch("/contributions/ream", {}, token).then((d) => setList(d.data || [])).catch(() => {});
  }, [token]);

  return (
    <div>
      {error && <ErrorBox msg={error} />}
      <h3 style={{ fontSize: 14, marginBottom: 10 }}>Ream(s) - by Class</h3>
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        {summary.map((r) => (
          <div key={r.form} style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: "14px 18px", minWidth: 130, flex: isCompact ? "1 1 130px" : "0 0 auto" }}>
            <div style={{ fontSize: 12, color: THEME.muted }}>{r.form}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: THEME.heading }}>{r.students_brought}</div>
            <div style={{ fontSize: 11, color: THEME.muted }}>students brought Ream(s)</div>
          </div>
        ))}
      </div>
      <h3 style={{ fontSize: 14, marginBottom: 10 }}>Recent Entries</h3>
      {isCompact ? (
        <div style={cardList}>
          {list.slice(0, 30).map((r) => (
            <div key={r.id} className="mk-row-card" style={rowCard}>
              <div style={cardHeadRow}>
                <span style={{ ...cardTitle, color: THEME.text }}>{[r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ")}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: THEME.muted, fontWeight: 600 }}>{r.form}</span>
                  <ActionMenu>
                    <MenuItem icon={ReceiptIcon} onClick={() => openDownload(`/contributions/receipt/charge/${r.id}`, token).catch((e) => showError("Receipt", e.message))}>Receipt (PDF)</MenuItem>
                  </ActionMenu>
                </div>
              </div>
              <div style={cardField}><span style={cardFieldLabel}>Date</span><span style={cardFieldValue}>{r.charge_date?.slice?.(0, 10) || r.charge_date}</span></div>
            </div>
          ))}
          {!list.length && <p style={{ fontSize: 13, color: THEME.muted }}>No Ream(s) entries yet.</p>}
        </div>
      ) : (
      <div className="table-scroll" style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ minWidth: 420 }}>
          {list.slice(0, 30).map((r, i) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", padding: "8px 16px", fontSize: 13, borderTop: i > 0 ? `1px solid ${THEME.border}` : "none" }}>
              <span style={{ flex: 2 }}>{[r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ")}</span>
              <span style={{ flex: 1 }}>{r.form}</span>
              <span style={{ flex: 1 }}>{r.charge_date?.slice?.(0, 10) || r.charge_date}</span>
              <span style={{ width: 44, textAlign: "right" }}>
                <ActionMenu>
                  <MenuItem icon={ReceiptIcon} onClick={() => openDownload(`/contributions/receipt/charge/${r.id}`, token).catch((e) => showError("Receipt", e.message))}>Receipt (PDF)</MenuItem>
                </ActionMenu>
              </span>
            </div>
          ))}
        </div>
        {!list.length && <p style={{ padding: 16, fontSize: 13, color: THEME.muted }}>No Ream(s) entries yet.</p>}
      </div>
      )}
    </div>
  );
}

function OtherExpensesOversight({ token }) {
  const { user } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const [list, setList] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  // Editing a payment amount/note is restricted server-side to the Head
  // Master and Second Master (see PUT /contributions/charge/:chargeId) -
  // hide the option for everyone else so it doesn't invite a 403.
  const canEdit = (user?.roles || [user?.role]).some((r) => ["admin", "second_master"].includes(r));

  const load = useCallback(() => {
    apiFetch("/contributions/other", {}, token).then((d) => setList(d.data || [])).catch((err) => setError(err.message));
  }, [token]);
  useEffect(load, [load]);

  const actions = (r) => (
    <ActionMenu>
      <MenuItem icon={ReceiptIcon} onClick={() => openDownload(`/contributions/receipt/charge/${r.id}`, token).catch((e) => showError("Receipt", e.message))}>Receipt (PDF)</MenuItem>
      {canEdit && !r.locked && <MenuItem icon={EditIcon} onClick={() => setEditing(r)}>Edit Amount...</MenuItem>}
    </ActionMenu>
  );

  return (
    <div>
      {error && <ErrorBox msg={error} />}
      {isCompact ? (
        <div style={cardList}>
          {list.map((r) => (
            <div key={r.id} className="mk-row-card" style={rowCard}>
              <div style={cardHeadRow}>
                <span style={{ ...cardTitle, color: THEME.text }}>{[r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ")}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: THEME.muted, fontWeight: 600 }}>{r.form}</span>
                  {actions(r)}
                </div>
              </div>
              <div style={cardField}><span style={cardFieldLabel}>Amount</span><span style={cardFieldValue}>TZS {Number(r.amount || 0).toLocaleString()}</span></div>
              <div style={cardField}><span style={cardFieldLabel}>Date</span><span style={cardFieldValue}>{r.charge_date?.slice?.(0, 10) || r.charge_date}</span></div>
            </div>
          ))}
          {!list.length && <p style={{ fontSize: 13, color: THEME.muted }}>No entries yet.</p>}
        </div>
      ) : (
      <div className="table-scroll" style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ display: "flex", padding: "9px 16px", fontSize: 11.5, fontWeight: 700, color: THEME.muted, background: THEME.bg, minWidth: 520 }}>
          <span style={{ flex: 2 }}>Name</span><span style={{ flex: 1 }}>Class</span><span style={{ flex: 1 }}>Amount</span><span style={{ flex: 1 }}>Date</span><span style={{ width: 44 }} />
        </div>
        {list.map((r, i) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", padding: "9px 16px", fontSize: 13, borderTop: i > 0 ? `1px solid ${THEME.border}` : "none", minWidth: 520 }}>
            <span style={{ flex: 2 }}>{[r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ")}</span>
            <span style={{ flex: 1 }}>{r.form}</span>
            <span style={{ flex: 1 }}>TZS {Number(r.amount || 0).toLocaleString()}</span>
            <span style={{ flex: 1 }}>{r.charge_date?.slice?.(0, 10) || r.charge_date}</span>
            <span style={{ width: 44, textAlign: "right" }}>{actions(r)}</span>
          </div>
        ))}
        {!list.length && <p style={{ padding: 16, fontSize: 13, color: THEME.muted }}>No entries yet.</p>}
      </div>
      )}
      {editing && (
        <EditChargeModal charge={editing} token={token}
          onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function EditChargeModal({ charge, token, onClose, onDone }) {
  const [amount, setAmount] = useState(String(charge.amount ?? ""));
  const [note, setNote] = useState(charge.note || "");
  const [saving, setSaving] = useState(false);
  const name = [charge.first_name, charge.middle_name, charge.last_name].filter(Boolean).join(" ");

  const submit = async () => {
    const n = Number(amount);
    if (!amount || Number.isNaN(n) || n < 0) { showError("Invalid Amount", "Enter a valid, non-negative amount."); return; }
    setSaving(true);
    try {
      await apiFetch(`/contributions/charge/${charge.id}`, { method: "PUT", body: JSON.stringify({ amount: n, note }) }, token);
      showSuccess("Updated", `Payment for ${name} was updated successfully.`);
      onDone();
    } catch (err) { showError("Could Not Update Payment", err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000, padding: 16 }}>
      <div style={{ background: THEME.surface, borderRadius: 4, padding: 22, width: "100%", maxWidth: 360 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15, color: THEME.heading }}>Edit Payment - {name}</h3>
        <p style={{ margin: "0 0 16px", fontSize: 12.5, color: THEME.muted }}>{charge.charge_type} · {charge.charge_date?.slice?.(0, 10) || charge.charge_date}</p>
        <label style={{ fontSize: 12, color: THEME.muted, display: "block", marginBottom: 4 }}>Amount (TZS)</label>
        <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...selectStyle, width: "100%", marginBottom: 12, boxSizing: "border-box" }} autoFocus />
        <label style={{ fontSize: 12, color: THEME.muted, display: "block", marginBottom: 4 }}>Note (optional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} style={{ ...selectStyle, width: "100%", marginBottom: 18, boxSizing: "border-box", resize: "vertical" }} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} disabled={saving} style={btnSecondary}>Cancel</button>
          <button onClick={submit} disabled={saving} style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", gap: 6 }}>{saving ? <SpinnerIcon size={13} /> : null}{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function ClassTeacherView() {
  const { token } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const [subTab, setSubTab] = useState("parttime");
  const tabs = [
    ["parttime", "Part-Time Teachers", CoinsIcon],
    ["daily", "Daily Collections", CalendarIcon],
    ["ream", "Ream(s)", ReamIcon],
    ["students", "Student History", UserHistoryIcon],
  ];
  return (
    <div style={{ padding: isMobile ? "16px 12px" : isTablet ? "24px 20px" : 32 }}>
      <TabBar tabs={tabs} active={subTab} onChange={setSubTab} isCompact={isCompact} />
      {subTab === "parttime" && <ClassTeacherPartTime />}
      {subTab === "daily" && <DailyCollections />}
      {subTab === "ream" && <ClassTeacherReam />}
      {subTab === "students" && <PartTimeStudentHistory token={token} />}
    </div>
  );
}

// Shared by both the class teacher (auto-scoped to their own class) and the
// oversight view (admin/second_master/academic, who may optionally narrow
// to one class) - a date picker defaulting to today, showing exactly who
// paid Part-time Teachers contribution that day and the day's total.
function DailyCollections({ showClassFilter }) {
  const { token } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" });
  const [date, setDate] = useState(todayISO());
  const [form, setForm] = useState("");
  const [rows, setRows] = useState([]);
  const [totalCollected, setTotalCollected] = useState(0);
  const [studentsPaid, setStudentsPaid] = useState(0);
  const [error, setError] = useState("");
  const [noClass, setNoClass] = useState(false);

  const load = useCallback(() => {
    setError(""); setNoClass(false);
    apiFetch(`/contributions/parttime/daily?date=${date}${form ? `&form=${encodeURIComponent(form)}` : ""}`, {}, token)
      .then((d) => {
        setRows(d.data || []);
        setTotalCollected(Number(d.total_collected || 0));
        setStudentsPaid(Number(d.students_paid || 0));
        if (d.message && !d.data?.length) setNoClass(true);
      })
      .catch((err) => setError(err.message));
  }, [token, date, form]);
  useEffect(load, [load]);

  return (
    <div>
      <h2 style={{ color: THEME.heading, fontSize: isMobile ? 16 : 20, marginBottom: 4 }}>Daily Collections</h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 18 }}>Pick a day to see exactly who paid the Part-Time Teachers contribution that day, and the day's total.</p>

      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <StatCard label={`Students Paid (${date})`} value={studentsPaid} color={THEME.success} />
        <StatCard label={`Total Collected (${date})`} value={`TZS ${totalCollected.toLocaleString()}`} color={THEME.link} />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...selectStyle, ...(isMobile ? { flex: 1, minWidth: 150 } : {}) }} />
        {showClassFilter && (
          <select value={form} onChange={(e) => setForm(e.target.value)} style={{ ...selectStyle, ...(isMobile ? { flex: 1, minWidth: 130 } : {}) }}>
            <option value="">All Classes</option>
            {FORMS.map((f) => <option key={f}>{f}</option>)}
          </select>
        )}
      </div>

      {error && <ErrorBox msg={error} />}
      {noClass && <ErrorBox msg="You have no class assigned yet - ask the Head Master to assign your class." />}

      {isCompact ? (
        <div style={cardList}>
          {rows.map((r) => (
            <div key={r.id} className="mk-row-card" style={rowCard}>
              <div style={cardHeadRow}>
                <span style={{ ...cardTitle, color: THEME.text }}>{[r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ")}</span>
                <span style={{ fontSize: 12, color: THEME.muted, fontWeight: 600 }}>{r.form}</span>
              </div>
              <div style={cardField}><span style={cardFieldLabel}>Month Paid For</span><span style={cardFieldValue}>{MONTHS[r.month - 1]} {r.year}</span></div>
              <div style={cardField}><span style={cardFieldLabel}>Amount</span><span style={cardFieldValue}>TZS {Number(r.amount).toLocaleString()}</span></div>
              <div style={cardField}><span style={cardFieldLabel}>Collected By</span><span style={{ ...cardFieldValue, fontWeight: 400 }}>{r.recorded_by_name || "-"}</span></div>
            </div>
          ))}
          {!rows.length && !noClass && <p style={{ fontSize: 13, color: THEME.muted }}>No payments were collected on {date}.</p>}
        </div>
      ) : (
      <div className="table-scroll" style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ display: "flex", padding: "9px 16px", fontSize: 11.5, fontWeight: 700, color: THEME.muted, background: THEME.bg, minWidth: 520 }}>
          <span style={{ flex: 2 }}>Name</span>
          <span style={{ flex: 0.8 }}>Class</span>
          <span style={{ flex: 1 }}>Month Paid For</span>
          <span style={{ flex: 1 }}>Amount</span>
          <span style={{ flex: 1.2 }}>Collected By</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.id} style={{ display: "flex", padding: "9px 16px", fontSize: 13, borderTop: i > 0 ? `1px solid ${THEME.border}` : "none", minWidth: 520 }}>
            <span style={{ flex: 2 }}>{[r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ")}</span>
            <span style={{ flex: 0.8 }}>{r.form}</span>
            <span style={{ flex: 1 }}>{MONTHS[r.month - 1]} {r.year}</span>
            <span style={{ flex: 1 }}>TZS {Number(r.amount).toLocaleString()}</span>
            <span style={{ flex: 1.2, fontSize: 12, color: THEME.muted }}>{r.recorded_by_name || "-"}</span>
          </div>
        ))}
        {!rows.length && !noClass && <p style={{ padding: 16, fontSize: 13, color: THEME.muted }}>No payments were collected on {date}.</p>}
      </div>
      )}
    </div>
  );
}

// Head Master / Second Master: change the Part-Time Teachers monthly amount.
// The new amount starts from a month they choose (this month or later);
// earlier months keep whatever amount applied then, so old receipts and
// history stay correct. Shows the history of past changes.
function EditPartTimeFeeModal({ token, onClose, onDone }) {
  const now = new Date();
  const [amount, setAmount] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [info, setInfo] = useState(null); // { current, rates, min, max }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { confirm, ConfirmDialogPortal } = useConfirm();

  useEffect(() => {
    apiFetch("/contributions/parttime/fee", {}, token)
      .then((d) => { setInfo(d); setAmount(String(d.current)); })
      .catch((e) => setError(e.message));
  }, [token]);

  const submit = (e) => {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isInteger(n) || n < (info?.min || 100) || n > (info?.max || 1000000)) {
      setError(`Amount must be a whole number from TZS ${(info?.min || 100).toLocaleString()} to TZS ${(info?.max || 1000000).toLocaleString()}.`);
      return;
    }
    setError("");
    confirm(`Set the Part-Time Teachers monthly amount to TZS ${n.toLocaleString()}, starting ${MONTHS[month - 1]} ${year}? Earlier months keep their old amount.`, async () => {
      setBusy(true);
      try {
        await apiFetch("/contributions/parttime/fee", { method: "POST", body: JSON.stringify({ amount: n, year, month }) }, token);
        showSuccess("Monthly amount", "The new monthly amount has been saved.");
        onDone();
      } catch (err) { setError(err.message); setBusy(false); }
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000, padding: 16 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: THEME.surface, borderRadius: 6, padding: 22, width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto" }}>
        <h3 style={{ marginTop: 0, marginBottom: 4, color: THEME.heading, fontSize: 16.5 }}>Part-Time Teachers Monthly Amount</h3>
        <p style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 16, lineHeight: 1.5 }}>
          The amount each student pays per month. The new amount starts from the month you choose; months before it keep the old amount, so past records stay correct.
        </p>
        {error && <ErrorBox msg={error} />}
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 5, fontSize: 12.5, fontWeight: 600, color: THEME.text }}>New amount (TZS)
            <input type="number" min={info?.min || 100} max={info?.max || 1000000} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...selectStyle, width: "100%", boxSizing: "border-box" }} autoFocus /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "grid", gap: 5, fontSize: 12.5, fontWeight: 600, color: THEME.text }}>Starting month
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ ...selectStyle, width: "100%" }}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
            <label style={{ display: "grid", gap: 5, fontSize: 12.5, fontWeight: 600, color: THEME.text }}>Year
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...selectStyle, width: "100%" }}>{[now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
          </div>
          {info?.rates?.length > 1 && (
            <div style={{ fontSize: 11.5, color: THEME.muted, background: THEME.bg, borderRadius: 4, padding: "8px 11px" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Past amounts</div>
              {info.rates.slice(0, 5).map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>From {MONTHS[r.month - 1]} {r.year}</span><span>TZS {Number(r.amount).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
            <button type="submit" disabled={busy} style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", gap: 6 }}>{busy && <SpinnerIcon size={13} />}Save</button>
          </div>
        </form>
        {ConfirmDialogPortal}
      </div>
    </div>
  );
}

function ClassTeacherPartTime() {
  const { token, user } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState([]);
  const [fee, setFee] = useState(MONTHLY_FEE);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [noClass, setNoClass] = useState(false);
  const [advanceFor, setAdvanceFor] = useState(null);
  const [installmentFor, setInstallmentFor] = useState(null);
  const { confirm, ConfirmDialogPortal } = useConfirm();

  const load = useCallback(() => {
    setError(""); setNoClass(false);
    apiFetch(`/contributions/parttime?year=${year}&month=${month}`, {}, token)
      .then((d) => {
        setRows(d.data || []);
        if (d.monthly_fee) setFee(Number(d.monthly_fee));
        if (d.message && !d.data?.length) setNoClass(true);
      })
      .catch((err) => setError(err.message));
  }, [token, year, month]);
  useEffect(load, [load]);

  const isHoliday = HOLIDAY_MONTHS.includes(Number(month));
  const filtered = rows.filter((s) => !search.trim() || `${s.first_name} ${s.middle_name || ""} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()));
  const totalCollected = rows.reduce((sum, s) => sum + Number(s.amount_paid || 0), 0);
  const paidCount = rows.filter((s) => s.completed).length;

  const pay = async (studentId, amount, studentName) => {
    try {
      await apiFetch(`/contributions/parttime/${studentId}`, { method: "POST", body: JSON.stringify({ year, month, amount }) }, token);
      showSuccess("Payment", `Payment Successfully Recorded${studentName ? ` for ${studentName}` : ""}.`);
      load();
    } catch (err) { setError(err.message); }
  };

  const payFull = (s) => {
    const already = Number(s.amount_paid || 0);
    const amount = Math.max(fee - already, 0) || fee;
    confirm(`Record TZS ${amount.toLocaleString()} as fully paid for ${[s.first_name, s.last_name].join(" ")} for ${MONTHS[month - 1]} ${year}?`, () => pay(s.student_id, fee, [s.first_name, s.last_name].join(" ")));
  };

  return (
    <div>
      <h2 style={{ color: THEME.heading, fontSize: isMobile ? 16 : 20, marginBottom: 4 }}>Part-Time Teachers Contributions - My Class</h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 18 }}>Collect the TZS {fee.toLocaleString()}/month contribution from your own class only.</p>

      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <StatCard label="Students Paid" value={`${paidCount} / ${rows.length}`} color={THEME.success} />
        <StatCard label={`Total Collected (${MONTHS[month - 1]})`} value={`TZS ${totalCollected.toLocaleString()}`} color={THEME.link} />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ ...selectStyle, ...(isMobile ? { flex: 1, minWidth: 130 } : {}) }}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...selectStyle, ...(isMobile ? { flex: 1, minWidth: 90 } : {}) }}>
          {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <input placeholder="Search student name..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...selectStyle, flex: 1, minWidth: 200 }} />
      </div>

      {error && <ErrorBox msg={error} />}
      {noClass && <ErrorBox msg="You have no class assigned yet - ask the Head Master to assign your class." />}
      {isHoliday && <p style={{ fontSize: 13.5, color: THEME.muted, marginBottom: 12 }}>No contribution is billed in {MONTHS[month - 1]} (school holiday).</p>}

      {!isHoliday && (
        <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4 }}>
          {!isCompact && (
            <div className="table-scroll">
              <div style={{ display: "flex", padding: "9px 16px", fontSize: 11.5, fontWeight: 700, color: THEME.muted, background: THEME.bg, minWidth: 420 }}>
                <span style={{ flex: 2 }}>Name</span><span style={{ flex: 1 }}>Status</span><span style={{ width: 90 }} />
              </div>
            </div>
          )}
          {filtered.map((s, i) => (
            isCompact ? (
              <div key={s.student_id} style={{ padding: "10px 14px", borderTop: i > 0 ? `1px solid ${THEME.border}` : "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, flex: 1 }}>{[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ")}</span>
                  <ActionMenu>
                    {!s.completed && <MenuItem icon={CheckCircleIcon} onClick={() => payFull(s)}>Mark Paid (Full)</MenuItem>}
                    {!s.completed && <MenuItem icon={LayersIcon} onClick={() => setInstallmentFor(s)}>Pay in Installments...</MenuItem>}
                    {!s.completed && <MenuItem icon={CalendarPlusIcon} onClick={() => setAdvanceFor(s)}>Pay Months Ahead...</MenuItem>}
                    {s.contribution_id && <MenuItem icon={ReceiptIcon} onClick={() => openDownload(`/contributions/receipt/parttime/${s.contribution_id}`, token).catch((e) => showError("Receipt", e.message))}>Receipt (PDF)</MenuItem>}
                  </ActionMenu>
                </div>
                <div style={{ marginTop: 6 }}>
                  <StatusPill ok={s.completed}>{s.completed ? "Completed" : s.amount_paid > 0 ? `Partial (TZS ${Number(s.amount_paid).toLocaleString()})` : "Not Paid"}</StatusPill>
                </div>
              </div>
            ) : (
              <div key={s.student_id} style={{ display: "flex", alignItems: "center", padding: "9px 16px", fontSize: 13, borderTop: i > 0 ? `1px solid ${THEME.border}` : "none" }}>
                <span style={{ flex: 2 }}>{[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ")}</span>
                <StatusPill ok={s.completed} style={{ flex: 1 }}>{s.completed ? "Completed" : s.amount_paid > 0 ? `Partial (TZS ${Number(s.amount_paid).toLocaleString()})` : "Not Paid"}</StatusPill>
                <span style={{ width: 90 }}>
                  <ActionMenu>
                    {!s.completed && <MenuItem icon={CheckCircleIcon} onClick={() => payFull(s)}>Mark Paid (Full)</MenuItem>}
                    {!s.completed && <MenuItem icon={LayersIcon} onClick={() => setInstallmentFor(s)}>Pay in Installments...</MenuItem>}
                    {!s.completed && <MenuItem icon={CalendarPlusIcon} onClick={() => setAdvanceFor(s)}>Pay Months Ahead...</MenuItem>}
                    {s.contribution_id && <MenuItem icon={ReceiptIcon} onClick={() => openDownload(`/contributions/receipt/parttime/${s.contribution_id}`, token).catch((e) => showError("Receipt", e.message))}>Receipt (PDF)</MenuItem>}
                  </ActionMenu>
                </span>
              </div>
            )
          ))}
          {!filtered.length && !noClass && <p style={{ padding: 16, fontSize: 13, color: THEME.muted }}>{search ? "No matching student found - they may not be registered." : "No students found for your class."}</p>}
        </div>
      )}
      {ConfirmDialogPortal}
      {advanceFor && (
        <AdvancePaymentModal student={advanceFor} year={year} currentMonth={month} token={token} monthlyFee={fee}
          onClose={() => setAdvanceFor(null)} onDone={() => { setAdvanceFor(null); load(); }} />
      )}
      {installmentFor && (
        <InstallmentPaymentModal student={installmentFor} year={year} month={month} token={token} monthlyFee={fee}
          onClose={() => setInstallmentFor(null)} onDone={() => { setInstallmentFor(null); load(); }} />
      )}
    </div>
  );
}

// Lets a student pay any amount they currently have towards the TZS 2000
// monthly fee (not just the fixed full amount or a whole extra month) -
// they can come back and add more later. The page clears itself after each
// submit, ready for the next entry, and once the running total reaches the
// full fee the backend automatically marks it "completed" - matching
// "Mark Paid (Full)" from then on, with nothing here ever showing
// "installment X of 4" anywhere.
function InstallmentPaymentModal({ student, year, month, token, monthlyFee = MONTHLY_FEE, onClose, onDone }) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm, ConfirmDialogPortal } = useConfirm();
  const name = [student.first_name, student.last_name].filter(Boolean).join(" ");
  const already = Number(student.amount_paid || 0);
  const remaining = Math.max(0, monthlyFee - already);

  const doSubmit = async () => {
    setBusy(true); setError("");
    try {
      await apiFetch(`/contributions/parttime/${student.student_id}`, { method: "POST", body: JSON.stringify({ year, month, amount: Number(amount) }) }, token);
      showSuccess("Payment", `Payment Successfully Recorded for ${name}.`);
      onDone();
    } catch (err) { setError(err.message); setBusy(false); }
  };

  const submit = () => {
    const n = Number(amount);
    if (!amount || isNaN(n) || n <= 0) { setError("Enter a valid amount greater than zero."); return; }
    if (n > remaining) { setError(`This student only has TZS ${remaining.toLocaleString()} remaining for ${MONTHS[month - 1]}.`); return; }
    setError("");
    confirm(`Are you sure you want to record TZS ${n.toLocaleString()} for ${name} (${MONTHS[month - 1]} ${year})?`, doSubmit);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000, padding: 16 }}>
      <div style={{ background: THEME.surface, borderRadius: 4, padding: 22, width: "100%", maxWidth: 400 }}>
        <h3 style={{ marginTop: 0, marginBottom: 6, color: THEME.heading, fontSize: 16 }}>Pay in Installments</h3>
        <p style={{ fontSize: 13, color: THEME.muted, marginBottom: 4 }}>{name} - {MONTHS[month - 1]} {year}</p>
        <p style={{ fontSize: 12, color: THEME.muted, marginBottom: 14 }}>Already paid TZS {already.toLocaleString()} of {monthlyFee.toLocaleString()}. Remaining: TZS {remaining.toLocaleString()}.</p>
        {error && <ErrorBox msg={error} />}
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Amount being paid now (TZS)</label>
        <input type="number" min="1" max={remaining} value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 500" style={{ ...selectStyle, width: "100%", marginBottom: 18, boxSizing: "border-box" }} autoFocus />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.7 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}>{busy ? <SpinnerIcon size={13} /> : null}{busy ? "Saving..." : "Submit"}</button>
        </div>
      </div>
      {ConfirmDialogPortal}
    </div>
  );
}

// Ream is a ONCE-A-YEAR contribution - the class teacher ticks a student off
// as having brought it, confirms "Are you sure?", and it's then permanent
// (the checkbox becomes a locked tick - there is no edit/undo route at all).
function ClassTeacherReam() {
  const { token } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [noClass, setNoClass] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const { confirm, ConfirmDialogPortal } = useConfirm();

  const load = useCallback(() => {
    setError(""); setNoClass(false);
    apiFetch(`/contributions/ream/my-class?year=${year}`, {}, token)
      .then((d) => {
        setRows(d.data || []);
        if (d.message && !d.data?.length) setNoClass(true);
      })
      .catch((err) => setError(err.message));
  }, [token, year]);
  useEffect(load, [load]);

  const filtered = rows.filter((s) => !search.trim() || `${s.first_name} ${s.middle_name || ""} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()));
  const broughtCount = rows.filter((s) => s.ream_charge_id).length;

  const doMark = async (studentId, name) => {
    setBusyId(studentId);
    try {
      const data = await apiFetch(`/contributions/ream/${studentId}`, { method: "POST", body: JSON.stringify({ year }) }, token);
      showSuccess("Ream(s)", data.message || `Submitted successfully - ${name} recorded as having brought Ream(s).`);
      load();
    } catch (err) { setError(err.message); } finally { setBusyId(null); }
  };

  const onCheck = (s) => {
    const name = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");
    confirm(`Are you sure ${name} has brought Ream(s) for ${year}? This cannot be edited once submitted.`, () => doMark(s.student_id, name), { danger: false });
  };

  return (
    <div>
      <h2 style={{ color: THEME.heading, fontSize: isMobile ? 16 : 20, marginBottom: 4 }}>Ream(s) - My Class</h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 18 }}>Tick a student once they've brought Ream(s) for the year. This is once-a-year and cannot be edited after you confirm.</p>

      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <StatCard label={`Brought Ream(s) (${year})`} value={`${broughtCount} / ${rows.length}`} color={THEME.success} />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...selectStyle, ...(isMobile ? { flex: 1, minWidth: 90 } : {}) }}>
          {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <input placeholder="Search student name..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...selectStyle, flex: 1, minWidth: 200 }} />
      </div>

      {error && <ErrorBox msg={error} />}
      {noClass && <ErrorBox msg="You have no class assigned yet - ask the Head Master to assign your class." />}

      {isCompact ? (
        <div style={cardList}>
          {filtered.map((s) => (
            <div key={s.student_id} className="mk-row-card" style={{ ...rowCard, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 13.5 }}>{[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ")}</span>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: THEME.muted, flexShrink: 0 }}>
                {busyId === s.student_id && <SpinnerIcon size={13} />}
                {s.ream_charge_id ? "Brought" : "Mark"}
                <input
                  type="checkbox"
                  checked={!!s.ream_charge_id}
                  disabled={!!s.ream_charge_id || busyId === s.student_id}
                  onChange={() => onCheck(s)}
                  style={{ width: 20, height: 20, cursor: s.ream_charge_id ? "default" : "pointer" }}
                />
              </label>
            </div>
          ))}
          {!filtered.length && !noClass && <p style={{ fontSize: 13, color: THEME.muted }}>{search ? "No matching student found." : "No students found for your class."}</p>}
        </div>
      ) : (
      <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4 }} className="table-scroll">
        <div style={{ display: "flex", alignItems: "center", padding: "9px 16px", fontSize: 11.5, fontWeight: 700, color: THEME.muted, background: THEME.bg, minWidth: 340 }}>
          <span style={{ flex: 2 }}>Name</span><span style={{ width: 130, textAlign: "center" }}>Brought Ream(s)?</span>
        </div>
        {filtered.map((s, i) => (
          <div key={s.student_id} style={{ display: "flex", alignItems: "center", padding: "9px 16px", fontSize: 13, borderTop: i > 0 ? `1px solid ${THEME.border}` : "none", minWidth: 340 }}>
            <span style={{ flex: 2 }}>{[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ")}</span>
            <span style={{ width: 130, textAlign: "center", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {busyId === s.student_id && <SpinnerIcon size={13} />}
              <input
                type="checkbox"
                checked={!!s.ream_charge_id}
                disabled={!!s.ream_charge_id || busyId === s.student_id}
                onChange={() => onCheck(s)}
                style={{ width: 18, height: 18, cursor: s.ream_charge_id ? "default" : "pointer" }}
              />
            </span>
          </div>
        ))}
        {!filtered.length && !noClass && <p style={{ padding: 16, fontSize: 13, color: THEME.muted }}>{search ? "No matching student found." : "No students found for your class."}</p>}
      </div>
      )}
      {ConfirmDialogPortal}
    </div>
  );
}

function AdvancePaymentModal({ student, year, currentMonth, token, monthlyFee = MONTHLY_FEE, onClose, onDone }) {
  const [months, setMonths] = useState([]);
  const [error, setError] = useState("");
  const toggle = (m) => setMonths((p) => p.includes(m) ? p.filter((x) => x !== m) : [...p, m]);
  const futureMonths = MONTHS.map((_, i) => i + 1).filter((m) => m >= currentMonth && !HOLIDAY_MONTHS.includes(m));

  const submit = async () => {
    if (!months.length) { setError("Select at least one month."); return; }
    try {
      const res = await apiFetch(`/contributions/parttime/${student.student_id}/advance`, { method: "POST", body: JSON.stringify({ year, months }) }, token);
      // The server silently skips any month that's already fully paid, so
      // the number of months actually recorded (res.data.length) can be
      // less than what was selected - reflect what really happened rather
      // than assuming every selected month went through.
      const recordedCount = res.data?.length ?? months.length;
      if (recordedCount < months.length) {
        showSuccess("Payment", `Payment Recorded for ${recordedCount} of ${months.length} month(s) - the rest were already fully paid and were skipped.`);
      } else {
        showSuccess("Payment", `Payment Successfully Recorded for ${recordedCount} month${recordedCount > 1 ? "s" : ""}.`);
      }
      onDone();
    } catch (err) { setError(err.message); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000, padding: 16 }}>
      <div style={{ background: THEME.surface, borderRadius: 4, padding: 22, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto" }}>
        <h3 style={{ marginTop: 0, marginBottom: 6, color: THEME.heading, fontSize: 16 }}>Pay Months Ahead</h3>
        <p style={{ fontSize: 13, color: THEME.muted, marginBottom: 14 }}>{[student.first_name, student.last_name].join(" ")} - select every month being paid for now (about TZS {monthlyFee.toLocaleString()} each).</p>
        {error && <ErrorBox msg={error} />}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
          {futureMonths.map((m) => (
            <div key={m} onClick={() => toggle(m)} style={{
              padding: "6px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12.5,
              border: `1px solid ${months.includes(m) ? THEME.navy : THEME.border}`,
              background: months.includes(m) ? THEME.navy : THEME.surface, color: months.includes(m) ? "#fff" : THEME.text,
            }}>{MONTHS[m - 1]}</div>
          ))}
        </div>
        <p style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 14 }}>About TZS {(months.length * monthlyFee).toLocaleString()} for {months.length} month(s)</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
          <button onClick={submit} style={btnPrimary}>Confirm Payment</button>
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ msg }) {
  return <div style={{ marginBottom: 14, padding: 12, borderRadius: 4, fontSize: 13.5, background: THEME.dangerLight, color: THEME.danger }}>{msg}</div>;
}
function StatusPill({ ok, children, style }) {
  return <span style={{ ...style, fontSize: 11.5, fontWeight: 700, color: ok ? THEME.success : THEME.muted }}>{children}</span>;
}
function ActionMenu({ children }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const MENU_WIDTH = 170;
  const itemCount = Array.isArray(children) ? children.filter(Boolean).length : (children ? 1 : 0);

  // Portal-based + flip-aware, same fix as Results Management/User Accounts:
  // a plain CSS position:absolute dropdown inside a flex-wrap card can end
  // up mis-anchored or clipped on Mobile/Tablet once the row wraps onto a
  // narrower screen - measuring the button's real screen position and
  // rendering into a document.body portal avoids that entirely.
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
      if (wrapRef.current && !wrapRef.current.contains(e.target) && !e.target.closest("[data-contribmenu-portal]")) setOpen(false);
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
      <button ref={btnRef} onClick={toggle} style={{
        width: 28, height: 28, borderRadius: 4, border: `1px solid ${THEME.border}`, background: THEME.surface,
        cursor: "pointer", color: THEME.text, display: "flex", alignItems: "center", justifyContent: "center",
      }}><DotsVerticalIcon size={16} /></button>
      {open && createPortal(
        <div data-contribmenu-portal style={{ position: "fixed", top: pos.top, left: pos.left, background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, boxShadow: "0 6px 18px rgba(0,0,0,0.18)", zIndex: 1000, width: MENU_WIDTH, overflow: "hidden" }} onClick={() => setOpen(false)}>
          {children}
        </div>,
        document.body
      )}
    </div>
  );
}
function MenuItem({ onClick, icon: Icon, children }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", padding: "9px 14px", fontSize: 12.5, background: THEME.surface, border: "none", borderTop: `1px solid ${THEME.border}`, cursor: "pointer", color: THEME.text }}>
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
}

const selectStyle = { padding: "8px 12px", border: `1px solid ${THEME.border}`, borderRadius: 4, fontSize: 13 };
const btnPrimary = { padding: "9px 16px", background: THEME.navy, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSecondary = { padding: "9px 16px", background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, cursor: "pointer", fontSize: 13 };
const btnRecord = { padding: "7px 12px", borderRadius: 4, border: `1px solid ${THEME.heading}`, background: THEME.surface, color: THEME.heading, fontSize: 12, fontWeight: 600, cursor: "pointer" };

// Mobile/tablet "row card" - the responsive stand-in for a flex-row table
// column set. Every table in this file that used to force horizontal
// scrolling on a phone (via a fixed minWidth) now switches to a stack of
// these on isMobile/isCompact, so nothing sits off-screen.
const cardList = { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" };
const rowCard = { background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: "12px 14px" };
const cardHeadRow = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 };
const cardTitle = { fontSize: 14, fontWeight: 700, color: THEME.heading };
const cardField = { display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, padding: "3px 0" };
const cardFieldLabel = { color: THEME.muted, flexShrink: 0 };
const cardFieldValue = { color: THEME.text, fontWeight: 600, textAlign: "right" };
const cardChevron = { color: THEME.muted, fontSize: 15 };
