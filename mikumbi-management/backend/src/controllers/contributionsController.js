const { query } = require("../db/db");
const PDFDocument = require("pdfkit");
const { tzColumn, formatTZ, dateOnly } = require("../utils/tz");
const { drawLetterhead, drawFooter, drawTableGrid } = require("../utils/pdfHeader");
const { recordAudit } = require("../utils/auditLogger");
const tzs = (n) => `TZS ${Number(n || 0).toLocaleString("en-US")}`;

// The monthly amount is set by the Head Master / Second Master (default
// TZS 2,000) and can differ per month - see utils/parttimeFee.js.
const feeRates = require("../utils/parttimeFee");
const MAX_INSTALLMENTS = 4;
const HOLIDAY_MONTHS = [6, 12]; // June & December - no fee billed

const fullNameOf = (s) => [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");

// A class_teacher only ever sees/collects for their OWN class - everyone
// else (admin/second_master/academic) sees everything. Returns null for "no
// restriction" or an array of form names to restrict to.
// Scoped by `class_teacher_of` - the ONE class this person is Class Teacher
// OF (set in User Accounts) - NOT `assigned_forms`, which is what they
// TEACH and scopes Results Management instead. These used to be the same
// field, which wrongly tied Contribution Management to teaching
// assignments; they're independent now.
const classScopeFor = (req) => {
  const roles = req.user.roles && req.user.roles.length ? req.user.roles : [req.user.role];
  const isOverseer = roles.some((r) => ["admin", "second_master", "academic"].includes(r));
  if (isOverseer) return null;
  return req.user.class_teacher_of ? [req.user.class_teacher_of] : [];
};

const logHistory = async (studentId, eventType, note, userId) => {
  await query(`
    INSERT INTO student_history (student_id, event_type, note, recorded_by)
    VALUES ($1,$2,$3,$4)
  `, [studentId, eventType, note || null, userId || null]);
};

// ── Part-time Teachers (monthly amount set in the app, up to 4 installments, June/Dec excluded) ──

// GET /api/contributions/parttime?year=&month=  - every enrolled student + their status for that month
const getPartTime = async (req, res, next) => {
  try {
    const { year = new Date().getFullYear().toString(), month, form } = req.query;
    if (!month) return res.status(400).json({ success: false, message: "month is required (1-12)." });
    if (HOLIDAY_MONTHS.includes(Number(month)))
      return res.json({ success: true, data: [], holiday: true, message: "No contribution is billed for this month (school holiday)." });

    let scope = classScopeFor(req); // null = see all classes; [] / [...] = restricted
    if (scope && scope.length === 0)
      return res.json({ success: true, data: [], message: "You have no class assigned yet - ask the Head Master to assign your class." });
    // An overseer (admin/second_master/academic) may optionally narrow to one class.
    if (!scope && form) scope = [form];

    const result = await query(`
      SELECT s.id AS student_id, s.reg_no, s.first_name, s.middle_name, s.last_name, s.form,
             COALESCE(p.amount_paid, 0) AS amount_paid, COALESCE(p.installments, 0) AS installments,
             COALESCE(p.completed, false) AS completed, p.id AS contribution_id,
             u.full_name AS collected_by_name
      FROM students s
      LEFT JOIN contribution_parttime p
        ON p.student_id = s.id AND p.year = $1 AND p.month = $2
      LEFT JOIN users u ON u.id = p.recorded_by
      WHERE s.status = 'Active' ${scope ? "AND s.form = ANY($3::text[])" : ""}
      ORDER BY s.form, s.gender ASC, LOWER(s.first_name) ASC, LOWER(s.middle_name) ASC, LOWER(s.last_name) ASC
    `, scope ? [year, month, scope] : [year, month]);

    const rates = await feeRates.rates();
    res.json({ success: true, data: result.rows, monthly_fee: feeRates.feeFromRates(rates, year, month), max_installments: MAX_INSTALLMENTS,
      fee_rates: rates.map((r) => ({ amount: r.amount, year: r.effective_year, month: r.effective_month })) });
  } catch (err) { next(err); }
};

// Shared input checks for Part-Time payments. Previously a non-numeric
// amount ("abc") was stored as NaN - permanently corrupting that month,
// since every later installment was added onto NaN - a year like "x" was
// accepted, and month 13 surfaced as a raw database error.
function validYear(y) {
  const n = Number(y);
  const now = new Date().getFullYear();
  return Number.isInteger(n) && n >= 2000 && n <= now + 2 ? n : null;
}
function validMonth(m) {
  const n = Number(m);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

// POST /api/contributions/parttime/:studentId  { year, month, amount }
const payPartTime = async (req, res, next) => {
  try {
    const { amount } = req.body;
    const studentId = req.params.studentId;
    if (req.body.year === undefined || req.body.month === undefined || amount === undefined || amount === "")
      return res.status(400).json({ success: false, message: "year, month and amount are required." });
    const year = validYear(req.body.year);
    const month = validMonth(req.body.month);
    if (!year) return res.status(400).json({ success: false, message: "Invalid year." });
    if (!month) return res.status(400).json({ success: false, message: "Invalid month (must be 1-12)." });
    if (!Number.isFinite(Number(amount)))
      return res.status(400).json({ success: false, message: "Amount must be a number." });
    if (HOLIDAY_MONTHS.includes(Number(month)))
      return res.status(400).json({ success: false, message: "June and December are school holiday months - no contribution is billed." });
    if (Number(amount) <= 0)
      return res.status(400).json({ success: false, message: "Amount must be greater than zero." });

    const studentRes = await query("SELECT * FROM students WHERE id = $1", [studentId]);
    if (!studentRes.rows.length) return res.status(404).json({ success: false, message: "Student not found." });
    const student = studentRes.rows[0];
    // Contributions are only collected from CURRENT students - a transferred
    // or graduated student used to be accepted here (Ream already refused).
    if (student.status !== "Active")
      return res.status(400).json({ success: false, message: `${fullNameOf(student)} is not an active student (status: ${student.status}) - contributions can't be recorded.` });

    const scope = classScopeFor(req);
    if (scope && !scope.includes(student.form))
      return res.status(403).json({ success: false, message: "You can only collect contributions for your own class." });

    const existing = await query(
      `SELECT * FROM contribution_parttime WHERE student_id=$1 AND year=$2 AND month=$3`,
      [studentId, year, month]
    );
    const row = existing.rows[0];

    if (row && row.completed)
      return res.status(400).json({ success: false, message: "This month is already fully paid for this student." });
    if (row && row.installments >= MAX_INSTALLMENTS)
      return res.status(400).json({ success: false, message: `Maximum of ${MAX_INSTALLMENTS} installments already reached for this month.` });

    const PARTTIME_MONTHLY_FEE = await feeRates.feeFor(year, month);
    const currentPaid = row ? Number(row.amount_paid) : 0;
    // "Mark Paid (Full)" deliberately sends the full monthly fee and is
    // capped to the balance below; any OTHER amount above the balance is a
    // typing slip (e.g. 5000 for 500) that used to be silently trimmed.
    const balance = PARTTIME_MONTHLY_FEE - currentPaid;
    if (Number(amount) > balance && Number(amount) !== PARTTIME_MONTHLY_FEE)
      return res.status(400).json({ success: false, message: `Amount is more than the balance for this month (TZS ${balance.toLocaleString("en-US")}).` });
    const newPaid = Math.min(currentPaid + Number(amount), PARTTIME_MONTHLY_FEE);
    const newInstallments = (row ? row.installments : 0) + 1;
    const completed = newPaid >= PARTTIME_MONTHLY_FEE;
    // The actual amount CREDITED today - e.g. if TZS 1,500 was already paid
    // earlier and "Mark Paid (Full)" sends amount=2000, only TZS 500 is
    // actually new; logging the full 2000 here would double-count the 1,500
    // already logged on the earlier payment date in Daily Collections.
    const actualCollected = newPaid - currentPaid;

    let result;
    if (row) {
      result = await query(`
        UPDATE contribution_parttime SET amount_paid=$1, installments=$2, completed=$3, updated_at=NOW()
        WHERE id=$4 RETURNING *
      `, [newPaid, newInstallments, completed, row.id]);
    } else {
      result = await query(`
        INSERT INTO contribution_parttime (student_id, year, month, amount_paid, installments, completed, recorded_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
      `, [studentId, year, month, newPaid, newInstallments, completed, req.user?.id || null]);
    }

    if (completed) {
      await logHistory(studentId, "Contribution", `Part-time Teachers contribution for month ${month}/${year} completed (TZS ${PARTTIME_MONTHLY_FEE}).`, req.user?.id);
    }

    // Log this individual payment event (append-only) so "Daily Collections"
    // can show exactly who paid on exactly which day - contribution_parttime
    // above only ever holds the running total/last-update for the month.
    // Uses actualCollected (not the raw `amount` sent) so a payment that
    // pushes past the remaining balance doesn't over-record what was
    // actually collected today.
    await query(`
      INSERT INTO contribution_parttime_payments (student_id, year, month, amount, recorded_by)
      VALUES ($1,$2,$3,$4,$5)
    `, [studentId, year, month, actualCollected, req.user?.id || null]);

    await recordAudit({ actor: req.user, action: "contribution.payment", entityType: "student", entityId: student.id,
      description: `Recorded ${tzs(actualCollected)} Part-Time Teachers payment for ${fullNameOf(student)} (${student.form}), month ${month}/${year}${completed ? " - month fully paid" : ""}.`,
      metadata: { amount: actualCollected, year, month, total_paid: newPaid, completed }, req });

    res.json({ success: true, data: result.rows[0], student: { id: student.id, name: fullNameOf(student) } });
  } catch (err) { next(err); }
};

// POST /api/contributions/parttime/:studentId/advance  { year, months: [7,8,9] }
// Pay several FUTURE months in full, in one go (e.g. a parent pays 6 months
// ahead). Each listed month is marked fully paid/completed - this is for
// full advance payment, not partial installments spread across months.
const payPartTimeAdvance = async (req, res, next) => {
  try {
    const studentId = req.params.studentId;
    if (!Array.isArray(req.body.months) || !req.body.months.length)
      return res.status(400).json({ success: false, message: "year and a non-empty months array are required." });
    const year = validYear(req.body.year);
    if (!year) return res.status(400).json({ success: false, message: "Invalid year." });
    // Validate EVERY month before writing anything - an invalid month in the
    // middle used to fail after the earlier months were already saved -
    // and drop duplicates so one month is never processed twice.
    const parsed = req.body.months.map(validMonth);
    if (parsed.some((m) => m === null))
      return res.status(400).json({ success: false, message: "Invalid month in the list (each must be 1-12)." });
    const months = [...new Set(parsed)].sort((x, y) => x - y);

    const studentRes = await query("SELECT * FROM students WHERE id = $1", [studentId]);
    if (!studentRes.rows.length) return res.status(404).json({ success: false, message: "Student not found." });
    const student = studentRes.rows[0];
    // Contributions are only collected from CURRENT students - a transferred
    // or graduated student used to be accepted here (Ream already refused).
    if (student.status !== "Active")
      return res.status(400).json({ success: false, message: `${fullNameOf(student)} is not an active student (status: ${student.status}) - contributions can't be recorded.` });

    const scope = classScopeFor(req);
    if (scope && !scope.includes(student.form))
      return res.status(403).json({ success: false, message: "You can only collect contributions for your own class." });

    const results = [];
    for (const month of months) {
      if (HOLIDAY_MONTHS.includes(Number(month))) continue; // silently skip holiday months in a multi-month sweep
      const existing = await query(`SELECT * FROM contribution_parttime WHERE student_id=$1 AND year=$2 AND month=$3`, [studentId, year, month]);
      if (existing.rows[0]?.completed) continue; // already paid - skip, don't double-charge
      const row = existing.rows[0];
      // The actual amount CREDITED today - if this month already had a
      // partial payment (e.g. TZS 500 paid earlier), only the remaining
      // balance is actually collected now; logging the full monthly fee
      // here would double-count the earlier partial payment in Daily
      // Collections (same issue as the single-month payPartTime path).
      const PARTTIME_MONTHLY_FEE = await feeRates.feeFor(year, month);
      const currentPaid = row ? Number(row.amount_paid) : 0;
      const actualCollected = Math.max(PARTTIME_MONTHLY_FEE - currentPaid, 0);
      const r = row
        ? await query(`UPDATE contribution_parttime SET amount_paid=$1, installments=$2, completed=true, updated_at=NOW() WHERE id=$3 RETURNING *`,
            [Math.max(PARTTIME_MONTHLY_FEE, currentPaid), (row.installments || 0) + 1, row.id])
        : await query(`INSERT INTO contribution_parttime (student_id, year, month, amount_paid, installments, completed, recorded_by) VALUES ($1,$2,$3,$4,1,true,$5) RETURNING *`,
            [studentId, year, month, PARTTIME_MONTHLY_FEE, req.user?.id || null]);
      results.push(r.rows[0]);
      // Log this payment event too, same as a normal single-month payment,
      // so an advance payment sweep also shows up correctly in Daily Collections.
      await query(`
        INSERT INTO contribution_parttime_payments (student_id, year, month, amount, recorded_by)
        VALUES ($1,$2,$3,$4,$5)
      `, [studentId, year, month, actualCollected, req.user?.id || null]);
    }
    await logHistory(studentId, "Contribution", `Part-Time Teachers contribution paid in advance for ${results.length} month(s) of ${year}.`, req.user?.id);
    if (results.length) {
      await recordAudit({ actor: req.user, action: "contribution.payment_advance", entityType: "student", entityId: student.id,
        description: `Recorded advance Part-Time Teachers payment for ${fullNameOf(student)} (${student.form}): ${results.length} month(s) of ${year} (${results.map((r) => r.month).join(", ")}).`,
        metadata: { year, months: results.map((r) => r.month) }, req });
    }
    res.json({ success: true, data: results, student: { id: student.id, name: fullNameOf(student) } });
  } catch (err) { next(err); }
};

// GET /api/contributions/parttime/summary?year=&month= - admin/academic view:
// per-class totals collected, how many students paid, and who collected it.
const getPartTimeSummary = async (req, res, next) => {
  try {
    const { year = new Date().getFullYear().toString(), month } = req.query;
    if (!month) return res.status(400).json({ success: false, message: "month is required (1-12)." });

    const result = await query(`
      SELECT s.form,
        COUNT(*) FILTER (WHERE p.completed = true) AS students_paid,
        COUNT(*) AS total_students,
        COALESCE(SUM(p.amount_paid), 0) AS total_collected,
        COALESCE(array_agg(DISTINCT u.full_name) FILTER (WHERE u.full_name IS NOT NULL), '{}') AS collected_by
      FROM students s
      LEFT JOIN contribution_parttime p ON p.student_id = s.id AND p.year = $1 AND p.month = $2
      LEFT JOIN users u ON u.id = p.recorded_by
      WHERE s.status = 'Active'
      GROUP BY s.form ORDER BY s.form
    `, [year, month]);
    res.json({ success: true, data: result.rows, monthly_fee: await feeRates.feeFor(year, month) });
  } catch (err) { next(err); }
};

// GET /api/contributions/parttime/daily?date=YYYY-MM-DD&form= - every
// individual Part-time Teachers payment collected on ONE specific day (in
// Tanzania local time), plus the total collected and how many students paid
// that day. A class_teacher is auto-scoped to their own class (via
// class_teacher_of); admin/second_master/academic may optionally narrow to
// one class with ?form=, or leave it off to see every class for that day.
const getPartTimeDaily = async (req, res, next) => {
  try {
    const { date, form } = req.query;
    if (!date) return res.status(400).json({ success: false, message: "date is required (YYYY-MM-DD)." });

    let scope = classScopeFor(req);
    if (scope && scope.length === 0)
      return res.json({ success: true, data: [], total_collected: 0, students_paid: 0, message: "You have no class assigned yet - ask the Head Master to assign your class." });
    if (!scope && form) scope = [form];

    const result = await query(`
      SELECT p.id, p.student_id, p.amount, p.month, p.year,
             s.first_name, s.middle_name, s.last_name, s.form,
             u.full_name AS recorded_by_name,
             ${tzColumn("p.paid_at", "paid_at_tz")}
      FROM contribution_parttime_payments p
      JOIN students s ON s.id = p.student_id
      LEFT JOIN users u ON u.id = p.recorded_by
      WHERE (p.paid_at AT TIME ZONE 'Africa/Dar_es_Salaam')::date = $1::date
        ${scope ? "AND s.form = ANY($2::text[])" : ""}
      ORDER BY p.paid_at ASC
    `, scope ? [date, scope] : [date]);

    const totalCollected = result.rows.reduce((sum, r) => sum + Number(r.amount), 0);
    const studentsPaid = new Set(result.rows.map((r) => r.student_id)).size;

    res.json({ success: true, data: result.rows, total_collected: totalCollected, students_paid: studentsPaid });
  } catch (err) { next(err); }
};

// GET /api/contributions/parttime/history?year=&form= - full-year, month-by-
// month breakdown (optionally for one class), so past years stay browsable.
const getPartTimeHistory = async (req, res, next) => {
  try {
    const { year = new Date().getFullYear().toString(), form } = req.query;
    const result = await query(`
      SELECT p.month, s.form,
        COUNT(*) FILTER (WHERE p.completed = true) AS students_paid,
        COALESCE(SUM(p.amount_paid), 0) AS total_collected
      FROM contribution_parttime p
      JOIN students s ON s.id = p.student_id
      WHERE p.year = $1 AND s.status = 'Active' ${form ? "AND s.form = $2" : ""}
      GROUP BY p.month, s.form ORDER BY p.month, s.form
    `, form ? [year, form] : [year]);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// GET /api/contributions/ream/summary - how many students per class have
// brought Ream (admin/academic view).
const getReamSummary = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT s.form, COUNT(*) AS students_brought
      FROM student_charges sc JOIN students s ON s.id = sc.student_id
      WHERE sc.charge_type = 'Ream' AND s.status = 'Active'
      GROUP BY s.form ORDER BY s.form
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};
const receiptPartTime = async (req, res, next) => {
  try {
    const r = await query(`
      SELECT p.*, s.first_name, s.middle_name, s.last_name, s.reg_no, s.form
      FROM contribution_parttime p JOIN students s ON s.id = p.student_id
      WHERE p.id = $1
    `, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ success: false, message: "Contribution record not found." });
    const row = r.rows[0];

    // Same class-scoping rule as every other endpoint here - a class_teacher
    // may only fetch a receipt for a student in their OWN class, not any
    // record whose id they happen to know/guess.
    const scope = classScopeFor(req);
    if (scope && !scope.includes(row.form))
      return res.status(403).json({ success: false, message: "You can only view receipts for your own class." });

    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="receipt-parttime-${row.id}.pdf"`);
    const doc = new PDFDocument({ margin: 40, size: "A5" });
    doc.pipe(res);
    drawLetterhead(doc, "Official Receipt - Part-time Teachers Contribution");

    const row2 = (label, value) => {
      const labelW = 140, startY = doc.y, startX = doc.page.margins.left;
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#475569").text(label, startX, startY, { width: labelW, lineBreak: false });
      doc.font("Helvetica").fillColor("#0F172A").text(String(value ?? "-"), startX + labelW, startY, { lineBreak: false });
      doc.x = startX; doc.y = startY + 18;
    };

    row2("Student Name:", fullNameOf(row));
    row2("Reg. No.:", row.reg_no || row.student_id);
    row2("Form:", row.form);
    row2("Month/Year:", `${monthNames[row.month - 1]} ${row.year}`);
    row2("Amount Paid:", `TZS ${Number(row.amount_paid).toLocaleString()}`);
    // No "installment X of 4" wording anywhere on the receipt, by request -
    // just the amount actually paid and whether the month is fully settled.
    row2("Status:", row.completed ? "Completed" : "Partial payment");
    doc.moveDown(1);

    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

// GET /api/contributions/parttime/students?year= - one row per STUDENT who
// has paid something this year (deduped - a student who paid several
// months shows once), with their total TZS paid and how many months. This
// is what powers the clickable "Student History" list - pick a student to
// see every month they paid (getPartTimeStudentEntries below), instead of
// a wall of month-by-month rows for every student at once.
const getPartTimeStudents = async (req, res, next) => {
  try {
    const { year = new Date().getFullYear().toString() } = req.query;
    // "Student History" must show EVERY student who has contributed anything
    // this year - Part-Time Teachers fees AND/OR Ream - not just Part-Time.
    // Previously this only queried contribution_parttime, so a student who
    // had only brought Ream was counted in the combined stat above but never
    // appeared as a row here, even though the office had recorded it.
    //
    // A class_teacher only ever sees their OWN class here (same scoping used
    // by the collection endpoints above) - admin/second_master/academic see
    // every class, unrestricted.
    const scope = classScopeFor(req);
    if (scope && scope.length === 0)
      return res.json({ success: true, data: [], grand_total: 0, student_count: 0, message: "You have no class assigned yet - ask the Head Master to assign your class." });

    const result = await query(`
      WITH combined AS (
        SELECT s.id AS student_id, s.first_name, s.middle_name, s.last_name, s.form,
               p.amount_paid AS amount, p.updated_at AS rec_date, 'parttime' AS source
        FROM students s
        JOIN contribution_parttime p ON p.student_id = s.id AND p.year = $1 AND p.amount_paid > 0
        WHERE s.status = 'Active' ${scope ? "AND s.form = ANY($2::text[])" : ""}
        UNION ALL
        SELECT s.id, s.first_name, s.middle_name, s.last_name, s.form,
               0 AS amount, sc.charge_date::timestamptz AS rec_date, 'ream' AS source
        FROM students s
        JOIN student_charges sc ON sc.student_id = s.id AND sc.charge_type = 'Ream' AND sc.paid = true
          AND EXTRACT(YEAR FROM sc.charge_date) = $1::int
        WHERE s.status = 'Active' ${scope ? "AND s.form = ANY($2::text[])" : ""}
      )
      SELECT student_id, first_name, middle_name, last_name, form,
             COUNT(*) FILTER (WHERE source = 'parttime') AS months_paid,
             COALESCE(SUM(amount) FILTER (WHERE source = 'parttime'), 0) AS total_paid,
             BOOL_OR(source = 'ream') AS ream_contributed,
             MAX(rec_date) AS last_date
      FROM combined
      GROUP BY student_id, first_name, middle_name, last_name, form
      ORDER BY MAX(rec_date) DESC
    `, scope ? [year, scope] : [year]);

    const totalsRes = await query(`
      SELECT COALESCE(SUM(p.amount_paid), 0) AS grand_total, COUNT(DISTINCT p.student_id) AS student_count
      FROM contribution_parttime p
      JOIN students s ON s.id = p.student_id
      WHERE p.year = $1 AND p.amount_paid > 0 AND s.status = 'Active' ${scope ? "AND s.form = ANY($2::text[])" : ""}
    `, scope ? [year, scope] : [year]);

    res.json({
      success: true,
      data: result.rows,
      grand_total: totalsRes.rows[0].grand_total,
      student_count: Number(totalsRes.rows[0].student_count),
    });
  } catch (err) { next(err); }
};

// GET /api/contributions/parttime/student/:studentId/entries?year= - every
// month ONE student paid something, most recent first, each showing the
// amount, the date it was recorded/last updated, and who collected it -
// plus that student's Ream contribution for the year, if any, so "View
// History" always matches everything counted for them in Student History.
const getPartTimeStudentEntries = async (req, res, next) => {
  try {
    const { year = new Date().getFullYear().toString() } = req.query;

    // A class_teacher may only open the history of a student in their OWN
    // class - mirrors the same check used when recording a payment.
    const scope = classScopeFor(req);
    if (scope) {
      const studentRes = await query("SELECT form FROM students WHERE id = $1", [req.params.studentId]);
      if (!studentRes.rows.length) return res.status(404).json({ success: false, message: "Student not found." });
      if (!scope.includes(studentRes.rows[0].form))
        return res.status(403).json({ success: false, message: "You can only view history for your own class." });
    }

    const result = await query(`
      SELECT p.id, p.month, p.amount_paid, p.installments, p.updated_at,
             u.full_name AS recorded_by_name, 'parttime' AS source
      FROM contribution_parttime p
      LEFT JOIN users u ON u.id = p.recorded_by
      WHERE p.student_id = $1 AND p.year = $2 AND p.amount_paid > 0
      UNION ALL
      SELECT sc.id, NULL AS month, sc.amount AS amount_paid, NULL AS installments, sc.charge_date::timestamptz AS updated_at,
             u.full_name AS recorded_by_name, 'ream' AS source
      FROM student_charges sc
      LEFT JOIN users u ON u.id = sc.created_by
      WHERE sc.student_id = $1 AND sc.charge_type = 'Ream' AND sc.paid = true
        AND EXTRACT(YEAR FROM sc.charge_date) = $2::int
      ORDER BY updated_at DESC
    `, [req.params.studentId, year]);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// GET /api/contributions/summary/students-count?year= - how many DISTINCT
// students have contributed ANYTHING (Part-time Teachers OR Ream) this
// year, combined - the single number the oversight dashboard leads with.
const getContributedStudentsCount = async (req, res, next) => {
  try {
    const { year = new Date().getFullYear().toString() } = req.query;

    // A class_teacher sees this combined count for their OWN class only -
    // same scoping as getPartTimeStudents, since this is the number shown
    // right alongside that list in "Student History".
    const scope = classScopeFor(req);
    if (scope && scope.length === 0)
      return res.json({ success: true, data: { total: 0 } });

    const result = await query(`
      SELECT COUNT(DISTINCT x.student_id) AS total FROM (
        SELECT p.student_id, s.form FROM contribution_parttime p
        JOIN students s ON s.id = p.student_id
        WHERE p.year = $1 AND p.amount_paid > 0 AND s.status = 'Active'
        UNION
        SELECT sc.student_id, s.form FROM student_charges sc
        JOIN students s ON s.id = sc.student_id
        WHERE sc.charge_type = 'Ream' AND EXTRACT(YEAR FROM sc.charge_date) = $1::int AND s.status = 'Active'
      ) x
      WHERE 1=1 ${scope ? "AND x.form = ANY($2::text[])" : ""}
    `, scope ? [year, scope] : [year]);
    res.json({ success: true, data: { total: Number(result.rows[0].total) } });
  } catch (err) { next(err); }
};

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// GET /api/contributions/parttime/students/pdf?year=&month=&from_month=&to_month=
// - printable version of what "Student History" shows on screen: every
// student who has contributed anything in the selected period (Part-Time
// Teachers fee and/or Ream), with their total TZS paid - for handing to the
// Head Master/Bursar as a record.
//
// The period is chosen by whoever downloads it (see the "Download
// Contributions Report" dialog on the frontend): the whole year (default,
// same as before), ONE specific month (`month`), or a range of months
// (`from_month`..`to_month`, inclusive, same year). Ream is a once-a-year
// flag (not tied to any single month), so it's always reported for the
// whole year regardless of the month/range picked - narrowing it to "was
// Ream brought in August" would be meaningless, since Ream has no month.
const exportPartTimeStudentsPdf = async (req, res, next) => {
  try {
    const { year = new Date().getFullYear().toString(), month, from_month, to_month } = req.query;
    const scope = classScopeFor(req);
    if (scope && scope.length === 0)
      return res.status(400).json({ success: false, message: "You have no class assigned yet - ask the Head Master to assign your class." });

    let monthFrom = null, monthTo = null;
    if (month && Number(month) >= 1 && Number(month) <= 12) {
      monthFrom = monthTo = Number(month);
    } else if (from_month || to_month) {
      const f = Number(from_month) || 1, t = Number(to_month) || 12;
      monthFrom = Math.min(f, t); monthTo = Math.max(f, t);
    }
    const periodLabel = monthFrom
      ? (monthFrom === monthTo ? `${MONTH_NAMES[monthFrom - 1]} ${year}` : `${MONTH_NAMES[monthFrom - 1]} - ${MONTH_NAMES[monthTo - 1]} ${year}`)
      : `${year}`;

    // Params built up positionally so the same $N placeholders can be
    // reused safely in both branches of the UNION - $1 is always the year.
    const params = [year];
    let scopeClause = "", monthClause = "";
    if (scope) { params.push(scope); scopeClause = ` AND s.form = ANY($${params.length}::text[])`; }
    if (monthFrom) { params.push(monthFrom, monthTo); monthClause = ` AND p.month BETWEEN $${params.length - 1} AND $${params.length}`; }

    const result = await query(`
      WITH combined AS (
        SELECT s.id AS student_id, s.first_name, s.middle_name, s.last_name, s.form,
               p.amount_paid AS amount, 'parttime' AS source
        FROM students s
        JOIN contribution_parttime p ON p.student_id = s.id AND p.year = $1 AND p.amount_paid > 0${monthClause}
        WHERE s.status = 'Active'${scopeClause}
        UNION ALL
        SELECT s.id, s.first_name, s.middle_name, s.last_name, s.form,
               0 AS amount, 'ream' AS source
        FROM students s
        JOIN student_charges sc ON sc.student_id = s.id AND sc.charge_type = 'Ream' AND sc.paid = true
          AND EXTRACT(YEAR FROM sc.charge_date) = $1::int
        WHERE s.status = 'Active'${scopeClause}
      )
      SELECT student_id, first_name, middle_name, last_name, form,
             COUNT(*) FILTER (WHERE source = 'parttime') AS months_paid,
             COALESCE(SUM(amount) FILTER (WHERE source = 'parttime'), 0) AS total_paid,
             BOOL_OR(source = 'ream') AS ream_contributed
      FROM combined
      GROUP BY student_id, first_name, middle_name, last_name, form
      ORDER BY form, last_name, first_name
    `, params);

    const grandTotal = result.rows.reduce((sum, r) => sum + Number(r.total_paid), 0);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="contributions-students-${year}.pdf"`);
    const doc = new PDFDocument({ margin: 30, size: "A4", bufferPages: true });
    doc.pipe(res);
    drawLetterhead(doc, `School Contributions - Students Who Have Contributed (${periodLabel})`);

    const left = doc.page.margins.left;
    const tableWidth = 500;
    const colX = [left, left + 190, left + 270, left + 360, left + 440];
    const headers = ["Full Name", "Class", "Months Paid", "Ream(s)", "Total Paid (TZS)"];
    const drawHeaderRow = (y) => {
      doc.rect(left, y, tableWidth, 18).fill("#334155");
      doc.fillColor("#FFFFFF").fontSize(8).font("Helvetica-Bold");
      headers.forEach((h, i) => doc.text(h, colX[i] + 4, y + 5, { width: (colX[i + 1] || left + tableWidth) - colX[i] - 6 }));
      return y + 18;
    };

    const tableTop = doc.y;
    let y = drawHeaderRow(tableTop);
    let sectionTop = tableTop; // page's own header top, for grid-drawing per page
    const rowYs = [tableTop, y]; // every row boundary on the CURRENT page, header included
    doc.font("Helvetica");
    result.rows.forEach((s, idx) => {
      if (y > 760) {
        drawTableGrid(doc, colX, left + tableWidth, rowYs); // close out this page's grid before starting a new one
        doc.addPage({ margin: 30, size: "A4" });
        sectionTop = 40;
        y = drawHeaderRow(40);
        rowYs.length = 0; rowYs.push(sectionTop, y);
      }
      if (idx % 2 === 0) doc.rect(left, y, tableWidth, 16).fill("#F8FAFC");
      const vals = [fullNameOf(s), s.form, String(s.months_paid), s.ream_contributed ? "Brought" : "-", Number(s.total_paid).toLocaleString()];
      vals.forEach((v, i) => doc.fontSize(8).fillColor("#0F172A").font("Helvetica").text(String(v), colX[i] + 4, y + 4, { width: (colX[i + 1] || left + tableWidth) - colX[i] - 6 }));
      y += 16;
      rowYs.push(y);
    });
    drawTableGrid(doc, colX, left + tableWidth, rowYs);

    doc.moveDown(1);
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#0F172A")
      .text(`Grand Total Collected (Part-time Teachers, ${periodLabel}): TZS ${grandTotal.toLocaleString()}`, left, doc.y);
    doc.fontSize(9).font("Helvetica").fillColor("#64748B")
      .text(`Total Students Contributed: ${result.rows.length}`, left, doc.y + 4);

    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

// ── Ream & Other Expenses (reuse the existing student_charges table) ─────────

// GET /api/contributions/ream?term=&academic_year=
const getReam = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT sc.*, s.first_name, s.middle_name, s.last_name, s.reg_no, s.form,
             u.full_name AS recorded_by_name, ${tzColumn("sc.created_at", "recorded_at_tz")}
      FROM student_charges sc
      JOIN students s ON s.id = sc.student_id
      LEFT JOIN users u ON u.id = sc.created_by
      WHERE sc.charge_type = 'Ream' AND s.status = 'Active'
      ORDER BY sc.charge_date DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// GET /api/contributions/other
const getOtherExpenses = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT sc.*, s.first_name, s.middle_name, s.last_name, s.reg_no, s.form
      FROM student_charges sc JOIN students s ON s.id = sc.student_id
      WHERE sc.charge_type = 'Other' AND s.status = 'Active'
      ORDER BY sc.charge_date DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// PUT /api/contributions/charge/:chargeId - edit the PAYMENT only (amount/note), never the student's name
const updateChargeAmount = async (req, res, next) => {
  try {
    const { amount, note } = req.body;
    if (amount !== undefined && amount !== null && amount !== "" && (!Number.isFinite(Number(amount)) || Number(amount) < 0))
      return res.status(400).json({ success: false, message: "Amount must be a number of 0 or more." });
    const existing = await query(
      `SELECT c.locked, c.amount, c.note, c.charge_type, s.id AS student_id, s.first_name, s.middle_name, s.last_name, s.form
       FROM student_charges c LEFT JOIN students s ON s.id = c.student_id WHERE c.id = $1`, [req.params.chargeId]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: "Record not found." });
    if (existing.rows[0].locked)
      return res.status(400).json({ success: false, message: "This record has already been submitted and locked - it can no longer be edited." });

    const result = await query(`
      UPDATE student_charges SET amount = COALESCE($1, amount), note = COALESCE($2, note)
      WHERE id = $3 RETURNING *
    `, [amount === "" ? null : amount, note, req.params.chargeId]);
    const old = existing.rows[0];
    const after = result.rows[0];
    if (Number(old.amount) !== Number(after.amount) || (old.note || "") !== (after.note || "")) {
      await recordAudit({ actor: req.user, action: "contribution.amount_edit", entityType: "student_charge", entityId: after.id,
        description: `Edited ${old.charge_type || "charge"} record of ${fullNameOf(old)} (${old.form || "-"}): amount ${tzs(old.amount)} -> ${tzs(after.amount)}${(old.note || "") !== (after.note || "") ? ", note changed" : ""}.`,
        metadata: { student_id: old.student_id, before: { amount: Number(old.amount), note: old.note }, after: { amount: Number(after.amount), note: after.note } }, req });
    }
    res.json({ success: true, data: after });
  } catch (err) { next(err); }
};

// GET /api/contributions/receipt/charge/:chargeId - Ream or Other Expenses receipt
const receiptCharge = async (req, res, next) => {
  try {
    const r = await query(`
      SELECT sc.*, s.first_name, s.middle_name, s.last_name, s.reg_no, s.form
      FROM student_charges sc JOIN students s ON s.id = sc.student_id
      WHERE sc.id = $1
    `, [req.params.chargeId]);
    if (!r.rows.length) return res.status(404).json({ success: false, message: "Record not found." });
    const row = r.rows[0];

    // Same class-scoping rule as every other endpoint here - a class_teacher
    // may only fetch a receipt for a student in their OWN class, not any
    // record whose id they happen to know/guess.
    const scope = classScopeFor(req);
    if (scope && !scope.includes(row.form))
      return res.status(403).json({ success: false, message: "You can only view receipts for your own class." });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="receipt-${row.charge_type.toLowerCase()}-${row.id}.pdf"`);
    const doc = new PDFDocument({ margin: 40, size: "A5" });
    doc.pipe(res);
    drawLetterhead(doc, `Official Receipt - ${row.charge_type} Contribution`);

    const row2 = (label, value) => {
      const labelW = 140, startY = doc.y, startX = doc.page.margins.left;
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#475569").text(label, startX, startY, { width: labelW, lineBreak: false });
      doc.font("Helvetica").fillColor("#0F172A").text(String(value ?? "-"), startX + labelW, startY, { lineBreak: false });
      doc.x = startX; doc.y = startY + 18;
    };

    row2("Student Name:", fullNameOf(row));
    row2("Reg. No.:", row.reg_no || row.student_id);
    row2("Form:", row.form);
    row2("Type:", row.charge_type);
    if (row.charge_type === "Ream") {
      row2("Status:", row.paid ? "Brought" : "Not brought");
    } else {
      row2("Amount:", `TZS ${Number(row.amount).toLocaleString()}`);
      row2("Note:", row.note);
    }
    row2("Date:", dateOnly(row.charge_date));
    doc.moveDown(1);

    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

// GET /api/contributions/ream/my-class?year= - a class_teacher's OWN class
// roster with a flag for whether each student has already brought Ream
// this year. (Ream is a once-a-year contribution.)
const getReamMyClass = async (req, res, next) => {
  try {
    const { year = new Date().getFullYear().toString() } = req.query;
    const scope = classScopeFor(req);
    if (scope && scope.length === 0)
      return res.json({ success: true, data: [], message: "You have no class assigned yet - ask the Head Master to assign your class." });

    const result = await query(`
      SELECT s.id AS student_id, s.reg_no, s.first_name, s.middle_name, s.last_name, s.form,
             sc.id AS ream_charge_id, sc.charge_date AS ream_date
      FROM students s
      LEFT JOIN student_charges sc
        ON sc.student_id = s.id AND sc.charge_type = 'Ream' AND EXTRACT(YEAR FROM sc.charge_date) = $1::int
      WHERE s.status = 'Active' ${scope ? "AND s.form = ANY($2::text[])" : ""}
      ORDER BY s.form, s.gender ASC, LOWER(s.first_name) ASC, LOWER(s.middle_name) ASC, LOWER(s.last_name) ASC
    `, scope ? [year, scope] : [year]);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// POST /api/contributions/ream/:studentId  { year } - marks ONE student as
// having brought Ream for the given year. Permanent: once recorded it can
// never be edited or un-marked (no update/delete route exists for this).
// A class_teacher may only mark students in their OWN assigned class(es).
const markReam = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const year = req.body.year === undefined ? new Date().getFullYear() : validYear(req.body.year);
    if (!year) return res.status(400).json({ success: false, message: "Invalid year." });
    const scope = classScopeFor(req);

    const studentRes = await query(`SELECT * FROM students WHERE id = $1`, [studentId]);
    if (!studentRes.rows.length) return res.status(404).json({ success: false, message: "Student not found." });
    if (studentRes.rows[0].status !== "Active")
      return res.status(400).json({ success: false, message: `${fullNameOf(studentRes.rows[0])} is not an active student (status: ${studentRes.rows[0].status}).` });
    const student = studentRes.rows[0];
    if (scope && !scope.includes(student.form))
      return res.status(403).json({ success: false, message: "You can only record Ream for your own assigned class." });

    const existing = await query(
      `SELECT id FROM student_charges WHERE student_id=$1 AND charge_type='Ream' AND EXTRACT(YEAR FROM charge_date) = $2::int`,
      [studentId, year]
    );
    if (existing.rows.length)
      return res.status(409).json({ success: false, message: "Already recorded - Ream can only be submitted once per year and cannot be edited." });

    const result = await query(
      `INSERT INTO student_charges (student_id, charge_type, amount, paid, paid_at, locked, charge_date, created_by)
       VALUES ($1, 'Ream', 0, true, NOW(), true, CURRENT_DATE, $2) RETURNING *`,
      [studentId, req.user?.id || null]
    );
    await recordAudit({ actor: req.user, action: "contribution.ream", entityType: "student", entityId: student.id,
      description: `Recorded that ${fullNameOf(student)} (${student.form}) brought Ream for ${year}.`, metadata: { year }, req });
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: `Submitted successfully - ${fullNameOf(student)} recorded as having brought Ream for ${year}.`,
    });
  } catch (err) { next(err); }
};

// GET /api/contributions/parttime/fee - the amount for this month, any
// change already planned for a later month, and the history of changes.
const getPartTimeFee = async (req, res, next) => {
  try {
    const { year, month } = feeRates.nowYearMonth();
    const rates = await feeRates.rates();
    res.json({ success: true, current: feeRates.feeFromRates(rates, year, month), year, month,
      min: feeRates.MIN_FEE, max: feeRates.MAX_FEE,
      rates: rates.map((r) => ({ id: r.id, amount: r.amount, year: r.effective_year, month: r.effective_month, set_by: r.created_by_name, set_at: r.created_at })) });
  } catch (err) { next(err); }
};

// POST /api/contributions/parttime/fee { amount, year, month } - Head Master /
// Second Master: new monthly amount starting from that month (this month or
// later; earlier months keep what applied then). Months already fully paid
// stay paid; a month whose payments now reach the new amount becomes paid.
const setPartTimeFee = async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);
    const year = validYear(req.body.year);
    const month = validMonth(req.body.month);
    if (!Number.isInteger(amount) || amount < feeRates.MIN_FEE || amount > feeRates.MAX_FEE)
      return res.status(400).json({ success: false, message: `Amount must be a whole number from TZS ${feeRates.MIN_FEE.toLocaleString("en-US")} to TZS ${feeRates.MAX_FEE.toLocaleString("en-US")}.` });
    if (!year || !month) return res.status(400).json({ success: false, message: "Choose the month the new amount starts from." });
    const now = feeRates.nowYearMonth();
    if (year * 100 + month < now.year * 100 + now.month)
      return res.status(400).json({ success: false, message: "The new amount can only start from this month or a later month." });
    const before = await feeRates.feeFor(year, month);
    await query(
      `INSERT INTO parttime_fee_rates (amount, effective_year, effective_month, created_by, created_by_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (effective_year, effective_month) DO UPDATE SET amount = EXCLUDED.amount, created_by = EXCLUDED.created_by,
         created_by_name = EXCLUDED.created_by_name, created_at = NOW()`,
      [amount, year, month, req.user.id, req.user.full_name || req.user.username]);
    feeRates.clearCache();
    // A lower amount: months from here on whose payments already reach it are now fully paid.
    const rates = await feeRates.rates();
    const open = await query(
      `SELECT id, year, month, amount_paid FROM contribution_parttime WHERE completed = false AND (year::int * 100 + month::int) >= $1`, [year * 100 + month]);
    for (const r of open.rows) {
      if (Number(r.amount_paid) >= feeRates.feeFromRates(rates, r.year, r.month))
        await query(`UPDATE contribution_parttime SET completed = true, updated_at = NOW() WHERE id = $1`, [r.id]);
    }
    await recordAudit({ actor: req.user, action: "contribution.fee_change", entityType: "parttime_fee",
      description: `Changed the Part-Time Teachers monthly amount from ${tzs(before)} to ${tzs(amount)}, starting ${year}-${String(month).padStart(2, "0")}.`,
      metadata: { before, after: amount, year, month }, req });
    res.json({ success: true, message: "Monthly amount saved." });
  } catch (err) { next(err); }
};

module.exports = {
  getPartTimeFee, setPartTimeFee,
  getPartTime, payPartTime, payPartTimeAdvance, getPartTimeSummary, getPartTimeHistory, receiptPartTime,
  getPartTimeStudents, getPartTimeStudentEntries, getContributedStudentsCount, getPartTimeDaily,
  getReam, getReamSummary, getOtherExpenses, updateChargeAmount, receiptCharge,
  getReamMyClass, markReam, exportPartTimeStudentsPdf,
};
