import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { apiFetch, API_BASE } from "../utils/api";
import { getDeviceFingerprint } from "../utils/deviceFingerprint";
import { THEME } from "../styles/theme";
import { PasswordInput } from "../components/PasswordInput";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { showSuccess } from "../components/SuccessModal";
import { ShieldIcon, ClockIcon, CalendarIcon, DownloadIcon, LocationPinIcon, BarChartIcon, SpinnerIcon } from "../components/icons";

// Reads "what hour is it right now in Africa/Dar_es_Salaam" directly via
// Intl.DateTimeFormat, WITHOUT building a locale string and re-parsing it
// back into a Date (i.e. never `new Date(someLocaleString)`). That
// round-trip is not reliably parseable on every browser/WebView a teacher's
// phone might use - on the ones where it silently returns "Invalid Date",
// every .getHours() call on it is also NaN, and `NaN >= x` / `NaN < y` are
// always false in JS. That would leave the "Within the registration window"
// checklist item permanently unchecked with no visible error, blocking a
// teacher from ever marking attendance even when it genuinely is 6-8AM and
// everything else (name, password, GPS) is correct.
function tzHourNow() {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Dar_es_Salaam", hour: "numeric", hourCycle: "h23",
    }).formatToParts(new Date());
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    if (Number.isFinite(hour)) return hour;
  } catch { /* fall through to the manual fallback below */ }
  // Extremely old/unsupported environment fallback (no Intl support at
  // all) - Tanzania is fixed UTC+3 year-round (no DST), so this stays
  // correct without needing Intl.
  return (new Date().getUTCHours() + 3) % 24;
}

// Only Second Master ever sees BOTH "Admin Overview" and "My Attendance"
// (the DualView switch below). Admin sees Admin Overview only - never a
// "My Attendance" tab, since Admin doesn't check in like teaching staff.
// Every other role (teacher, class_teacher, academic, patron, matron, etc.)
// sees only their own "My Attendance" check-in screen, and never the Admin
// Overview - regardless of what other roles they may additionally hold.
export default function TAMS() {
  const { user } = useAuth();
  const myRoles = user.roles && user.roles.length ? user.roles : [user.role];
  if (myRoles.includes("second_master")) return <DualView />;
  if (myRoles.includes("admin")) return <AdminDashboard />;
  return <TeacherCheckIn />;
}

