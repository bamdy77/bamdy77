// pages/AnalyticsDashboard.jsx
//
// A single command-center view combining the long-term trends different
// roles need to steer the school with, instead of reading one exam or one
// day at a time:
//   1. Results trend - a form's overall pass-rate/GPA across MANY exam
//      periods, and (optionally) one subject drilled down - e.g. "does
//      Form II keep dropping in Physics every year?" (Head Master / Second
//      Master only, per spec.)
//   2. One student's trend - is THIS student rising or falling term after
//      term, drilled down per subject, with GPA and Division plotted,
//      plus a simple trend-based GPA estimate. (Head Master, Second
//      Master, Academic Master, and Teacher. A Teacher only sees the
//      subjects they teach, per their subject_ids in User Accounts - the
//      only section of this page a Teacher or Academic Master can see.)
//   3. TAMS attendance trend - teacher attendance % across many months,
//      not just a single day's report. (Head Master / Second Master only.)
// Every endpoint this page calls is already gated server-side to the roles
// noted above - this page is an ADDITIONAL, not the only, layer of
// protection (see ProtectedRoute in App.jsx).
import { useState, useEffect, useCallback, useRef } from "react";
import VisitorStats from "../components/VisitorStats";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../utils/api";
import { THEME } from "../styles/theme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import TrendChart from "../components/TrendChart";
import {
  BarChartIcon, ClockIcon, TrendingUpIcon, TrendingDownIcon, TrendingFlatIcon,
  SpinnerIcon, SchoolIcon, UsersIcon, SearchIcon, PersonSilhouetteIcon, InfoIcon,
} from "../components/icons";

// Short chart label. Month included - "Monthly 2026" alone was identical for
// every monthly test of the year, so the points could not be told apart.
const periodLabel = (r) => `${String(r.exam_type || "").split(" ")[0]} ${String(r.month || "").slice(0, 3)} ${r.year}`.replace(/\s+/g, " ").trim();

const FORMS = ["Form I", "Form II", "Form III", "Form IV"];
// Mirrors backend DIVISION_RANK (resultsController.js) so the Division
// chart can plot a category on a numeric axis and label it back correctly.
const DIVISION_LABELS = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "0" };

export default function AnalyticsDashboard() {
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const { user } = useAuth();
  const roles = user?.roles || [user?.role].filter(Boolean);
  // The two school-wide sections stay Head Master / Second Master only -
  // an Academic Master or Teacher reaching this page (for the per-student
  // panel) never sees them, rather than the frontend quietly relying on
  // the backend 403 to hide them.
  const canSeeSchoolWide = roles.includes("admin") || roles.includes("second_master");

  return (
    <div style={{ padding: isMobile ? "16px 12px" : isTablet ? "24px 20px" : 40 }}>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ color: THEME.heading, fontSize: isMobile ? 16 : 20, margin: 0, display: "flex", alignItems: "center", gap: 9 }}>
          <BarChartIcon size={19} />Analytics Dashboard
        </h2>
        <p style={{ color: THEME.muted, fontSize: 12.5, marginTop: 5 }}>
          {canSeeSchoolWide
            ? "School-wide trends across multiple exam periods and months, plus one student at a time."
            : "Track whether one student is rising or falling across exam periods."}
        </p>
      </div>

      {canSeeSchoolWide && (
        <>
          <VisitorStats isCompact={isCompact} />
          <div style={{ height: 1, background: THEME.border, margin: "32px 0" }} />
          <ResultsTrendSection isCompact={isCompact} />
          <div style={{ height: 1, background: THEME.border, margin: "32px 0" }} />
        </>
      )}
      <StudentTrendSection isCompact={isCompact} />
      {canSeeSchoolWide && (
        <>
          <div style={{ height: 1, background: THEME.border, margin: "32px 0" }} />
          <AttendanceTrendSection isCompact={isCompact} />
        </>
      )}
    </div>
  );
}

