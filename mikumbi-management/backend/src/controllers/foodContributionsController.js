const { query } = require("../db/db");
const { tzColumn, formatTZ } = require("../utils/tz");
const PDFDocument = require("pdfkit");
const { drawLetterhead, drawFooter, drawTableGrid } = require("../utils/pdfHeader");
const { allFoodTypes, activeFoodTypes, clearFoodTypesCache, unitShort } = require("../utils/foodTypes");
const { recordAudit } = require("../utils/auditLogger");

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


// GET /api/food/types - lets the frontend build its type picker / units from
// one source of truth instead of duplicating the list.
// ?all=1 (Head Master / Second Master): hidden types too, with how many
// entries use each one, for the "Food Types" manager.
const getTypes = async (req, res, next) => {
  try {
    const roles = req.user.roles && req.user.roles.length ? req.user.roles : [req.user.role];
    const manager = roles.some((r) => r === "admin" || r === "second_master");
    if (req.query.all && manager) {
      const types = await allFoodTypes();
      const used = await query(`SELECT contribution_type, COUNT(*)::int AS n FROM food_contribution_entries GROUP BY contribution_type`);
      const counts = Object.fromEntries(used.rows.map((r) => [r.contribution_type, r.n]));
      return res.json({ success: true, data: types.map((t) => ({ ...t, used: counts[t.key] || 0 })) });
    }
    res.json({ success: true, data: await activeFoodTypes() });
  } catch (err) { next(err); }
};

const FOOD_UNITS = ["KG", "LITRES", "PIECES"];
const cleanLabel = (v) => String(v || "").replace(/\s+/g, " ").trim().toUpperCase();
// Required amount per student per year: empty/0 = none; otherwise 0.1-100000.
const parseRequired = (v) => {
  if (v === undefined) return undefined;
  if (v === null || v === "" || Number(v) === 0) return null;
  const n = Math.round(Number(v) * 100) / 100;
  return Number.isFinite(n) && n > 0 && n <= 100000 ? n : NaN;
};

// POST /api/food/types { label, unit } - new type, added at the end of the list.
const createType = async (req, res, next) => {
  try {
    const label = cleanLabel(req.body.label);
    const unit = String(req.body.unit || "KG").toUpperCase();
    if (label.length < 2 || label.length > 60) return res.status(400).json({ success: false, message: "Food name must be 2-60 characters." });
    if (!FOOD_UNITS.includes(unit)) return res.status(400).json({ success: false, message: "Invalid unit." });
    const required = parseRequired(req.body.required_qty) ?? null;
    if (Number.isNaN(required)) return res.status(400).json({ success: false, message: "The required amount must be a number greater than zero." });
    const clash = await query(`SELECT id FROM food_types WHERE UPPER(label) = $1`, [label]);
    if (clash.rows.length) return res.status(409).json({ success: false, message: "That food type already exists." });
    // The stored key never changes, even if the name is edited later.
    let base = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "food";
    let key = base; let n = 2;
    while ((await query(`SELECT 1 FROM food_types WHERE key = $1`, [key])).rows.length) key = `${base}_${n++}`;
    const { rows } = await query(
      `INSERT INTO food_types (key, label, unit, required_qty, sort_order) VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM food_types))
       RETURNING id, key, label, unit, sort_order, is_active, required_qty::float AS required_qty`, [key, label, unit, required]);
    clearFoodTypesCache();
    await recordAudit({ actor: req.user, action: "food.type_add", entityType: "food_type", entityId: rows[0].id,
      description: `Added food type ${label} (${unit})${required ? `, ${required} ${unitShort(unit)} per student` : ""}.`, metadata: { key, unit, required_qty: required }, req });
    res.status(201).json({ success: true, data: rows[0], message: "Food type added." });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ success: false, message: "That food type already exists." });
    next(err);
  }
};