// Someone who both signs their own attendance AND needs to see everyone
// else's (Second Master, or anyone holding two roles like Academic + Matron)
// gets a small switch between the two views instead of only one.
function DualView() {
  const [view, setView] = useState("admin"); // admin | mine
  const { isMobile } = useBreakpoint();
  return (
    <div>
      <div style={{ display: "flex", gap: 8, padding: isMobile ? "16px 14px 0" : "24px 40px 0" }}>
        <button onClick={() => setView("admin")} style={{ ...(view === "admin" ? tabActive : tabInactive), ...(isMobile ? { flex: 1 } : {}), display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><ShieldIcon size={14} />Admin Overview</button>
        <button onClick={() => setView("mine")} style={{ ...(view === "mine" ? tabActive : tabInactive), ...(isMobile ? { flex: 1 } : {}), display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><ClockIcon size={14} />My Attendance</button>
      </div>
      {view === "admin" ? <AdminDashboard /> : <TeacherCheckIn />}
    </div>
  );
}

// ══════════════════ TEACHER VIEW ══════════════════
function TeacherCheckIn() {
  const { token, user } = useAuth();
  const { isMobile } = useBreakpoint();
  const [status, setStatus] = useState("idle"); // idle | locating | submitting | done | error
  const [message, setMessage] = useState("");
  const [needsReason, setNeedsReason] = useState(false);
  const [lateReason, setLateReason] = useState("");
  const [history, setHistory] = useState([]);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [gps, setGps] = useState(null); // null | {lat,lng} | "denied"
  const [distanceM, setDistanceM] = useState(null); // distance (metres) reported by the last check-in attempt
  const [config, setConfig] = useState(null); // {windowOpenHour, windowCloseHour, deadlineHour, deadlineMin, radiusM}
  const [nowTick, setNowTick] = useState(Date.now()); // ticks every 30s so the "Registration window" item stays live

  useEffect(() => {
    apiFetch("/tams/config", {}, token).then(setConfig).catch(() => {});
  }, [token]);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    apiFetch("/tams/my-history", {}, token).then((d) => setHistory(d.history || [])).catch(() => {});
  }, [token]);

  // Try to grab GPS as soon as the page opens, purely so the checklist below
  // can show a live tick - actual submission re-reads GPS fresh anyway.
  // Uses watchPosition (not a single getCurrentPosition) so that if the
  // first attempt fails or times out - e.g. the permission prompt hadn't
  // been answered yet, or the phone was still acquiring a GPS fix - the
  // checklist item still updates the moment a fix comes through, instead
  // of staying stuck on "denied" until the teacher reloads the page.
  const [gpsRetryTick, setGpsRetryTick] = useState(0);
  useEffect(() => {
    if (!navigator.geolocation) { setGps("denied"); return; }
    setGps((g) => (g === "denied" ? null : g)); // back to "checking" while we retry
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGps("denied"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [gpsRetryTick]);

  const nameOk = fullName.trim().replace(/\s+/g, " ").split(" ").length >= 2 &&
    fullName.trim().toLowerCase() === (user.full_name || "").trim().toLowerCase();
  const passwordOk = password.length > 0;
  const gpsOk = gps && gps !== "denied";
  // Recomputed on every render, including the 30s tick from nowTick above,
  // so this checklist item stays live without a full page refresh.
  const windowOk = config ? (() => {
    const hour = tzHourNow();
    return hour >= config.windowOpenHour && hour < config.windowCloseHour;
  })() : true;
  const allChecked = nameOk && passwordOk && gpsOk && windowOk;

  const doCheckIn = () => {
    if (!allChecked) {
      setStatus("error");
      setMessage("Please complete every item on the checklist above before checking in.");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("submitting");
        try {
          const data = await apiFetch("/tams/checkin", {
            method: "POST",
            body: JSON.stringify({
              lat: pos.coords.latitude, lng: pos.coords.longitude,
              deviceFingerprint: getDeviceFingerprint(),
              lateReason: needsReason ? lateReason : undefined,
              fullName, password,
            }),
          }, token);
          setStatus("done");
          setMessage(data.message);
          setDistanceM(data.distanceM ?? null);
          showSuccess("Attendance", `${data.message}${data.distanceM != null ? ` (${data.distanceM}m from school)` : ""}`);
          apiFetch("/tams/my-history", {}, token).then((d) => setHistory(d.history || [])).catch(() => {});
        } catch (err) {
          setStatus("error");
          if (err.message.toLowerCase().includes("reason is required")) setNeedsReason(true);
          setMessage(err.message);
        }
      },
      () => { setStatus("error"); setGps("denied"); setMessage("Could not get GPS - please allow 'Location' access in your browser."); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  return (
    <div style={{ padding: isMobile ? "20px 16px" : 40, maxWidth: 480 }}>
      <h2 style={{ color: THEME.heading, fontSize: isMobile ? 17 : 20, marginBottom: 6 }}>TAMS-TEACHER DASHBOARD</h2>
      <p style={{ color: THEME.muted, fontSize: 13.5, marginBottom: 20 }}>
        Complete the checklist below, then tap "Mark Attendance", between 6:00–8:00 AM.
      </p>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Your full name (as registered in User Accounts):</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. John Peter Mwakasege" style={{
          width: "100%", padding: "10px 12px", border: `1px solid ${THEME.border}`, borderRadius: 0, fontSize: 13.5,
        }} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Your password:</label>
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} style={{ fontSize: 13.5 }} />
      </div>

      <div style={{ marginBottom: 18, background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, padding: "10px 14px" }}>
        <ChecklistItem ok={nameOk} label="Full name matches User Accounts" />
        <ChecklistItem ok={passwordOk} label="Password entered" />
        <ChecklistItem ok={gpsOk} label="GPS location enabled">
          {gps === "denied" && (
            <button
              type="button"
              onClick={() => setGpsRetryTick((t) => t + 1)}
              style={{ marginLeft: 6, fontSize: 12, fontWeight: 600, color: THEME.heading, background: "none", border: "none", textDecoration: "underline", cursor: "pointer", padding: 0 }}
            >
              Jaribu tena
            </button>
          )}
        </ChecklistItem>
        <ChecklistItem ok={windowOk} label="Within the registration window (6:00–8:00 AM)" />
      </div>

      {needsReason && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Reason for being late:</label>
          <input value={lateReason} onChange={(e) => setLateReason(e.target.value.slice(0, 75))} maxLength={75} style={{
            width: "100%", padding: "10px 12px", border: `1px solid ${THEME.border}`, borderRadius: 0, fontSize: 13.5,
          }} />
          <div style={{ fontSize: 11, color: THEME.muted, textAlign: "right", marginTop: 4 }}>{lateReason.length}/75</div>
        </div>
      )}

      <button onClick={doCheckIn} disabled={status === "locating" || status === "submitting"} style={{
        width: "100%", padding: "16px 0", background: THEME.navy, color: "#fff", border: "none",
        borderRadius: 0, fontWeight: 700, fontSize: 15, cursor: "pointer",
        opacity: status === "locating" || status === "submitting" ? 0.7 : 1,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
        {status === "locating" || status === "submitting" ? <SpinnerIcon size={16} /> : <LocationPinIcon size={16} />}
        {status === "locating" ? "Getting your location (GPS)..." : status === "submitting" ? "Submitting..." : "MARK ATTENDANCE"}
      </button>

      {message && (
        <div style={{
          marginTop: 16, padding: 12, borderRadius: 0, fontSize: 13.5,
          background: status === "done" ? THEME.successLight : THEME.dangerLight,
          color: status === "done" ? THEME.success : THEME.danger,
        }}>
          {message}
          {status === "done" && distanceM != null && <span> - you signed in {distanceM}m from school.</span>}
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        <h3 style={{ fontSize: 14, color: THEME.text, marginBottom: 10 }}>Recent History</h3>
        {history.length === 0 ? (
          <p style={{ fontSize: 13, color: THEME.muted }}>No records yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {history.map((h, i) => (
              <div key={i} style={{
                display: "flex", flexWrap: "wrap", gap: 6, rowGap: 4, alignItems: "center", padding: "9px 12px",
                background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, fontSize: 12.5,
              }}>
                <span style={{ minWidth: 70 }}>{h.date}</span>
                <span style={{ minWidth: 60 }}>{h.time_str}</span>
                {h.distance_m != null && <span style={{ color: THEME.muted }}>{h.distance_m}m from school</span>}
                <span style={{ marginLeft: "auto", color: h.is_late ? THEME.warning : THEME.success, fontWeight: 600 }}>
                  {h.is_late ? "Late" : "On Time"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Matches the backend's definition of "today" (Africa/Dar_es_Salaam) exactly.
// Using new Date().toISOString() here would give the UTC date instead, which
// silently disagrees with the server between 00:00-03:00 Tanzania time (UTC+3
// with no DST) - e.g. showing "yesterday" on a dashboard that should say
// "today". daysAgo() subtracts real 24h periods from the current instant
// (not local calendar days), so it's correct regardless of the viewer's own
// device timezone.
const tzDateStr = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam" }).format(date);
const tzDaysAgo = (days) => tzDateStr(new Date(Date.now() - days * 24 * 60 * 60 * 1000));

// ══════════════════ ADMIN / OVERSIGHT VIEW ══════════════════
function AdminDashboard() {
  const { user, token } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const [tab, setTab] = useState("today"); // today | week | month | custom
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [range, setRange] = useState(() => {
    const today = tzDateStr();
    return { from: today, to: today };
  });
  const [customFrom, setCustomFrom] = useState(range.from);
  const [customTo, setCustomTo] = useState(range.to);
  const [historyRows, setHistoryRows] = useState([]);
  const myRoles = user.roles && user.roles.length ? user.roles : [user.role];
  const canExport = myRoles.includes("admin") || myRoles.includes("second_master");

  useEffect(() => {
    let from, to;
    if (tab === "today") {
      from = to = tzDateStr();
    } else if (tab === "week") {
      from = tzDaysAgo(6); to = tzDateStr();
    } else if (tab === "month") {
      from = tzDaysAgo(29); to = tzDateStr();
    } else {
      from = customFrom; to = customTo;
    }
    setRange({ from, to });
  }, [tab, customFrom, customTo]);

  useEffect(() => {
    if (!range.from || !range.to) return;
    setLoading(true);
    setLoadError("");
    if (tab === "today") {
      apiFetch(`/tams/dashboard?date=${range.from}`, {}, token)
        .then((d) => setData(d))
        .catch((err) => { setData(null); setLoadError(err.message || "Failed to load today's attendance."); })
        .finally(() => setLoading(false));
      setHistoryRows([]);
    } else {
      apiFetch(`/tams/history?from=${range.from}&to=${range.to}`, {}, token)
        .then((d) => setHistoryRows(d.records || []))
        .catch((err) => { setHistoryRows([]); setLoadError(err.message || "Failed to load the report."); })
        .finally(() => setLoading(false));
      setData(null);
    }
  }, [range, tab, token]);

  const exportPdf = () => {
    // Today/Week/Month get the plain tab name as the report label, but
    // "Custom" on its own doesn't tell the reader which dates were picked -
    // show the actual chosen range instead.
    const label = tab === "custom" ? `From ${range.from} to ${range.to}` : tab.charAt(0).toUpperCase() + tab.slice(1);
    const url = `${API_BASE}/tams/export-pdf?from=${range.from}&to=${range.to}&label=${encodeURIComponent(label)}`;
    window.open(`${url}&token=${encodeURIComponent(token)}`, "_blank");
  };

  return (
    <div style={{ padding: isMobile ? "20px 14px" : 40 }}>
      <h2 style={{ color: THEME.heading, fontSize: isMobile ? 15.5 : 20, marginBottom: 16 }}>TEACHERS ATTENDANCE MANAGEMENT SYSTEM -TAMS</h2>

      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["today", "week", "month", "custom"].map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ ...(tab === t ? tabActive : tabInactive), ...(isMobile ? { flex: 1 } : {}), display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <CalendarIcon size={13} />{t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        {canExport && (
          <button onClick={exportPdf} style={{ ...tabInactive, marginLeft: isMobile ? 0 : "auto", color: THEME.heading, borderColor: THEME.heading, ...(isMobile ? { width: "100%" } : {}), display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <DownloadIcon size={13} />Export PDF
          </button>
        )}
      </div>

      {loadError && (
        <div style={{
          marginBottom: 20, padding: 12, borderRadius: 0, fontSize: 13.5,
          background: THEME.dangerLight, color: THEME.danger,
        }}>⚠ {loadError}</div>
      )}
      {loading && <p style={{ fontSize: 13, color: THEME.muted, marginBottom: 16, display: "flex", alignItems: "center", gap: 7 }}><SpinnerIcon size={13} /> Loading…</p>}

      {tab === "custom" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 20 }}>
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ ...dateStyle, ...(isMobile ? { flex: 1, minWidth: 140 } : {}) }} />
          <span style={{ color: THEME.muted, fontSize: 13 }}>to</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ ...dateStyle, ...(isMobile ? { flex: 1, minWidth: 140 } : {}) }} />
        </div>
      )}

      {tab === "today" && data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 14, marginBottom: 24 }}>
            <StatCard label="Present" value={data.counts.present} color={THEME.success} />
            <StatCard label="On Time" value={data.counts.onTime} color={THEME.heading} />
            <StatCard label="Late" value={data.counts.late} color={THEME.warning} />
            <StatCard label="Absent" value={data.counts.absent} color={THEME.danger} />
          </div>

          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Present Today</h3>
          {isCompact ? (
            <div style={{ ...cardList, marginBottom: 24 }}>
              {data.present.length === 0 ? <Empty /> : data.present.map((r, i) => (
                <div key={i} className="mk-row-card" style={rowCard}>
                  <div style={cardHeadRow}>
                    <span style={cardTitle}>{r.teacher_name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: r.is_late ? THEME.warning : THEME.success }}>{r.is_late ? "Late" : "On Time"}</span>
                  </div>
                  <div style={cardField}><span style={cardFieldLabel}>Date</span><span style={cardFieldValue}>{r.date}</span></div>
                  <div style={cardField}><span style={cardFieldLabel}>Subject</span><span style={cardFieldValue}>{r.subject || "-"}</span></div>
                  <div style={cardField}><span style={cardFieldLabel}>Time</span><span style={cardFieldValue}>{r.time_str}</span></div>
                  <div style={cardField}><span style={cardFieldLabel}>Distance</span><span style={cardFieldValue}>{r.distance_m != null ? `${r.distance_m} m` : "-"}</span></div>
                  {r.is_late && <div style={cardField}><span style={cardFieldLabel}>Reason</span><span style={{ ...cardFieldValue, fontWeight: 400, fontStyle: "italic" }}>{r.late_reason || "-"}</span></div>}
                </div>
              ))}
            </div>
          ) : (
          <div style={{ overflowX: "auto", marginBottom: 24 }}>
          <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, overflow: "hidden" }}>
            <div style={{ ...rowStyle(-1), fontWeight: 700, background: THEME.bg }}>
              <span style={{ flex: 1 }}>Date</span>
              <span style={{ flex: 2 }}>Teacher</span>
              <span style={{ flex: 1 }}>Subject</span>
              <span style={{ flex: 1 }}>Time</span>
              <span style={{ flex: 1 }}>Status</span>
              <span style={{ flex: 1 }}>Distance</span>
              <span style={{ flex: 2 }}>Reason (if late)</span>
            </div>
            {data.present.length === 0 ? <Empty /> : data.present.map((r, i) => (
              <div key={i} style={rowStyle(i)}>
                <span style={{ flex: 1 }}>{r.date}</span>
                <span style={{ flex: 2 }}>{r.teacher_name}</span>
                <span style={{ flex: 1 }}>{r.subject || "-"}</span>
                <span style={{ flex: 1 }}>{r.time_str}</span>
                <span style={{ flex: 1, color: r.is_late ? THEME.warning : THEME.success, fontWeight: 600 }}>{r.is_late ? "Late" : "On Time"}</span>
                <span style={{ flex: 1 }}>{r.distance_m != null ? `${r.distance_m} m` : "-"}</span>
                <span style={{ flex: 2, color: THEME.muted, fontStyle: "italic" }}>{r.is_late ? (r.late_reason || "-") : ""}</span>
              </div>
            ))}
          </div>
          </div>
          )}

          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Absent Today ({data.absent.length})</h3>
          {isCompact ? (
            <div style={cardList}>
              {data.absent.length === 0 ? <Empty text="Everyone checked in." /> : data.absent.map((t, i) => (
                <div key={i} className="mk-row-card" style={{ ...rowCard, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{t.full_name}</span>
                  <span style={{ fontSize: 12, color: THEME.muted }}>{t.subject || "-"}</span>
                </div>
              ))}
            </div>
          ) : (
          <div style={{ overflowX: "auto" }}>
          <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, overflow: "hidden" }}>
            {data.absent.length === 0 ? <Empty text="Everyone checked in." /> : data.absent.map((t, i) => (
              <div key={i} style={rowStyle(i)}>
                <span style={{ flex: 2 }}>{t.full_name}</span>
                <span style={{ flex: 1 }}>{t.subject || "-"}</span>
              </div>
            ))}
          </div>
          </div>
          )}
        </>
      )}

      {tab !== "today" && (
        <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 14, marginBottom: 24 }}>
          <StatCard label="Present" value={historyRows.length} color={THEME.success} />
          <StatCard label="On Time" value={historyRows.filter((r) => !r.is_late).length} color={THEME.heading} />
          <StatCard label="Late" value={historyRows.filter((r) => r.is_late).length} color={THEME.warning} />
        </div>
        {isCompact ? (
          <div style={cardList}>
            {historyRows.length === 0 ? <Empty /> : historyRows.map((r) => (
              <div key={r.id} className="mk-row-card" style={rowCard}>
                <div style={cardHeadRow}>
                  <span style={cardTitle}>{r.teacher_name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: r.is_late ? THEME.warning : THEME.success }}>{r.is_late ? "Late" : "On Time"}</span>
                </div>
                <div style={cardField}><span style={cardFieldLabel}>Date</span><span style={cardFieldValue}>{r.date}</span></div>
                <div style={cardField}><span style={cardFieldLabel}>Subject</span><span style={cardFieldValue}>{r.subject || "-"}</span></div>
                <div style={cardField}><span style={cardFieldLabel}>Time</span><span style={cardFieldValue}>{r.time_str}</span></div>
                <div style={cardField}><span style={cardFieldLabel}>Distance</span><span style={cardFieldValue}>{r.distance_m != null ? `${r.distance_m} m` : "-"}</span></div>
                {r.is_late && <div style={cardField}><span style={cardFieldLabel}>Reason</span><span style={{ ...cardFieldValue, fontWeight: 400, fontStyle: "italic" }}>{r.late_reason || "-"}</span></div>}
              </div>
            ))}
          </div>
        ) : (
        <div style={{ overflowX: "auto" }}>
        <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, overflow: "hidden" }}>
          <div style={{ ...rowStyle(-1), fontWeight: 700, background: THEME.bg }}>
            <span style={{ flex: 1 }}>Date</span>
            <span style={{ flex: 2 }}>Teacher</span>
            <span style={{ flex: 1 }}>Subject</span>
            <span style={{ flex: 1 }}>Time</span>
            <span style={{ flex: 1 }}>Status</span>
            <span style={{ flex: 1 }}>Distance</span>
            <span style={{ flex: 2 }}>Reason (if late)</span>
          </div>
          {historyRows.length === 0 ? <Empty /> : historyRows.map((r, i) => (
            <div key={r.id} style={rowStyle(i)}>
              <span style={{ flex: 1 }}>{r.date}</span>
              <span style={{ flex: 2 }}>{r.teacher_name}</span>
              <span style={{ flex: 1 }}>{r.subject || "-"}</span>
              <span style={{ flex: 1 }}>{r.time_str}</span>
              <span style={{ flex: 1, color: r.is_late ? THEME.warning : THEME.success, fontWeight: 600 }}>{r.is_late ? "Late" : "On Time"}</span>
              <span style={{ flex: 1 }}>{r.distance_m != null ? `${r.distance_m} m` : "-"}</span>
              <span style={{ flex: 2, color: THEME.muted, fontStyle: "italic" }}>{r.is_late ? (r.late_reason || "-") : ""}</span>
            </div>
          ))}
        </div>
        </div>
        )}
        </>
      )}

      <TeacherMonthlyReport />
    </div>
  );
}