// ══════════════════ RESULTS TREND ══════════════════
function ResultsTrendSection({ isCompact }) {
  const { token } = useAuth();
  const [form, setForm] = useState(FORMS[0]);
  const [subjectId, setSubjectId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Only the newest request may update the screen - switching Form quickly
  // used to let a slow, older response overwrite the newer Form's charts.
  const reqId = useRef(0);
  const load = useCallback((f, sid) => {
    const id = ++reqId.current;
    setLoading(true); setLoadError("");
    const qs = sid ? `?form=${encodeURIComponent(f)}&subject_id=${sid}` : `?form=${encodeURIComponent(f)}`;
    apiFetch(`/results-mgmt/analytics${qs}`, {}, token)
      .then((d) => {
        if (id !== reqId.current) return;
        setData(d);
        // Auto-pick the first subject with history the first time a form
        // loads, so the drill-down chart isn't empty by default.
        if (!sid && d.subjects && d.subjects.length) setSubjectId(String(d.subjects[0].id));
      })
      .catch((err) => { if (id !== reqId.current) return; setData(null); setLoadError(err.message || "Failed to load results analytics."); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, [token]);

  useEffect(() => { load(form, ""); setSubjectId(""); /* eslint-disable-next-line */ }, [form, token]);
  useEffect(() => { if (subjectId) load(form, subjectId); /* eslint-disable-next-line */ }, [subjectId]);

  return (
    <section>
      <h3 style={{ fontSize: 15, color: THEME.heading, marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>
        <SchoolIcon size={15} />Results Trend - Across Exam Periods
      </h3>
      <p style={{ fontSize: 12, color: THEME.muted, marginBottom: 16 }}>
        Tracks whether a class or subject is improving or declining term after term - not just one exam in isolation.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        <Field label="Form">
          <select value={form} onChange={(e) => setForm(e.target.value)} style={selectStyle}>
            {FORMS.map((f) => <option key={f}>{f}</option>)}
          </select>
        </Field>
        <Field label="Subject (drill-down)">
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={selectStyle} disabled={!data || !data.subjects || !data.subjects.length}>
            {(!data || !data.subjects || !data.subjects.length) && <option value="">No subject history yet</option>}
            {data && data.subjects && data.subjects.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
          </select>
        </Field>
      </div>

      {loadError && <div style={errorBox}>⚠ {loadError}</div>}
      {loading && <p style={loadingText}><SpinnerIcon size={13} /> Loading…</p>}

      {!loading && !loadError && data && (
        <>
          {/* Overall form trend */}
          <ChartCard
            title={`${form} - Overall Pass Rate`}
            direction={data.overallTrendDirection?.pass_pct}
            directionGoodWhen="improving"
          >
            <TrendChart
              points={(data.overallTrend || []).map((r) => ({ label: periodLabel(r), value: r.pass_pct }))}
              valueSuffix="%" higherIsBetter
              emptyText="No compiled results yet for this form - pass rate trend will appear once at least two exam periods have included results."
            />
          </ChartCard>

          <ChartCard
            title={`${form} - Overall School GPA`}
            sub="Lower GPA = better performance (1.0 is the best possible average)."
            direction={data.overallTrendDirection?.school_gpa}
            directionGoodWhen="improving"
          >
            <TrendChart
              points={(data.overallTrend || []).map((r) => ({ label: periodLabel(r), value: r.school_gpa }))}
              higherIsBetter={false}
              emptyText="No compiled GPA data yet for this form."
            />
          </ChartCard>

          {/* Subject drill-down */}
          {subjectId && data.subjectMeta && (
            <>
              <ChartCard
                title={`${data.subjectMeta.name} (${data.subjectMeta.code}) - Pass Rate in ${form}`}
                direction={data.subjectTrendDirection?.pass_pct}
                directionGoodWhen="improving"
              >
                <TrendChart
                  points={(data.subjectTrend || []).map((r) => ({ label: periodLabel(r), value: r.pass_pct }))}
                  valueSuffix="%" higherIsBetter
                  emptyText={`Not enough exam history for ${data.subjectMeta.name} in ${form} yet.`}
                />
              </ChartCard>
              <ChartCard
                title={`${data.subjectMeta.name} (${data.subjectMeta.code}) - GPA in ${form}`}
                sub="Lower GPA = better performance."
                direction={data.subjectTrendDirection?.gpa}
                directionGoodWhen="improving"
              >
                <TrendChart
                  points={(data.subjectTrend || []).map((r) => ({ label: periodLabel(r), value: r.gpa }))}
                  higherIsBetter={false}
                  emptyText={`Not enough exam history for ${data.subjectMeta.name} in ${form} yet.`}
                />
              </ChartCard>
            </>
          )}
        </>
      )}
    </section>
  );
}

// ══════════════════ TAMS ATTENDANCE TREND ══════════════════
function AttendanceTrendSection() {
  const { token } = useAuth();
  const [months, setMonths] = useState(6);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    setLoading(true); setLoadError("");
    apiFetch(`/tams/attendance-trend?months=${months}`, {}, token)
      .then(setData)
      .catch((err) => { setData(null); setLoadError(err.message || "Failed to load the attendance trend."); })
      .finally(() => setLoading(false));
  }, [months, token]);

  return (
    <section>
      <h3 style={{ fontSize: 15, color: THEME.heading, marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>
        <ClockIcon size={15} />TAMS - Long-Term Teacher Attendance Trend
      </h3>
      <p style={{ fontSize: 12, color: THEME.muted, marginBottom: 16 }}>
        Attendance % across several months - not just a single day's report - so a slipping pattern is visible early.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {[3, 6, 12, 24].map((m) => (
          <button key={m} onClick={() => setMonths(m)} style={m === months ? tabActive : tabInactive}>
            Last {m} months
          </button>
        ))}
      </div>

      {loadError && <div style={errorBox}>⚠ {loadError}</div>}
      {loading && <p style={loadingText}><SpinnerIcon size={13} /> Loading…</p>}

      {!loading && !loadError && data && (
        <>
          <ChartCard
            title="School-Wide Attendance Rate"
            direction={data.presentTrendDirection}
            directionGoodWhen="improving"
          >
            <TrendChart
              points={(data.months || []).map((m) => ({ label: m.month, value: m.presentPct }))}
              valueSuffix="%" higherIsBetter
              emptyText="Not enough monthly attendance history yet."
            />
          </ChartCard>

          <div style={{ overflowX: "auto" }}>
            <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, overflow: "hidden", minWidth: 640 }}>
              <div style={{ ...rowStyle, fontWeight: 700, background: THEME.bg }}>
                <span style={{ flex: 1.2 }}>Month</span>
                <span style={{ flex: 1 }}>Teachers</span>
                <span style={{ flex: 1 }}>Present %</span>
                <span style={{ flex: 1 }}>On Time %</span>
                <span style={{ flex: 1 }}>Late %</span>
                <span style={{ flex: 1 }}>Absent %</span>
              </div>
              {(data.months || []).map((m, i) => (
                <div key={m.month} style={{ ...rowStyle, borderTop: i === 0 ? "none" : `1px solid ${THEME.border}` }}>
                  <span style={{ flex: 1.2, fontWeight: 600 }}>{m.month}</span>
                  <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 5 }}><UsersIcon size={12} />{m.teacherCount ?? "-"}</span>
                  <span style={{ flex: 1, color: THEME.success, fontWeight: 600 }}>{m.presentPct != null ? `${m.presentPct}%` : "-"}</span>
                  <span style={{ flex: 1 }}>{m.onTimePct != null ? `${m.onTimePct}%` : "-"}</span>
                  <span style={{ flex: 1, color: THEME.warning }}>{m.latePct != null ? `${m.latePct}%` : "-"}</span>
                  <span style={{ flex: 1, color: THEME.danger }}>{m.absentPct != null ? `${m.absentPct}%` : "-"}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// ══════════════════ ONE STUDENT'S TREND ══════════════════
// Admin, Second Master, Academic Master, AND Teacher - the only section of
// this page a Teacher or Academic Master can see. A Teacher's subject
// picker is scoped server-side to only the subjects they teach.
function StudentTrendSection() {
  const { token } = useAuth();
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);
  const [student, setStudent] = useState(null);
  const [subjectId, setSubjectId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  // Same guard as the Academic Master's student-result search elsewhere in
  // the app (ResultsManagement.jsx) - picking a student clears the search
  // box, but that clear is itself a change to `search`, which would
  // otherwise immediately re-trigger the search effect below and wipe out
  // the student just picked.
  const justPickedRef = useRef(false);
  const reqId = useRef(0); // newest student-trend request wins

  useEffect(() => {
    if (justPickedRef.current) { justPickedRef.current = false; return; }
    setStudent(null); setData(null); reqId.current++; setLoading(false);
    if (!search.trim()) { setMatches([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      apiFetch(`/students?search=${encodeURIComponent(search.trim())}`, {}, token)
        .then((res) => setMatches((res.data || []).slice(0, 8)))
        .catch(() => setMatches([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(t);
  }, [search, token]);

  const load = useCallback((studentId, subId) => {
    const id = ++reqId.current;
    setLoading(true); setLoadError("");
    const qs = subId ? `?student_id=${studentId}&subject_id=${subId}` : `?student_id=${studentId}`;
    apiFetch(`/results-mgmt/student-trend${qs}`, {}, token)
      .then((d) => {
        if (id !== reqId.current) return;
        setData(d);
        if (!subId && d.subjects && d.subjects.length) setSubjectId(String(d.subjects[0].id));
      })
      .catch((err) => { if (id !== reqId.current) return; setData(null); setLoadError(err.message || "Failed to load this student's trend."); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, [token]);

  const pickStudent = (s) => {
    justPickedRef.current = true;
    setStudent(s); setMatches([]); setSearch(""); setSubjectId(""); setData(null); setLoadError("");
    load(s.id, "");
  };

  useEffect(() => { if (student && subjectId) load(student.id, subjectId); /* eslint-disable-next-line */ }, [subjectId]);

  return (
    <section>
      <h3 style={{ fontSize: 15, color: THEME.heading, marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>
        <PersonSilhouetteIcon size={15} />One Student - Rising or Falling?
      </h3>
      <p style={{ fontSize: 12, color: THEME.muted, marginBottom: 16 }}>
        A form-wide average can look stable while one student quietly slips. Search for a student to see their own GPA across every exam period, not just their most recent result.
      </p>

      <div style={{ position: "relative", maxWidth: 380, marginBottom: student ? 18 : 8 }}>
        <Field label="Search by name or reg. no.">
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: THEME.muted, display: "flex" }}>
              <SearchIcon size={13} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. Juma Ally, or a registration number"
              style={{ ...selectStyle, width: "100%", paddingLeft: 28, boxSizing: "border-box" }}
            />
          </div>
        </Field>
        {searching && <div style={{ ...loadingText, marginBottom: 0, marginTop: 4 }}><SpinnerIcon size={12} /> Searching…</div>}
        {matches.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 5,
            background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4,
            maxHeight: 240, overflowY: "auto", boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
          }}>
            {matches.map((m) => (
              <div
                key={m.id}
                onClick={() => pickStudent(m)}
                style={{ padding: "9px 12px", cursor: "pointer", fontSize: 13, borderBottom: `1px solid ${THEME.border}` }}
              >
                <div style={{ fontWeight: 600, color: THEME.text }}>
                  {[m.first_name, m.middle_name, m.last_name].filter(Boolean).join(" ")}
                </div>
                <div style={{ fontSize: 11, color: THEME.muted }}>{m.form || "-"} · {m.reg_no || "No reg. no. yet"}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!student && !loading && (
        <p style={{ fontSize: 12.5, color: THEME.muted }}>Search above to get started - no student is selected yet.</p>
      )}

      {student && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <PersonSilhouetteIcon size={20} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: THEME.heading }}>
              {[student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ")}
            </div>
            <div style={{ fontSize: 11.5, color: THEME.muted }}>{student.form || "-"} · {student.reg_no || "No reg. no. yet"}</div>
          </div>
        </div>
      )}

      {loadError && <div style={errorBox}>⚠ {loadError}</div>}
      {loading && <p style={loadingText}><SpinnerIcon size={13} /> Loading…</p>}

      {!loading && !loadError && student && data && (
        <>
          <ChartCard
            title={`${student.first_name} - Division Across Exam Periods`}
            sub="Division I is the best result, Division 0 the weakest."
            direction={data.divisionTrendDirection}
            directionGoodWhen="improving"
          >
            <TrendChart
              points={(data.overallTrend || []).map((r) => ({ label: periodLabel(r), value: r.division_rank }))}
              higherIsBetter={false}
              valueFormatter={(v) => DIVISION_LABELS[Math.round(v)] || v}
              emptyText="No division history yet for this student."
            />
          </ChartCard>

          <ChartCard
            title={`${student.first_name} - GPA Across Exam Periods`}
            sub="Lower GPA = better performance (1.0 is the best possible average)."
            direction={data.overallTrendDirection}
            directionGoodWhen="improving"
          >
            <TrendChart
              points={(data.overallTrend || []).map((r) => ({ label: periodLabel(r), value: r.gpa }))}
              higherIsBetter={false}
              emptyText="No result history yet for this student."
            />
          </ChartCard>

          <GpaProjection projection={data.projection} />

          <div style={{ overflowX: "auto", marginBottom: 18 }}>
            <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, overflow: "hidden", minWidth: 520 }}>
              <div style={{ ...rowStyle, fontWeight: 700, background: THEME.bg }}>
                <span style={{ flex: 1.3 }}>Period</span>
                <span style={{ flex: 0.8 }}>Form</span>
                <span style={{ flex: 0.8 }}>Division</span>
                <span style={{ flex: 1 }}>Position</span>
                <span style={{ flex: 0.7 }}>GPA</span>
              </div>
              {(data.overallTrend || []).map((r, i) => (
                <div key={r.sheet_id} style={{ ...rowStyle, borderTop: i === 0 ? "none" : `1px solid ${THEME.border}` }}>
                  <span style={{ flex: 1.3, fontWeight: 600 }}>{r.label}</span>
                  <span style={{ flex: 0.8 }}>{r.form}</span>
                  <span style={{ flex: 0.8 }}>{r.division || "-"}</span>
                  <span style={{ flex: 1 }}>{r.position ? `${r.position} of ${r.total_students}` : "-"}</span>
                  <span style={{ flex: 0.7 }}>{r.gpa ?? "-"}</span>
                </div>
              ))}
              {!(data.overallTrend || []).length && (
                <div style={{ ...rowStyle, color: THEME.muted }}>No exam periods with a compiled result yet.</div>
              )}
            </div>
          </div>

          <Field label="Subject (drill-down)">
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              style={selectStyle}
              disabled={!data.subjects || !data.subjects.length}
            >
              {(!data.subjects || !data.subjects.length) && <option value="">No subject history yet</option>}
              {data.subjects && data.subjects.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
            </select>
          </Field>

          {subjectId && data.subjectMeta && (
            <ChartCard
              title={`${data.subjectMeta.name} (${data.subjectMeta.code}) - Marks Across Exam Periods`}
              direction={data.subjectTrendDirection}
              directionGoodWhen="improving"
            >
              <TrendChart
                points={(data.subjectTrend || []).map((r) => ({ label: periodLabel(r), value: r.marks }))}
                higherIsBetter
                emptyText={`Not enough exam history for ${data.subjectMeta.name} yet.`}
              />
            </ChartCard>
          )}
        </>
      )}
    </section>
  );
}

// Trend-LINE projection, not a machine-learning prediction - deliberately
// framed as a rough estimate throughout (never "will pass/fail"), and only
// shown once there's enough history to make a trend line meaningful at all.
function GpaProjection({ projection }) {
  if (!projection) return null;
  if (projection.reason === "insufficient_data" || projection.predicted_gpa == null) {
    return (
      <div style={{ ...errorBox, background: "#F1F5F9", color: THEME.muted, marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}>
        <InfoIcon size={14} />
        Not enough exam periods yet (at least 3 are needed) to estimate a trend - this will appear automatically once there's more history.
      </div>
    );
  }
  const pointsTowardImprovement = projection.slope < 0; // GPA: lower = better
  return (
    <div style={{ background: THEME.surface, border: `1px dashed ${THEME.border}`, borderRadius: 4, padding: 14, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <InfoIcon size={14} />
        <span style={{ fontWeight: 700, fontSize: 13, color: THEME.heading }}>Estimated next-period GPA: {projection.predicted_gpa}</span>
      </div>
      <div style={{ fontSize: 11.5, color: THEME.muted, lineHeight: 1.5 }}>
        A rough estimate from the trend line so far - <strong>not a guarantee</strong>. The trend so far points toward {pointsTowardImprovement ? "improvement" : "decline"}. Treat this as an early signal to check in with the student, not as a final verdict.
      </div>
    </div>
  );
}

// ══════════════════ shared bits ══════════════════
function ChartCard({ title, sub, direction, directionGoodWhen = "improving", children }) {
  return (
    <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 4, padding: 16, marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: THEME.text }}>{title}</div>
          {sub && <div style={{ fontSize: 11, color: THEME.muted, marginTop: 2 }}>{sub}</div>}
        </div>
        <TrendBadge direction={direction} goodWhen={directionGoodWhen} />
      </div>
      {children}
    </div>
  );
}

function TrendBadge({ direction, goodWhen = "improving" }) {
  if (!direction || direction === "insufficient_data") {
    return <span style={{ ...badge, background: THEME.bg, color: THEME.muted, border: `1px solid ${THEME.border}` }}><TrendingFlatIcon size={12} />Not enough data yet</span>;
  }
  if (direction === "stable") {
    return <span style={{ ...badge, background: THEME.bg, color: THEME.muted, border: `1px solid ${THEME.border}` }}><TrendingFlatIcon size={12} />Stable</span>;
  }
  const isGood = direction === goodWhen;
  const Icon = direction === "improving" ? TrendingUpIcon : TrendingDownIcon;
  return (
    <span style={{ ...badge, background: isGood ? THEME.successLight : THEME.dangerLight, color: isGood ? THEME.success : THEME.danger }}>
      <Icon size={12} />{direction === "improving" ? "Improving" : "Declining"}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: THEME.muted, minWidth: 170 }}>
      {label}
      {children}
    </label>
  );
}

const selectStyle = { padding: "8px 10px", border: `1px solid ${THEME.border}`, borderRadius: 4, fontSize: 13, background: THEME.surface, color: THEME.text };
const errorBox = { marginBottom: 18, padding: 12, borderRadius: 4, fontSize: 13.5, background: THEME.dangerLight, color: THEME.danger };
const loadingText = { fontSize: 13, color: THEME.muted, marginBottom: 16, display: "flex", alignItems: "center", gap: 7 };
const rowStyle = { display: "flex", gap: 12, padding: "9px 14px", fontSize: 12.5 };
const badge = { display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 4, fontSize: 11.5, fontWeight: 700 };
const tabActive = { padding: "8px 16px", borderRadius: 4, border: "none", background: THEME.navy, color: "#fff", fontWeight: 600, fontSize: 12.5, cursor: "pointer" };
const tabInactive = { ...tabActive, background: THEME.surface, color: THEME.text, border: `1px solid ${THEME.border}` };