// PATCH /api/food/types/:id { label?, unit?, is_active? }
const updateType = async (req, res, next) => {
  try {
    const cur = await query(`SELECT * FROM food_types WHERE id = $1`, [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ success: false, message: "Food type not found." });
    const before = cur.rows[0];
    const label = req.body.label !== undefined ? cleanLabel(req.body.label) : before.label;
    const unit = req.body.unit !== undefined ? String(req.body.unit).toUpperCase() : before.unit;
    const isActive = req.body.is_active !== undefined ? !!req.body.is_active : before.is_active;
    const reqIn = parseRequired(req.body.required_qty);
    if (Number.isNaN(reqIn)) return res.status(400).json({ success: false, message: "The required amount must be a number greater than zero." });
    const required = reqIn === undefined ? (before.required_qty === null ? null : Number(before.required_qty)) : reqIn;
    if (label.length < 2 || label.length > 60) return res.status(400).json({ success: false, message: "Food name must be 2-60 characters." });
    if (!FOOD_UNITS.includes(unit)) return res.status(400).json({ success: false, message: "Invalid unit." });
    if (unit !== before.unit) {
      // Changing kg <-> litres would make every quantity already recorded wrong.
      const used = await query(`SELECT 1 FROM food_contribution_entries WHERE contribution_type = $1 LIMIT 1`, [before.key]);
      if (used.rows.length) return res.status(400).json({ success: false, message: "The unit cannot be changed: contributions are already recorded for this food." });
    }
    if (!isActive && before.is_active) {
      const left = await query(`SELECT COUNT(*)::int AS n FROM food_types WHERE is_active AND id <> $1`, [before.id]);
      if (!left.rows[0].n) return res.status(400).json({ success: false, message: "At least one food type must stay visible." });
    }
    const { rows } = await query(
      `UPDATE food_types SET label = $1, unit = $2, is_active = $3, required_qty = $4 WHERE id = $5
       RETURNING id, key, label, unit, sort_order, is_active, required_qty::float AS required_qty`,
      [label, unit, isActive, required, before.id]);
    clearFoodTypesCache();
    const changes = [];
    if (label !== before.label) changes.push(`name ${before.label} -> ${label}`);
    if (unit !== before.unit) changes.push(`unit ${before.unit} -> ${unit}`);
    if (isActive !== before.is_active) changes.push(isActive ? "shown again" : "hidden");
    const oldReq = before.required_qty === null ? null : Number(before.required_qty);
    if (oldReq !== required) changes.push(`required amount ${oldReq ?? "none"} -> ${required ?? "none"} ${unitShort(unit)}`);
    if (changes.length) await recordAudit({ actor: req.user, action: "food.type_edit", entityType: "food_type", entityId: before.id,
      description: `Edited food type ${before.label}: ${changes.join(", ")}.`, req });
    res.json({ success: true, data: rows[0], message: "Food type updated." });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ success: false, message: "That food type already exists." });
    next(err);
  }
};

// PUT /api/food/types/order { ids: [3, 1, 2, ...] } - the new display order.
const reorderTypes = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number) : [];
    const { rows } = await query(`SELECT id FROM food_types`);
    const all = rows.map((r) => r.id).sort((a, b) => a - b);
    if (ids.length !== all.length || [...ids].sort((a, b) => a - b).some((id, i) => id !== all[i]))
      return res.status(400).json({ success: false, message: "The list has changed - please refresh and try again." });
    await query(`UPDATE food_types t SET sort_order = o.pos FROM unnest($1::int[]) WITH ORDINALITY AS o(id, pos) WHERE t.id = o.id`, [ids]);
    clearFoodTypesCache();
    await recordAudit({ actor: req.user, action: "food.type_reorder", entityType: "food_type", description: "Changed the order of the food types.", req });
    res.json({ success: true, message: "Order saved." });
  } catch (err) { next(err); }
};

