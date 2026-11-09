const { query } = require("../db/db");
const { tzColumn, formatTZ } = require("../utils/tz");
const PDFDocument = require("pdfkit");
const { drawLetterhead, drawFooter, drawTableGrid } = require("../utils/pdfHeader");

const fullNameOf = (s) => [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");

// Every role that can reach this module (admin/second_master/food_teacher)
// sees every class - class_teacher is blocked at the route level
// (routes/food.js) and never reaches these controllers. This always
// returns null ("no restriction"); kept as a function for parity with
// classScopeFor in contributionsController.js, where class_teacher access
// still applies.
const classScopeFor = (req) => {
  const roles = req.user.roles && req.user.roles.length ? req.user.roles : [req.user.role];
  const isOverseer = roles.some((r) => ["admin", "second_master", "food_teacher"].includes(r));
  if (isOverseer) return null;
  return req.user.class_teacher_of ? [req.user.class_teacher_of] : [];
};

// The 8 physical items collected - mahindi/mchele/mafuta plus chumvi and the
// 4 vegetable types, each written in Swahili exactly as the school names them.
const TYPES = [
  { key: "maize",       label: "MAHINDI",            unit: "KG" },
  { key: "rice",        label: "MCHELE",              unit: "KG" },
  { key: "cooking_oil", label: "MAFUTA YA KUPIKIA",   unit: "LITRES" },
  { key: "salt",        label: "CHUMVI",              unit: "KG" },
  { key: "njugu",       label: "NJUGU",               unit: "KG" },
  { key: "maharage",    label: "MAHARAGE",            unit: "KG" },
  { key: "mbaazi",      label: "MBAAZI",              unit: "KG" },
  { key: "kunde",       label: "KUNDE",               unit: "KG" },
];
const TYPE_KEYS = TYPES.map((t) => t.key);

// GET /api/food/types - lets the frontend build its type picker / units from
// one source of truth instead of duplicating the list.
const getTypes = (_req, res) => res.json({ success: true, data: TYPES });

// GET /api/food/students?category=boarding|day&year=
// Whether a student is "boarding" is resolved live against hostel_occupants
// (is_active = true means they're currently living in a hostel), so it
// always reflects their current status. For each student we return the
// TOTAL quantity of each type they've brought so far this year - each
// total is the sum of every individual installment, however many there
// were.
const getStudents = async (req, res, next) => {
  try {
    const { category, year = new Date().getFullYear().toString() } = req.query;
    if (!category || !["boarding", "day"].includes(category))
      return res.status(400).json({ success: false, message: "category must be 'boarding' or 'day'." });

    const boardingFilter = category === "boarding"
      ? "EXISTS (SELECT 1 FROM hostel_occupants o WHERE o.student_id = s.id AND o.is_active = true)"
      : "NOT EXISTS (SELECT 1 FROM hostel_occupants o WHERE o.student_id = s.id AND o.is_active = true)";

    const scope = classScopeFor(req);
    if (scope && scope.length === 0)
      return res.json({ success: true, data: [], category, types: TYPES, message: "You have no class assigned yet - ask the Head Master to assign your class in User Accounts." });

    const params = [year];
    let scopeFilter = "";
    if (scope) { params.push(scope); scopeFilter = `AND s.form = ANY($${params.length}::text[])`; }

    const result = await query(`
      SELECT s.id AS student_id, s.reg_no, s.first_name, s.middle_name, s.last_name, s.form,
        COALESCE(
          (SELECT json_object_agg(t.contribution_type, t.total)
           FROM (
             SELECT contribution_type, SUM(quantity) AS total
             FROM food_contribution_entries
             WHERE student_id = s.id AND year = $1
             GROUP BY contribution_type
           ) t),
          '{}'
        ) AS totals,
        (SELECT COUNT(*) FROM food_contribution_entries WHERE student_id = s.id AND year = $1) AS entry_count
      FROM students s
      WHERE s.status = 'Active' AND ${boardingFilter} ${scopeFilter}
      ORDER BY s.form, s.gender ASC, LOWER(s.first_name) ASC, LOWER(s.middle_name) ASC, LOWER(s.last_name) ASC
    `, params);

    res.json({ success: true, data: result.rows, category, types: TYPES });
  } catch (err) { next(err); }
};

// POST /api/food/:studentId  { category, contribution_type, quantity, year }
// Always INSERTS a new row - never overwrites a previous one - so a
// student who brings the same item in several installments (today 3kg of
// Njugu, next month 2kg more) keeps every installment as its own dated
// entry. That's what makes History show every collection date
// automatically, with no manual date typing.
const addEntry = async (req, res, next) => {
  try {
    const { category, contribution_type, quantity, year } = req.body;
    const studentId = req.params.studentId;
    if (!category || !contribution_type || quantity === undefined || !year)
      return res.status(400).json({ success: false, message: "category, contribution_type, quantity and year are required." });
    if (!TYPE_KEYS.includes(contribution_type))
      return res.status(400).json({ success: false, message: "Invalid contribution_type." });
    if (!(Number(quantity) > 0))
      return res.status(400).json({ success: false, message: "Quantity must be greater than zero." });

    const studentRes = await query("SELECT * FROM students WHERE id = $1", [studentId]);
    if (!studentRes.rows.length) return res.status(404).json({ success: false, message: "Student not found." });
    const student = studentRes.rows[0];

    const result = await query(`
      INSERT INTO food_contribution_entries (student_id, category, contribution_type, quantity, year, recorded_by)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [studentId, category, contribution_type, Number(quantity), year, req.user?.id || null]);

    const typeInfo = TYPES.find((t) => t.key === contribution_type);
    res.status(201).json({
      success: true,
      data: result.rows[0],
      student: { id: student.id, name: fullNameOf(student) },
      message: `Submitted successfully - ${Number(quantity)} ${typeInfo.unit} of ${typeInfo.label} recorded for ${fullNameOf(student)}.`,
    });
  } catch (err) { next(err); }
};

// DELETE /api/food/entry/:id - remove a mistaken entry (Head Master /
// Second Master / Food Teacher only, enforced at the route level).
const deleteEntry = async (req, res, next) => {
  try {
    const result = await query(`DELETE FROM food_contribution_entries WHERE id = $1 RETURNING *`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Entry not found." });
    res.json({ success: true, message: "Entry removed." });
  } catch (err) { next(err); }
};

// GET /api/food/student/:studentId/entries?year= - every individual
// installment for ONE student this year, most recent first. This is what
// powers "show me all 5 times this student brought Njugu, with dates" -
// the dates come straight from created_at, automatically.
const getStudentEntries = async (req, res, next) => {
  try {
    const { year = new Date().getFullYear().toString() } = req.query;

    // classScopeFor always returns null here (no restriction) - every role
    // that can reach this module sees every class; class_teacher is blocked
    // at the route level and never gets here.
    const scope = classScopeFor(req);
    if (scope) {
      const studentRes = await query("SELECT form FROM students WHERE id = $1", [req.params.studentId]);
      if (!studentRes.rows.length) return res.status(404).json({ success: false, message: "Student not found." });
      if (!scope.includes(studentRes.rows[0].form))
        return res.status(403).json({ success: false, message: "You can only view history for your own class." });
    }

    const result = await query(`
      SELECT fe.*, u.full_name AS recorded_by_name
      FROM food_contribution_entries fe
      LEFT JOIN users u ON u.id = fe.recorded_by
      WHERE fe.student_id = $1 AND fe.year = $2
      ORDER BY fe.created_at DESC
    `, [req.params.studentId, year]);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// GET /api/food/history?year=&form=&category=&contribution_type= - full,
// dated log of every installment collected - who, what, how much, when
// (created_at), and who recorded it. Because every submission is its own
// row, a student who contributed 10 separate times shows as 10 separate
// dated rows here with zero manual date entry required.
const getHistory = async (req, res, next) => {
  try {
    const { year = new Date().getFullYear().toString(), form, category, contribution_type } = req.query;
    const conditions = ["fe.year = $1"];
    const params = [year];
    const scope = classScopeFor(req);
    if (scope && scope.length === 0)
      return res.json({ success: true, data: [], types: TYPES, message: "You have no class assigned yet - ask the Head Master to assign your class in User Accounts." });
    if (scope) { params.push(scope); conditions.push(`s.form = ANY($${params.length}::text[])`); }
    else if (form) { params.push(form); conditions.push(`s.form = $${params.length}`); }
    if (category) { params.push(category); conditions.push(`fe.category = $${params.length}`); }
    if (contribution_type) { params.push(contribution_type); conditions.push(`fe.contribution_type = $${params.length}`); }

    const result = await query(`
      SELECT fe.id, fe.contribution_type, fe.quantity, fe.category, fe.created_at,
             s.form, s.first_name, s.middle_name, s.last_name,
             u.full_name AS recorded_by_name
      FROM food_contribution_entries fe
      JOIN students s ON s.id = fe.student_id
      LEFT JOIN users u ON u.id = fe.recorded_by
      WHERE ${conditions.join(" AND ")}
      ORDER BY fe.created_at DESC
    `, params);
    res.json({ success: true, data: result.rows, types: TYPES });
  } catch (err) { next(err); }
};

// GET /api/food/history/students?year=&form=&category= - one row per
// STUDENT who has contributed (not one row per installment), with a total
// entry count and their most recent contribution date. This is what the
// History tab lists first - picking a student then loads only THEIR
// entries (getStudentEntries below), instead of dumping every single
// installment from every student in one giant list.
const getHistoryStudents = async (req, res, next) => {
  try {
    const { year = new Date().getFullYear().toString(), form, category } = req.query;
    const conditions = ["fe.year = $1"];
    const params = [year];
    const scope = classScopeFor(req);
    if (scope && scope.length === 0)
      return res.json({ success: true, data: [], message: "You have no class assigned yet - ask the Head Master to assign your class in User Accounts." });
    if (scope) { params.push(scope); conditions.push(`s.form = ANY($${params.length}::text[])`); }
    else if (form) { params.push(form); conditions.push(`s.form = $${params.length}`); }
    if (category) {
      conditions.push(category === "boarding"
        ? `EXISTS (SELECT 1 FROM hostel_occupants o WHERE o.student_id = s.id AND o.is_active = true)`
        : `NOT EXISTS (SELECT 1 FROM hostel_occupants o WHERE o.student_id = s.id AND o.is_active = true)`);
    }

    const result = await query(`
      SELECT s.id AS student_id, s.first_name, s.middle_name, s.last_name, s.form,
             COUNT(fe.id) AS entry_count, MAX(fe.created_at) AS last_date,
             EXISTS (SELECT 1 FROM hostel_occupants o WHERE o.student_id = s.id AND o.is_active = true) AS is_boarding
      FROM students s
      JOIN food_contribution_entries fe ON fe.student_id = s.id
      WHERE ${conditions.join(" AND ")}
      GROUP BY s.id, s.first_name, s.middle_name, s.last_name, s.form
      ORDER BY MAX(fe.created_at) DESC
    `, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// GET /api/food/daily?date=YYYY-MM-DD&form=&category= - every individual
// food contribution recorded on ONE specific day (in Tanzania local time),
// plus the day's total items and how many students contributed that day.
// admin/second_master/food_teacher may optionally narrow to one class with
// ?form=, or leave it off to see every class for that day. class_teacher
// never reaches this endpoint (blocked at the route level).
const getFoodDaily = async (req, res, next) => {
  try {
    const { date, form, category } = req.query;
    if (!date) return res.status(400).json({ success: false, message: "date is required (YYYY-MM-DD)." });

    let scope = classScopeFor(req);
    if (scope && scope.length === 0)
      return res.json({ success: true, data: [], students_contributed: 0, message: "You have no class assigned yet - ask the Head Master to assign your class in User Accounts." });
    if (!scope && form) scope = [form];

    const params = [date];
    const conditions = [`(fe.created_at AT TIME ZONE 'Africa/Dar_es_Salaam')::date = $1::date`];
    if (scope) { params.push(scope); conditions.push(`s.form = ANY($${params.length}::text[])`); }
    if (category) { params.push(category); conditions.push(`fe.category = $${params.length}`); }

    const result = await query(`
      SELECT fe.id, fe.student_id, fe.contribution_type, fe.quantity, fe.category,
             s.first_name, s.middle_name, s.last_name, s.form,
             u.full_name AS recorded_by_name,
             ${tzColumn("fe.created_at", "created_at_tz")}
      FROM food_contribution_entries fe
      JOIN students s ON s.id = fe.student_id
      LEFT JOIN users u ON u.id = fe.recorded_by
      WHERE ${conditions.join(" AND ")}
      ORDER BY fe.created_at ASC
    `, params);

    const studentsContributed = new Set(result.rows.map((r) => r.student_id)).size;
    res.json({ success: true, data: result.rows, students_contributed: studentsContributed, types: TYPES });
  } catch (err) { next(err); }
};

// GET /api/food/students/pdf?category=boarding|day&year= - printable version
// of the Boarding/Day Students list: every student's name and class, plus
// how many kg/litres of EACH item they've brought so far this year, and a
// grand-total row summing every item across the whole list.
const exportStudentsPdf = async (req, res, next) => {
  try {
    const { category, year = new Date().getFullYear().toString() } = req.query;
    if (!category || !["boarding", "day"].includes(category))
      return res.status(400).json({ success: false, message: "category must be 'boarding' or 'day'." });

    const boardingFilter = category === "boarding"
      ? "EXISTS (SELECT 1 FROM hostel_occupants o WHERE o.student_id = s.id AND o.is_active = true)"
      : "NOT EXISTS (SELECT 1 FROM hostel_occupants o WHERE o.student_id = s.id AND o.is_active = true)";

    const scope = classScopeFor(req);
    if (scope && scope.length === 0)
      return res.status(400).json({ success: false, message: "You have no class assigned yet - ask the Head Master to assign your class in User Accounts." });

    const params = [year];
    let scopeFilter = "";
    if (scope) { params.push(scope); scopeFilter = `AND s.form = ANY($${params.length}::text[])`; }

    const result = await query(`
      SELECT s.id AS student_id, s.first_name, s.middle_name, s.last_name, s.form,
        COALESCE(
          (SELECT json_object_agg(t.contribution_type, t.total)
           FROM (
             SELECT contribution_type, SUM(quantity) AS total
             FROM food_contribution_entries
             WHERE student_id = s.id AND year = $1
             GROUP BY contribution_type
           ) t),
          '{}'
        ) AS totals
      FROM students s
      WHERE s.status = 'Active' AND ${boardingFilter} ${scopeFilter}
      ORDER BY s.form, s.last_name, s.first_name
    `, params);

    // Grand total per item type across every student in this list - the
    // "idadi ya jumla ya kilo/litres alizotoa kwenye kila mahitaji" figure.
    const grand = {};
    TYPES.forEach((t) => { grand[t.key] = 0; });
    result.rows.forEach((s) => TYPES.forEach((t) => { grand[t.key] += Number(s.totals?.[t.key] || 0); }));

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="food-contributions-${category}-${year}.pdf"`);
    const doc = new PDFDocument({ margin: 24, size: "A4", layout: "landscape", bufferPages: true });
    doc.pipe(res);
    drawLetterhead(doc, `Food Contributions - ${category === "boarding" ? "Boarding" : "Day"} Students (${year})`);

    const left = doc.page.margins.left;
    const nameW = 150, formW = 55;
    const itemW = (doc.page.width - doc.page.margins.left - doc.page.margins.right - nameW - formW) / TYPES.length;
    const tableWidth = nameW + formW + itemW * TYPES.length;
    const colX = [left, left + nameW, ...TYPES.map((_, i) => left + nameW + formW + itemW * i)];
    const headers = ["Full Name", "Class", ...TYPES.map((t) => `${t.label} (${t.unit === "LITRES" ? "L" : "kg"})`)];

    const drawHeaderRow = (y) => {
      doc.rect(left, y, tableWidth, 24).fill("#334155");
      doc.fillColor("#FFFFFF").fontSize(6.5).font("Helvetica-Bold");
      headers.forEach((h, i) => doc.text(h, colX[i] + 3, y + 7, { width: (colX[i + 1] || left + tableWidth) - colX[i] - 5 }));
      return y + 24;
    };

    const tableTop = doc.y;
    let y = drawHeaderRow(tableTop);
    const rowYs = [tableTop, y]; // every row boundary on the CURRENT page, header included
    doc.font("Helvetica");
    result.rows.forEach((s, idx) => {
      if (y > 500) {
        drawTableGrid(doc, colX, left + tableWidth, rowYs); // close out this page's grid before starting a new one
        doc.addPage({ margin: 24, size: "A4", layout: "landscape" });
        y = drawHeaderRow(30);
        rowYs.length = 0; rowYs.push(30, y);
      }
      if (idx % 2 === 0) doc.rect(left, y, tableWidth, 16).fill("#F8FAFC");
      const vals = [fullNameOf(s), s.form, ...TYPES.map((t) => { const v = Number(s.totals?.[t.key] || 0); return v > 0 ? String(v) : "-"; })];
      vals.forEach((v, i) => doc.fontSize(7).fillColor("#0F172A").text(String(v), colX[i] + 3, y + 4, { width: (colX[i + 1] || left + tableWidth) - colX[i] - 5 }));
      y += 16;
      rowYs.push(y);
    });
    drawTableGrid(doc, colX, left + tableWidth, rowYs);

    // Grand total row - total kg/litres of each item collected across this
    // whole list, drawn as its own highlighted row right under the table.
    doc.rect(left, y, tableWidth, 20).fill("#EAF0FF");
    doc.fontSize(7).font("Helvetica-Bold").fillColor("#153810");
    const totalsRow = ["GRAND TOTAL", "", ...TYPES.map((t) => `${grand[t.key]} ${t.unit === "LITRES" ? "L" : "kg"}`)];
    totalsRow.forEach((v, i) => doc.text(v, colX[i] + 3, y + 6, { width: (colX[i + 1] || left + tableWidth) - colX[i] - 5 }));
    drawTableGrid(doc, colX, left + tableWidth, [y, y + 20]);
    doc.y = y + 24;

    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

module.exports = { getTypes, getStudents, addEntry, deleteEntry, getStudentEntries, getHistory, getHistoryStudents, getFoodDaily, exportStudentsPdf, TYPES };