// Shows every teacher's attendance breakdown for a chosen month in one
// table: how many weekdays (Mon–Fri) were in that month ("Working Days"),
// and of those, how many days each teacher was On Time, Late, Present (On
// Time + Late combined - being late still means they were at school that
// day), and Absent - each count paired with its % of the month's working
// days.
function TeacherMonthlyReport() {
  const { token } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const isCompact = isMobile || isTablet;
  const [month, setMonth] = useState(() => tzDateStr().slice(0, 7));
  const [rows, setRows] = useState([]);
  const [workingDays, setWorkingDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    apiFetch(`/tams/monthly-summary?month=${month}`, {}, token)
      .then((d) => {
        setRows(d.summary || []);
        setWorkingDays(d.workingDays || 0);
      })
      .catch((err) => { setRows([]); setWorkingDays(0); setLoadError(err.message || "Failed to load the monthly report."); })
      .finally(() => setLoading(false));
  }, [month, token]);

  return (
    <div style={{ marginTop: 36, paddingTop: 28, borderTop: `1px solid ${THEME.border}` }}>
      <h3 style={{ fontSize: 15, marginBottom: 14, color: THEME.heading, display: "flex", alignItems: "center", gap: 7 }}><BarChartIcon size={15} />Teacher Monthly Report</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 18 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, ...(isMobile ? { flex: 1, minWidth: 140 } : {}) }}>
          <CalendarIcon size={13} />
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...dateStyle, flex: 1 }} />
        </span>
        <span style={{ fontSize: 12.5, color: THEME.muted }}>Working Days this month: <strong style={{ color: THEME.heading }}>{workingDays}</strong> (Mon–Fri only)</span>
      </div>

      {loadError && (
        <div style={{ marginBottom: 20, padding: 12, borderRadius: 0, fontSize: 13.5, background: THEME.dangerLight, color: THEME.danger }}>⚠ {loadError}</div>
      )}
      {loading && <p style={{ fontSize: 13, color: THEME.muted, display: "flex", alignItems: "center", gap: 7 }}><SpinnerIcon size={13} /> Loading…</p>}

      {!loading && !loadError && (isCompact ? (
        <div style={cardList}>
          {rows.length === 0 ? <Empty text="No teachers found." /> : rows.map((r) => (
            <div key={r.teacher_id} className="mk-row-card" style={rowCard}>
              <div style={cardHeadRow}>
                <span style={cardTitle}>{r.full_name}</span>
                <span style={{ fontSize: 11.5, color: THEME.muted }}>{workingDays} working days</span>
              </div>
              <div style={cardField}><span style={cardFieldLabel}>On Time</span><span style={cardFieldValue}>{r.days_on_time} ({r.days_on_time_pct}%)</span></div>
              <div style={cardField}><span style={cardFieldLabel}>Late</span><span style={cardFieldValue}>{r.days_late} ({r.days_late_pct}%)</span></div>
              <div style={cardField}><span style={cardFieldLabel}>Present</span><span style={cardFieldValue}>{r.days_present} ({r.days_present_pct}%)</span></div>
              <div style={cardField}><span style={cardFieldLabel}>Absent</span><span style={cardFieldValue}>{r.days_absent} ({r.days_absent_pct}%)</span></div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, overflow: "hidden", minWidth: 920 }}>
            <div style={{ ...rowStyle(-1), fontWeight: 700, background: THEME.bg }}>
              <span style={{ flex: 2 }}>Teacher</span>
              <span style={{ flex: 1 }}>Working Days</span>
              <span style={{ flex: 1 }}>On Time</span>
              <span style={{ flex: 1 }}>On Time %</span>
              <span style={{ flex: 1 }}>Late</span>
              <span style={{ flex: 1 }}>Late %</span>
              <span style={{ flex: 1 }}>Present</span>
              <span style={{ flex: 1 }}>Present %</span>
              <span style={{ flex: 1 }}>Absent</span>
              <span style={{ flex: 1 }}>Absent %</span>
            </div>
            {rows.length === 0 ? <Empty text="No teachers found." /> : rows.map((r, i) => (
              <div key={r.teacher_id} style={rowStyle(i)}>
                <span style={{ flex: 2, fontWeight: 600 }}>{r.full_name}</span>
                <span style={{ flex: 1 }}>{workingDays}</span>
                <span style={{ flex: 1, color: THEME.heading, fontWeight: 600 }}>{r.days_on_time}</span>
                <span style={{ flex: 1 }}>{r.days_on_time_pct}%</span>
                <span style={{ flex: 1, color: THEME.warning, fontWeight: 600 }}>{r.days_late}</span>
                <span style={{ flex: 1 }}>{r.days_late_pct}%</span>
                <span style={{ flex: 1, color: THEME.success, fontWeight: 600 }}>{r.days_present}</span>
                <span style={{ flex: 1 }}>{r.days_present_pct}%</span>
                <span style={{ flex: 1, color: THEME.danger, fontWeight: 600 }}>{r.days_absent}</span>
                <span style={{ flex: 1 }}>{r.days_absent_pct}%</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChecklistItem({ ok, label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 13 }}>
      <span style={{
        width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        background: ok ? THEME.successLight : "#F1F5F9", color: ok ? THEME.success : "#94A3B8", fontSize: 11, fontWeight: 700, flexShrink: 0,
      }}>{ok ? "✓" : "○"}</span>
      <span style={{ color: ok ? THEME.text : THEME.muted }}>{label}</span>
      {children}
    </div>
  );
}
// Full pale-tinted card (matches Student Management / Timetable / Hostel):
// color-mix() derives a faded fill + border straight from whatever `color`
// resolves to, so it repaints correctly on every theme automatically.
function StatCard({ label, value, color = THEME.navy, sub }) {
  return (
    <div style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, padding: "16px 24px" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 12, color: THEME.muted }}>{label}</div>
      {sub != null && <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function Empty({ text = "None." }) {
  return <div style={{ padding: 16, fontSize: 13, color: THEME.muted }}>{text}</div>;
}
function rowStyle(i) {
  return {
    display: "flex", gap: 12, padding: "9px 14px", fontSize: 12.5,
    borderTop: i > -1 && i > 0 ? `1px solid ${THEME.border}` : (i === 0 ? "none" : `1px solid ${THEME.border}`),
  };
}
const dateStyle = { padding: "8px 12px", border: `1px solid ${THEME.border}`, borderRadius: 0, fontSize: 13 };
const tabActive = { padding: "8px 16px", borderRadius: 0, border: "none", background: THEME.navy, color: "#fff", fontWeight: 600, fontSize: 12.5, cursor: "pointer" };
const tabInactive = { ...tabActive, background: THEME.surface, color: THEME.text, border: `1px solid ${THEME.border}` };

// Mobile/tablet "row card" - the responsive stand-in for the flex-row
// tables above, which used to force a wide minWidth (and therefore
// horizontal scrolling) specifically on phones. Same convention as
// Contributions.jsx / FoodContributions.jsx.
const cardList = { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" };
const rowCard = { background: THEME.surface, border: `1px solid ${THEME.border}`, borderRadius: 0, padding: "12px 14px" };
const cardHeadRow = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 };
const cardTitle = { fontSize: 14, fontWeight: 700, color: THEME.text };
const cardField = { display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, padding: "3px 0" };
const cardFieldLabel = { color: THEME.muted, flexShrink: 0 };
const cardFieldValue = { color: THEME.text, fontWeight: 600, textAlign: "right" };
