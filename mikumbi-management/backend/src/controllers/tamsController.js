const { query } = require("../db/db");
const bcrypt = require("bcryptjs");

// ── CONFIG - override any of these via backend/.env without touching code ──
const CONFIG = {
  SCHOOL_LAT: Number(process.env.TAMS_SCHOOL_LAT) || -10.561915,
  SCHOOL_LNG: Number(process.env.TAMS_SCHOOL_LNG) || 39.178560,
  SCHOOL_RADIUS_M: Number(process.env.TAMS_SCHOOL_RADIUS_M) || 50,
  DEADLINE_HOUR: Number(process.env.TAMS_DEADLINE_HOUR) || 7,
  DEADLINE_MIN: Number(process.env.TAMS_DEADLINE_MIN) || 30,
  WINDOW_OPEN_HOUR: Number(process.env.TAMS_WINDOW_OPEN_HOUR) || 6,
  WINDOW_CLOSE_HOUR: Number(process.env.TAMS_WINDOW_CLOSE_HOUR) || 8,
};

// ── Helpers (unchanged formulas from the original TAMS project) ────────────
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getTanzaniaTime() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Dar_es_Salaam" }));
}

// node-postgres returns DATE columns as a JS Date object at LOCAL midnight
// (using this process's TZ, set to Africa/Dar_es_Salaam in index.js) - not
// as the plain 'YYYY-MM-DD' string that was stored. Left as-is, that Date
// object causes two visible bugs wherever a record's `date` reaches the
// teacher/admin: (1) JSON responses (my-history, dashboard, history) send
// `date.toISOString()`, e.g. "2026-07-21T21:00:00.000Z" - a full UTC
// timestamp that also reads as the WRONG calendar day, since Tanzania is
// UTC+3 and midnight there is 21:00 the previous day in UTC; (2) the PDF
// export's String(date) prints the whole verbose form, e.g. "Wed Jul 22
// 2026 00:00:00 GMT+0300 (East Africa Time)", which overflows the narrow
// "Date" column. Using the LOCAL getters (not the UTC ones) below recovers
// the original 'YYYY-MM-DD' exactly, since the Date object was built from
// those same local components.
function dateOnly(d) {
  if (!d) return d;
  if (typeof d === "string") return d; // already a plain string - nothing to fix
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isLate(now) {
  const deadline = new Date(now);
  deadline.setHours(CONFIG.DEADLINE_HOUR, CONFIG.DEADLINE_MIN, 0, 0);
  return now > deadline;
}

function isWithinWindow(now) {
  const start = new Date(now); start.setHours(CONFIG.WINDOW_OPEN_HOUR, 0, 0, 0);
  const close = new Date(now); close.setHours(CONFIG.WINDOW_CLOSE_HOUR, 0, 0, 0);
  return now >= start && now < close;
}

function getTodayDate(now) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

// ── POST /api/tams/checkin ──────────────────────────────────────────────
// Teacher must already be logged in (unified auth) - no re-typing name and
// password every morning like the original standalone TAMS. GPS distance,
// the 6:00–8:00 window, the 7:30 late cutoff, device-fingerprint one-per-day
// rule, and duplicate-check are all unchanged.
const checkin = async (req, res, next) => {
  try {
    const { deviceFingerprint, lateReason, fullName, password } = req.body;
    if (!fullName || !fullName.trim())
      return res.status(400).json({ success: false, message: "Please type your full name as registered." });
    if (!password)
      return res.status(400).json({ success: false, message: "Please enter your password to confirm it is really you." });
    // Validate lat/lng as real, finite numbers rather than just checking
    // truthiness - `!lat` would wrongly reject a legitimate 0 reading, and
    // without this check, garbage/non-numeric input turns into NaN inside
    // haversineDistance() below, and `NaN > CONFIG.SCHOOL_RADIUS_M` is
    // always false in JavaScript - silently skipping the "too far from
    // school" rejection entirely instead of blocking bad GPS data.
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    if (req.body.lat === undefined || req.body.lat === null || req.body.lng === undefined || req.body.lng === null ||
        !Number.isFinite(lat) || !Number.isFinite(lng))
      return res.status(400).json({ success: false, message: "GPS is required. Please enable location and try again." });

    // Confirm the logged-in user typed their OWN name (as registered in User
    // Accounts) and their OWN password - this stops one teacher signing in
    // for another on a shared/borrowed phone, even though they're already
    // authenticated via the app session.
    const uResult = await query("SELECT id, username, full_name, role, password FROM users WHERE id = $1", [req.user.id]);
    const account = uResult.rows[0];
    if (!account)
      return res.status(400).json({ success: false, message: "Account not found." });
    const normalize = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();
    if (normalize(fullName) !== normalize(account.full_name))
      return res.status(400).json({ success: false, message: "The name you typed does not match your registered name." });
    const passOk = await bcrypt.compare(password, account.password);
    if (!passOk)
      return res.status(401).json({ success: false, message: "Incorrect password." });
    // The Head Master's account name is intentionally just the placeholder
    // "admin" (not a real name) - everywhere TAMS records/shows WHO checked
    // in, use the username instead so it's actually identifiable.
    const displayName = account.role === "admin" ? account.username : account.full_name;

    const now = getTanzaniaTime();
    if (!isWithinWindow(now)) {
      const start = new Date(now); start.setHours(CONFIG.WINDOW_OPEN_HOUR, 0, 0, 0);
      const msg = now < start
        ? `Registration not yet open. Opens at ${CONFIG.WINDOW_OPEN_HOUR}:00 AM.`
        : `Registration closed for today. Attendance window closes at ${CONFIG.WINDOW_CLOSE_HOUR}:00 AM.`;
      return res.status(403).json({ success: false, message: msg });
    }

    const distance = haversineDistance(lat, lng, CONFIG.SCHOOL_LAT, CONFIG.SCHOOL_LNG);
    if (distance > CONFIG.SCHOOL_RADIUS_M)
      return res.status(403).json({
        success: false,
        message: `You are ${Math.round(distance)}m from school. Must be within ${CONFIG.SCHOOL_RADIUS_M}m.`,
      });

    // Resolve the logged-in user's teacher record.
    const tResult = await query("SELECT * FROM teachers WHERE user_id = $1 AND is_active = true", [req.user.id]);
    const teacher = tResult.rows[0];
    if (!teacher)
      return res.status(400).json({ success: false, message: "No teacher record is linked to this account. Contact the Head Master." });

    const late = isLate(now);
    if (late && !lateReason)
      return res.status(400).json({ success: false, message: "You are arriving after 7:30 AM - a reason is required." });
    if (late && lateReason && lateReason.length > 75)
      return res.status(400).json({ success: false, message: "Reason for being late must be 75 characters or fewer." });

    const today = getTodayDate(now);
    const timeStr = formatTime(now);
    const clientIP = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";

    if (deviceFingerprint) {
      const devCheck = await query(
        "SELECT teacher_id, teacher_name FROM tams_device_registrations WHERE device_fingerprint=$1",
        [deviceFingerprint]
      );
      if (devCheck.rows[0] && Number(devCheck.rows[0].teacher_id) !== Number(teacher.id)) {
        return res.status(409).json({
          success: false,
          message: `This device is permanently registered to ${devCheck.rows[0].teacher_name}. Each device can only ever be used to check in one teacher - contact the Head Master if this needs to change.`,
        });
      }
    }

    const dupCheck = await query(
      "SELECT id, time_str FROM tams_attendance WHERE teacher_id=$1 AND date=$2",
      [teacher.id, today]
    );
    if (dupCheck.rows[0])
      return res.status(409).json({ success: false, message: `You already checked in today at ${dupCheck.rows[0].time_str}` });

    await query(
      `INSERT INTO tams_attendance
        (teacher_id, teacher_name, subject, date, time_str, is_late, late_reason, latitude, longitude, distance_m, ip_address, device_fingerprint)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [teacher.id, displayName, teacher.subject, today, timeStr, late, lateReason || null, lat, lng, Math.round(distance), clientIP, deviceFingerprint || null]
    );

    if (deviceFingerprint) {
      await query(
        `INSERT INTO tams_device_registrations (device_fingerprint, teacher_id, teacher_name, date)
         VALUES ($1,$2,$3,$4) ON CONFLICT (device_fingerprint) DO NOTHING`,
        [deviceFingerprint, teacher.id, displayName, today]
      );
    }

    res.json({ success: true, message: late ? "Attendance recorded (Late)." : "Attendance recorded (On time).", time: timeStr, isLate: late, distanceM: Math.round(distance) });
  } catch (err) {
    next(err);
  }
};

// GET /api/tams/my-history - last 5 sign-ins for the logged-in teacher
const myHistory = async (req, res, next) => {
  try {
    const tResult = await query("SELECT id FROM teachers WHERE user_id = $1", [req.user.id]);
    if (!tResult.rows[0]) return res.json({ success: true, history: [] });
    const result = await query(
      "SELECT date, time_str, is_late, late_reason, distance_m FROM tams_attendance WHERE teacher_id = $1 ORDER BY date DESC LIMIT 5",
      [tResult.rows[0].id]
    );
    res.json({ success: true, history: result.rows.map((r) => ({ ...r, date: dateOnly(r.date) })) });
  } catch (err) {
    next(err);
  }
};

// GET /api/tams/dashboard?date=YYYY-MM-DD - admin/academic live overview
const dashboard = async (req, res, next) => {
  try {
    const date = req.query.date || getTodayDate(getTanzaniaTime());
    const [present, allTeachers] = await Promise.all([
      query("SELECT * FROM tams_attendance WHERE date = $1 ORDER BY time_str ASC", [date]),
      // Only teachers with a linked User Account can ever log in and check
      // themselves in - a `teachers` roster row with no user_id (e.g. an
      // old Timetable-only entry) must never show up here as a permanent
      // "Absent" ghost. The Head Master (admin) never uses TAMS at all -
      // his linked `teachers` row exists only for Timetable assignment, so
      // he must never appear here, by name OR username.
      query(`
        SELECT t.id, t.full_name, t.short_name, t.subject
        FROM teachers t LEFT JOIN users u ON u.id = t.user_id
        WHERE t.is_active = true AND t.user_id IS NOT NULL AND u.role != 'admin' AND u.is_active = true
      `),
    ]);
    const presentIds = new Set(present.rows.map((r) => r.teacher_id));
    const absent = allTeachers.rows.filter((t) => !presentIds.has(t.id));
    const presentFixed = present.rows.map((r) => ({ ...r, date: dateOnly(r.date) }));
    res.json({
      success: true,
      date,
      present: presentFixed,
      absent,
      counts: {
        // "Present" = everyone who checked in today, whether on time or
        // late - being late doesn't remove someone from Present, it's a
        // separate detail about HOW they were present. "On Time" and
        // "Late" are the two ways to break that Present total down.
        present: presentFixed.length,
        onTime: presentFixed.filter((r) => !r.is_late).length,
        late: presentFixed.filter((r) => r.is_late).length,
        absent: absent.length,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/tams/history?from=&to=&teacher_id=&status=
const history = async (req, res, next) => {
  try {
    const { from, to, teacher_id, status } = req.query;
    const conditions = [];
    const params = [];
    if (from) { params.push(from); conditions.push(`date >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`date <= $${params.length}`); }
    if (teacher_id) { params.push(teacher_id); conditions.push(`teacher_id = $${params.length}`); }
    if (status === "late") conditions.push("is_late = true");
    if (status === "on_time") conditions.push("is_late = false");
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await query(`SELECT * FROM tams_attendance ${where} ORDER BY date DESC, time_str ASC`, params);
    res.json({ success: true, records: result.rows.map((r) => ({ ...r, date: dateOnly(r.date) })) });
  } catch (err) {
    next(err);
  }
};