// DELETE /api/food/types/:id - only a type nothing was recorded for yet.
const deleteType = async (req, res, next) => {
  try {
    const cur = await query(`SELECT * FROM food_types WHERE id = $1`, [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ success: false, message: "Food type not found." });
    const t = cur.rows[0];
    const used = await query(`SELECT 1 FROM food_contribution_entries WHERE contribution_type = $1 LIMIT 1`, [t.key]);
    if (used.rows.length) return res.status(409).json({ success: false, message: "Contributions are already recorded for this food, so it cannot be deleted. Hide it instead." });
    const left = await query(`SELECT COUNT(*)::int AS n FROM food_types WHERE is_active AND id <> $1`, [t.id]);
    if (t.is_active && !left.rows[0].n) return res.status(400).json({ success: false, message: "At least one food type must stay visible." });
    await query(`DELETE FROM food_types WHERE id = $1`, [t.id]);
    clearFoodTypesCache();
    await recordAudit({ actor: req.user, action: "food.type_delete", entityType: "food_type", entityId: t.id, description: `Deleted food type ${t.label}.`, req });
    res.json({ success: true, message: "Food type deleted." });
  } catch (err) { next(err); }
};

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
      return res.json({ success: true, data: [], category, types: await activeFoodTypes(), message: "You have no class assigned yet - ask the Head Master to assign your class." });

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

    res.json({ success: true, data: result.rows, category, types: await activeFoodTypes() });
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
    const typeInfo = (await activeFoodTypes()).find((t) => t.key === contribution_type);
    if (!typeInfo)
      return res.status(400).json({ success: false, message: "Invalid contribution_type." });
    if (!["boarding", "day"].includes(category))
      return res.status(400).json({ success: false, message: "Category must be Boarding or Day." });
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0)
      return res.status(400).json({ success: false, message: "Quantity must be greater than zero." });
    // One delivery by one student - anything above this is a typing slip
    // (e.g. 5000000 instead of 5), which used to be saved and wreck totals.
    if (qty > 1000)
      return res.status(400).json({ success: false, message: "Quantity looks too large for one contribution (maximum 1000). Please check the number." });
    const yearNum = Number(year);
    const nowYear = new Date().getFullYear();
    if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > nowYear + 1)
      return res.status(400).json({ success: false, message: "Invalid year." });

    const studentRes = await query(
      `SELECT s.*, EXISTS (SELECT 1 FROM hostel_occupants o WHERE o.student_id = s.id AND o.is_active = true) AS in_hostel
       FROM students s WHERE s.id = $1`, [studentId]);
    if (!studentRes.rows.length) return res.status(404).json({ success: false, message: "Student not found." });
    const student = studentRes.rows[0];
    // Only current students, and in the list they actually belong to:
    // Boarding = has an active hostel place, Day = doesn't. A wrong pick
    // used to file a day student's food under Boarding (and vice versa).
    if (student.status !== "Active")
      return res.status(400).json({ success: false, message: `${fullNameOf(student)} is not an active student (status: ${student.status}).` });
    if ((category === "boarding") !== !!student.in_hostel)
      return res.status(400).json({ success: false, message: `${fullNameOf(student)} is a ${student.in_hostel ? "Boarding" : "Day"} student - record this under ${student.in_hostel ? "Boarding" : "Day"}.` });

    // With a required amount set, the student cannot be recorded for more
    // than what is still owed (a typing slip would otherwise hide a debt).
    let given = 0;
    if (typeInfo.required_qty) {
      const g = await query(`SELECT COALESCE(SUM(quantity), 0)::float AS g FROM food_contribution_entries WHERE student_id = $1 AND year = $2 AND contribution_type = $3`,
        [studentId, String(yearNum), contribution_type]);
      given = g.rows[0].g;
      const left = Math.round((typeInfo.required_qty - given) * 100) / 100;
      if (left <= 0)
        return res.status(400).json({ success: false, message: `${fullNameOf(student)} has already completed ${typeInfo.label} for ${yearNum} (${typeInfo.required_qty} ${unitShort(typeInfo.unit)}).` });
      if (qty > left + 1e-9)
        return res.status(400).json({ success: false, message: `${fullNameOf(student)} only owes ${left} ${unitShort(typeInfo.unit)} of ${typeInfo.label} - the amount entered is more than that.` });
    }

    const result = await query(`
      INSERT INTO food_contribution_entries (student_id, category, contribution_type, quantity, year, recorded_by)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [studentId, category, contribution_type, qty, String(yearNum), req.user?.id || null]);

    res.status(201).json({
      success: true,
      data: result.rows[0],
      student: { id: student.id, name: fullNameOf(student) },
      message: typeInfo.required_qty
        ? (given + qty >= typeInfo.required_qty - 1e-9
          ? `Submitted successfully - ${fullNameOf(student)} has now COMPLETED ${typeInfo.label} (${typeInfo.required_qty} ${unitShort(typeInfo.unit)}).`
          : `Submitted successfully - ${qty} ${unitShort(typeInfo.unit)} of ${typeInfo.label} recorded for ${fullNameOf(student)}. Still owes ${Math.round((typeInfo.required_qty - given - qty) * 100) / 100} ${unitShort(typeInfo.unit)}.`)
        : `Submitted successfully - ${qty} ${typeInfo.unit} of ${typeInfo.label} recorded for ${fullNameOf(student)}.`,
    });
  } catch (err) { next(err); }
};

// DELETE /api/food/entry/:id - remove a mistaken entry (Head Master /
// Second Master / Food Teacher only, enforced at the route level).
const deleteEntry = async (req, res, next) => {
  try {
    const result = await query(`DELETE FROM food_contribution_entries WHERE id = $1 RETURNING *`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Entry not found." });
    const e = result.rows[0];
    const t = (await allFoodTypes()).find((x) => x.key === e.contribution_type);
    const st = await query(`SELECT first_name, middle_name, last_name, form FROM students WHERE id = $1`, [e.student_id]);
    await recordAudit({ actor: req.user, action: "food.entry_delete", entityType: "student", entityId: e.student_id,
      description: `Removed a food contribution: ${Number(e.quantity)} ${unitShort(t?.unit)} of ${t?.label || e.contribution_type} for ${st.rows[0] ? `${fullNameOf(st.rows[0])} (${st.rows[0].form})` : "a student"} (${e.year}).`,
      metadata: { entry_id: e.id, quantity: Number(e.quantity), type: e.contribution_type, category: e.category, recorded_at: e.created_at }, req });
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
      return res.json({ success: true, data: [], types: await activeFoodTypes(), message: "You have no class assigned yet - ask the Head Master to assign your class." });
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
    res.json({ success: true, data: result.rows, types: await allFoodTypes() });
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
      return res.json({ success: true, data: [], message: "You have no class assigned yet - ask the Head Master to assign your class." });
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
      return res.json({ success: true, data: [], students_contributed: 0, message: "You have no class assigned yet - ask the Head Master to assign your class." });
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
    res.json({ success: true, data: result.rows, students_contributed: studentsContributed, types: await allFoodTypes() });
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
      return res.status(400).json({ success: false, message: "You have no class assigned yet - ask the Head Master to assign your class." });

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
    // Columns: the visible types, plus any hidden type that still has
    // quantities in this list (so nothing recorded disappears from the PDF).
    const TYPES = (await allFoodTypes()).filter((t) => t.is_active || result.rows.some((r) => Number(r.totals?.[t.key] || 0) > 0));
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
    const headers = ["Full Name", "Class", ...TYPES.map((t) => `${t.label} (${unitShort(t.unit)})`)];

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
    const totalsRow = ["GRAND TOTAL", "", ...TYPES.map((t) => `${grand[t.key]} ${unitShort(t.unit)}`)];
    totalsRow.forEach((v, i) => doc.text(v, colX[i] + 3, y + 6, { width: (colX[i + 1] || left + tableWidth) - colX[i] - 5 }));
    drawTableGrid(doc, colX, left + tableWidth, [y, y + 20]);
    doc.y = y + 24;

    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

// ── Completed / owing per food type ────────────────────────────────────────
// For one food type with a required amount (e.g. MAHINDI 30 kg): every
// active student, how much they brought this year, how much is left, and
// whether they have completed. ?status=completed|owing narrows the list.
async function foodStatusRows(q) {
  const year = String(Number(q.year) || new Date().getFullYear());
  const type = (await allFoodTypes()).find((t) => t.key === q.type);
  if (!type) { const e = new Error("Choose a food type."); e.status = 400; throw e; }
  if (!type.required_qty) { const e = new Error(`${type.label} has no required amount yet - the Head Master or Second Master can set it under Food Types.`); e.status = 400; throw e; }
  const params = [year, type.key];
  const cond = ["s.status = 'Active'"];
  if (q.form) { params.push(String(q.form)); cond.push(`s.form = $${params.length}`); }
  const inHostel = "EXISTS (SELECT 1 FROM hostel_occupants o WHERE o.student_id = s.id AND o.is_active = true)";
  if (q.category === "boarding") cond.push(inHostel);
  if (q.category === "day") cond.push(`NOT ${inHostel}`);
  const { rows } = await query(`
    SELECT s.id AS student_id, s.first_name, s.middle_name, s.last_name, s.form, ${inHostel} AS boarding,
      COALESCE((SELECT SUM(quantity) FROM food_contribution_entries e WHERE e.student_id = s.id AND e.year = $1 AND e.contribution_type = $2), 0)::float AS given
    FROM students s WHERE ${cond.join(" AND ")}
    ORDER BY s.form, s.gender ASC, LOWER(s.first_name), LOWER(s.middle_name), LOWER(s.last_name)`, params);
  const req = type.required_qty;
  let list = rows.map((r) => {
    const remaining = Math.max(Math.round((req - r.given) * 100) / 100, 0);
    return { student_id: r.student_id, name: fullNameOf(r), form: r.form, category: r.boarding ? "boarding" : "day",
      given: r.given, required: req, remaining, completed: remaining <= 0 };
  });
  const summary = { total: list.length, completed: list.filter((r) => r.completed).length,
    owing: list.filter((r) => !r.completed).length, total_owed: Math.round(list.reduce((a, r) => a + r.remaining, 0) * 100) / 100 };
  if (q.status === "completed") list = list.filter((r) => r.completed);
  if (q.status === "owing") list = list.filter((r) => !r.completed);
  return { type, year, list, summary };
}

// GET /api/food/status?year=&type=&category=&form=&status=
const getFoodStatus = async (req, res, next) => {
  try {
    const { type, year, list, summary } = await foodStatusRows(req.query);
    res.json({ success: true, type, year, data: list, summary });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
};

// GET /api/food/status/pdf - the same list as a PDF (completed or owing names).
const exportFoodStatusPdf = async (req, res, next) => {
  try {
    const { type, year, list, summary } = await foodStatusRows(req.query);
    const u = unitShort(type.unit);
    const which = req.query.status === "completed" ? "Completed" : req.query.status === "owing" ? "Still Owing" : "All Students";
    const scopeText = [req.query.form, req.query.category === "boarding" ? "Boarding" : req.query.category === "day" ? "Day" : null].filter(Boolean).join(" - ");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${type.key}-${which.toLowerCase().replace(/ /g, "-")}-${year}.pdf"`);
    const doc = new PDFDocument({ margin: 30, size: "A4", bufferPages: true });
    doc.pipe(res);
    drawLetterhead(doc, `${type.label} (${type.required_qty} ${u} per student) - ${which} - ${year}${scopeText ? ` - ${scopeText}` : ""}`);
    doc.fontSize(9).font("Helvetica").fillColor("#0F172A")
      .text(`Completed: ${summary.completed}   Still owing: ${summary.owing}   Total still owed: ${summary.total_owed} ${u}`);
    doc.moveDown(0.6);
    const left = doc.page.margins.left;
    const widths = [28, 190, 60, 70, 60, 60, 66];
    const colX = widths.reduce((acc, w) => [...acc, acc[acc.length - 1] + w], [left]);
    const tableW = colX[colX.length - 1] - left;
    const headers = ["#", "Full Name", "Class", "Boarding/Day", `Given (${u})`, `Owes (${u})`, "Status"];
    const head = (y) => {
      doc.rect(left, y, tableW, 20).fill("#334155");
      doc.fillColor("#FFFFFF").fontSize(8).font("Helvetica-Bold");
      headers.forEach((h, i) => doc.text(h, colX[i] + 3, y + 6, { width: widths[i] - 6 }));
      return y + 20;
    };
    let y = head(doc.y);
    let rowYs = [y - 20, y];
    doc.font("Helvetica");
    list.forEach((r, i) => {
      if (y > doc.page.height - 70) {
        drawTableGrid(doc, colX.slice(0, -1), left + tableW, rowYs);
        doc.addPage({ margin: 30, size: "A4" });
        y = head(30); rowYs = [30, y];
      }
      if (i % 2 === 0) doc.rect(left, y, tableW, 16).fill("#F8FAFC");
      const vals = [i + 1, r.name, r.form, r.category === "boarding" ? "Boarding" : "Day", r.given, r.remaining, r.completed ? "COMPLETED" : "OWES"];
      vals.forEach((v, k) => doc.fontSize(8).fillColor(k === 6 ? (r.completed ? "#15803D" : "#B91C1C") : "#0F172A").text(String(v), colX[k] + 3, y + 4, { width: widths[k] - 6 }));
      y += 16; rowYs.push(y);
    });
    if (!list.length) { doc.fontSize(9).fillColor("#64748B").text("No students in this list.", left + 3, y + 4); y += 18; rowYs.push(y); }
    drawTableGrid(doc, colX.slice(0, -1), left + tableW, rowYs);
    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
};

module.exports = { getTypes, createType, updateType, reorderTypes, deleteType, getStudents, addEntry, deleteEntry, getStudentEntries, getHistory, getHistoryStudents, getFoodDaily, exportStudentsPdf, getFoodStatus, exportFoodStatusPdf };