// Counts Monday–Friday calendar days in a "YYYY-MM" month (Saturdays and
// Sundays excluded) - this is a pure calendar calculation, independent of
// whether any attendance was actually recorded, so it's stable and
// predictable for every month, past or present.
function countWeekdaysInMonth(month) {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(y, m - 1, d).getDay(); // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

// GET /api/tams/monthly-summary?month=YYYY-MM
const monthlySummary = async (req, res, next) => {
  try {
    const month = req.query.month || getTodayDate(getTanzaniaTime()).slice(0, 7);
    const summaryResult = await query(
      `SELECT t.id AS teacher_id, t.full_name, t.short_name,
              COUNT(a.id) AS days_present,
              COUNT(a.id) FILTER (WHERE a.is_late) AS days_late
       FROM teachers t
       LEFT JOIN users u ON u.id = t.user_id
       LEFT JOIN tams_attendance a ON a.teacher_id = t.id AND a.date::text LIKE $1
       WHERE t.is_active = true AND t.user_id IS NOT NULL AND u.role != 'admin' AND u.is_active = true
       GROUP BY t.id, t.full_name, t.short_name
       ORDER BY t.full_name ASC`,
      [`${month}%`]
    );
    // "Working days" = every Monday–Friday in the month (weekends
    // excluded), per spec - the same figure for every teacher that month.
    const workingDays = countWeekdaysInMonth(month);
    const pct = (n) => (workingDays > 0 ? Math.round((n / workingDays) * 1000) / 10 : 0);
    const summary = summaryResult.rows.map((r) => {
      const present = Number(r.days_present);
      const late = Number(r.days_late);
      const onTime = present - late;
      const absent = Math.max(workingDays - present, 0);
      return {
        teacher_id: r.teacher_id,
        full_name: r.full_name,
        short_name: r.short_name,
        days_present: present,
        days_present_pct: pct(present),
        days_on_time: onTime,
        days_on_time_pct: pct(onTime),
        days_late: late,
        days_late_pct: pct(late),
        days_absent: absent,
        days_absent_pct: pct(absent),
      };
    });
    res.json({ success: true, month, workingDays, summary });
  } catch (err) {
    next(err);
  }
};

// GET /api/tams/export-pdf?from=&to=&label=
// Prints the same data as /history, but as a PDF - the "Reason for Late"
// text is deliberately NEVER included in the PDF (shown on-screen only),
// per spec.
const PDFDocument = require("pdfkit");
const { formatTZ } = require("../utils/tz");
const { drawLetterhead, drawFooter, drawTableGrid } = require("../utils/pdfHeader");

const exportPdf = async (req, res, next) => {
  try {
    const { from, to, label } = req.query;
    if (!from || !to) return res.status(400).json({ success: false, message: "from and to dates are required." });

    const result = await query(
      `SELECT a.* FROM tams_attendance a
       WHERE a.date >= $1 AND a.date <= $2
       ORDER BY a.date ASC, a.time_str ASC`,
      [from, to]
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="tams-${from}_to_${to}.pdf"`);

    const doc = new PDFDocument({ margin: 30, size: "A4", layout: "portrait", bufferPages: true });
    doc.pipe(res);
    drawLetterhead(doc, `TEACHERS ATTENDANCE REPORT - ${label || `${from} to ${to}`}`);

    doc.fontSize(9).font("Helvetica").fillColor("#64748B")
      .text(`Period: ${from} to ${to}  ·  ${result.rows.length} record(s)`, { align: "right" });
    doc.moveDown(0.6);

    // NOTE: no "Reason for Late" column here - intentionally omitted from print.
    // Widths tuned to fit A4 portrait's usable width (~535pt after margins) -
    // narrower than the old landscape layout, so Teacher/Subject columns are
    // tighter but every column still fits without wrapping in normal use.
    const colX = [30, 85, 235, 325, 380, 435, 495];
    const headers = ["Date", "Teacher", "Subject", "Time", "Status", "Distance (m)"];
    const tableTop = doc.y;
    doc.rect(30, tableTop - 4, 465, 18).fill("#F1F5F9");
    doc.fillColor("#334155").fontSize(8).font("Helvetica-Bold");
    headers.forEach((h, idx) => doc.text(h, colX[idx] + 4, tableTop, { width: (colX[idx + 1] || 495) - colX[idx] - 6 }));
    let y = tableTop + 18;
    let rowYs = [tableTop - 4, y]; // every row boundary on the CURRENT page, header included

    doc.font("Helvetica").fillColor("#0F172A");
    result.rows.forEach((r, idx) => {
      if (y > 740) {
        drawTableGrid(doc, colX.slice(0, -1), 495, rowYs); // close out this page's grid before starting a new one
        doc.addPage({ margin: 30, size: "A4", layout: "portrait" });
        drawLetterhead(doc, `TEACHERS ATTENDANCE REPORT - ${label || `${from} to ${to}`} (cont.)`);
        y = doc.y + 10;
        rowYs = [y - 4, y + 14];
      }
      if (idx % 2 === 0) doc.rect(30, y - 3, 465, 16).fill("#F8FAFC").fillColor("#0F172A");
      const vals = [dateOnly(r.date), r.teacher_name, r.subject || "-", r.time_str, r.is_late ? "Late" : "On Time", r.distance_m ?? "-"];
      vals.forEach((v, i2) => doc.fontSize(8).fillColor("#0F172A").text(String(v), colX[i2] + 4, y, { width: (colX[i2 + 1] || 495) - colX[i2] - 6 }));
      y += 16;
      rowYs.push(y - 3);
    });
    drawTableGrid(doc, colX.slice(0, -1), 495, rowYs);

    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

// GET /api/tams/attendance-trend?months=6
// Long-term attendance trend for the Head Master's Analytics Dashboard -
// one aggregated data point PER MONTH (not a single day/period like
// /dashboard or /history), so a pattern like "attendance keeps slipping
// every term" is visible at a glance. Looks back `months` calendar months
// (default 6, capped 24) ending with the current month, oldest first.
const attendanceTrend = async (req, res, next) => {
  try {
    const monthsBack = Math.min(Math.max(Number(req.query.months) || 6, 2), 24);
    const now = getTanzaniaTime();
    const months = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    const results = [];
    for (const month of months) {
      const summaryResult = await query(
        `SELECT COUNT(DISTINCT t.id) AS teacher_count,
                COUNT(a.id) AS total_present,
                COUNT(a.id) FILTER (WHERE a.is_late) AS total_late
         FROM teachers t
         LEFT JOIN users u ON u.id = t.user_id
         LEFT JOIN tams_attendance a ON a.teacher_id = t.id AND a.date::text LIKE $1
         WHERE t.is_active = true AND t.user_id IS NOT NULL AND u.role != 'admin' AND u.is_active = true`,
        [`${month}%`]
      );
      const row = summaryResult.rows[0];
      const teacherCount = Number(row.teacher_count) || 0;
      const workingDays = countWeekdaysInMonth(month);
      const totalPresent = Number(row.total_present) || 0;
      const totalLate = Number(row.total_late) || 0;
      const totalOnTime = totalPresent - totalLate;
      const possibleSlots = teacherCount * workingDays;
      const pct = (n) => (possibleSlots > 0 ? Math.round((n / possibleSlots) * 1000) / 10 : null);
      results.push({
        month,
        workingDays,
        teacherCount,
        presentPct: pct(totalPresent),
        onTimePct: pct(totalOnTime),
        latePct: pct(totalLate),
        absentPct: possibleSlots > 0 ? Math.round((100 - (totalPresent / possibleSlots) * 100) * 10) / 10 : null,
      });
    }

    // Same "compare first half vs second half of the series" approach used
    // by the Results Analytics endpoint - stable against one noisy month.
    const vals = results.map((r) => r.presentPct).filter((v) => v != null);
    let direction = "insufficient_data";
    if (vals.length >= 2) {
      const mid = Math.ceil(vals.length / 2);
      const firstAvg = vals.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
      const secondAvg = vals.slice(mid).reduce((a, b) => a + b, 0) / (vals.length - mid);
      const diff = secondAvg - firstAvg;
      direction = Math.abs(diff) < 1 ? "stable" : diff > 0 ? "improving" : "declining";
    }

    res.json({ success: true, months: results, presentTrendDirection: direction });
  } catch (err) {
    next(err);
  }
};

// GET /api/tams/config - non-secret settings the check-in screen needs to
// show a live "Registration window" checklist tick without duplicating
// these numbers in the frontend.
const getConfig = async (req, res) => {
  res.json({
    success: true,
    windowOpenHour: CONFIG.WINDOW_OPEN_HOUR,
    windowCloseHour: CONFIG.WINDOW_CLOSE_HOUR,
    deadlineHour: CONFIG.DEADLINE_HOUR,
    deadlineMin: CONFIG.DEADLINE_MIN,
    radiusM: CONFIG.SCHOOL_RADIUS_M,
  });
};

module.exports = { checkin, myHistory, dashboard, history, monthlySummary, attendanceTrend, exportPdf, getConfig, CONFIG };
