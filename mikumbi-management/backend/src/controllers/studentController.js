const { query, pool } = require("../db/db");
const PDFDocument = require("pdfkit");
const { formatTZ, tzColumn, todayTZ, dateOnly } = require("../utils/tz");
const { drawLetterhead, drawFooter, drawTableGrid, STUDENT_THEME } = require("../utils/pdfHeader");
const { cloudinaryResized } = require("../middleware/upload");
const { parseRosterFile, normalizeStudentRow, fullNameKey, MAX_IMPORT_ROWS } = require("../utils/studentImport");
const { allFoodTypes } = require("../utils/foodTypes");

// Same light-blue backdrop resultsController.js paints behind the "MATOKEO
// YA JUMLA" table and the Parent Report (there called NECTA_SUMMARY_BG) -
// used here so the Student Profile PDF's School Contributions section
// matches, instead of sitting on plain white.
const NECTA_SUMMARY_BG = "#ADD8E6";

// ── Registration numbering: Female students first, then Male, alphabetical
// (ascending) by name within each gender group - restarted per form (Form I,
// II, III, IV each have their own S4005/0001... sequence). Per spec: even if
// a form has 200 students (150 Female + 50 Male), all 150 Female students
// get their numbers first (in alphabetical order), then the 50 Male students
// follow (also in alphabetical order) - regardless of the order in which
// they were actually entered into the system.
//
// Because new students can be entered in any order, keeping this true means
// re-sequencing the WHOLE form's auto-generated numbers whenever the roster
// changes (add, edit name/gender, remove, or move between forms) - done by
// renumberAutoRegNos() below. Any reg_no that was typed in manually (i.e.
// doesn't match the "S4005/0001" auto pattern) is left completely untouched
// and is skipped when handing out numbers, since it isn't part of the auto
// sequence.
const AUTO_REGNO_RE = /^S4005\/\d{4}$/;
const MONTH_NAMES_SHORT = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const studentSortKey = (s) =>
  [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ").trim().toLowerCase();

// BUG FIX (see history below): renumberAutoRegNos used to run its
// read-then-write cycle through the shared connection pool (`query`),
// picking a different pooled connection for every statement. That's fine
// when only one renumber is happening - but a Head Master registering
// several students for the same form in quick succession fires several
// overlapping requests, each starting its OWN renumber pass. Two passes
// for the SAME form could then interleave: pass A reads a roster snapshot,
// pass B reads a slightly newer snapshot and finishes writing first, then
// pass A's (now stale) writes land on top of B's - silently swapping two
// students' numbers (e.g. 0040/0041) even though the alphabetical logic
// itself was never wrong. It was invisible in testing because it only
// shows up when two registrations for the same form genuinely overlap in
// time.
//
// The fix: hold a Postgres advisory lock, keyed by form name, for the
// ENTIRE read→sort→write cycle, on one dedicated connection. A second
// renumber for the same form now simply waits its turn instead of racing.
// When promoteStudents() hands us its own transaction client (`run`
// bound to that client), we reuse THAT connection for the lock instead of
// opening a new one - the lock still has to live on whichever single
// connection does the reading and writing, or it doesn't protect anything.
const renumberAutoRegNos = async (form, run = null) => {
  if (!form) return;
  const ownsClient = !run;
  const client = ownsClient ? await pool.connect() : null;
  const exec = ownsClient ? (text, params) => client.query(text, params) : run;
  try {
    await exec("SELECT pg_advisory_lock(hashtext($1))", [form]);
    try {
      const { rows } = await exec(
        `SELECT id, reg_no, first_name, middle_name, last_name, gender FROM students WHERE form = $1`,
        [form]
      );
      const auto = rows.filter((s) => !s.reg_no || AUTO_REGNO_RE.test(s.reg_no));
      auto.sort((a, b) => {
        if (a.gender !== b.gender) return a.gender === "Female" ? -1 : 1;
        return studentSortKey(a).localeCompare(studentSortKey(b));
      });
      // Two-phase update: a straight "set new reg_no" loop can collide mid-way
      // (e.g. student A's new number is the one student B currently holds, and
      // B hasn't been updated yet) - the (form, reg_no) unique index would
      // reject that. Clearing every auto reg_no to NULL first sidesteps this
      // entirely, since the index ignores NULLs.
      const needsUpdate = auto
        .map((s, i) => ({ ...s, newRegNo: `S4005/${String(i + 1).padStart(4, "0")}` }))
        .filter((s) => s.reg_no !== s.newRegNo);
      if (!needsUpdate.length) return;
      for (const s of needsUpdate) {
        await exec(`UPDATE students SET reg_no = NULL WHERE id = $1`, [s.id]);
      }
      for (const s of needsUpdate) {
        await exec(`UPDATE students SET reg_no = $1 WHERE id = $2`, [s.newRegNo, s.id]);
      }
    } finally {
      await exec("SELECT pg_advisory_unlock(hashtext($1))", [form]).catch(() => {});
    }
  } finally {
    if (ownsClient) client.release();
  }
};

// Kept for any other module that just needs "the next number" without a
// full renumber (not used for regular student registration any more).
const genRegNo = async (form) => {
  const r = await query("SELECT COUNT(*) FROM students WHERE form = $1", [form]);
  const seq = parseInt(r.rows[0].count) + 1;
  return `S4005/${String(seq).padStart(4, "0")}`;
};

// ── Permanent Admission Number (Results Portal login credential) ───────────
// reg_no is NOT safe for this: it's form-scoped (so "S4005/0001" exists
// once per form, not once per school) AND renumberAutoRegNos() above
// silently reassigns it every time that form's roster changes - the exact
// same string a parent wrote down can end up pointing at a different
// student a term later. admission_no is the fix: assigned ONCE, right
// after a student is created, from a counter scoped to their admission
// YEAR - and nothing else in this file (or anywhere else) is ever allowed
// to touch it again, so it stays correct for that one student forever,
// through every promotion, edit, or roster change. Same advisory-lock
// pattern as renumberAutoRegNos, to stay race-safe when several students
// are registered for the same year at once.
// ── Results Portal login number ("2026-48319") ─────────────────────────────
// The ONLY username a parent/student uses on the public Results portal:
// admission year + 5 random digits. Unique across the whole school, given
// once at registration and never changed - promotion, transfers of other
// students, edits and roster renumbering never touch it (unlike reg_no,
// which is re-sequenced whenever a class list changes). Random rather than
// sequential so it cannot simply be guessed by counting.
const assignResultsLoginNo = async (studentId, admissionDate) => {
  const d = admissionDate ? new Date(admissionDate) : new Date();
  const year = Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = `${year}-${String(10000 + Math.floor(Math.random() * 90000))}`;
    const r = await query(
      `UPDATE students SET results_login_no = $1
       WHERE id = $2 AND results_login_no IS NULL
         AND NOT EXISTS (SELECT 1 FROM students WHERE results_login_no = $1)`,
      [candidate, studentId]
    ).catch((e) => { if (e.code === "23505") return { rowCount: 0 }; throw e; });
    if (r.rowCount === 1) return candidate;
    const has = await query(`SELECT results_login_no FROM students WHERE id = $1`, [studentId]);
    if (has.rows[0]?.results_login_no) return has.rows[0].results_login_no;
  }
  throw new Error("Could not generate a unique Results login number - please try again.");
};

const assignAdmissionNo = async (studentId, admissionDate) => {
  const year = new Date(admissionDate).getFullYear();
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [`admission_no_${year}`]);
    try {
      // Continue from the HIGHEST number already used that year - counting
      // rows (the old way) handed out an existing number again as soon as
      // any student of that year had been deleted, the unique index then
      // rejected it, and the new student was left with no number at all.
      const { rows } = await client.query(
        `SELECT COALESCE(MAX(SPLIT_PART(admission_no, '/', 2)::int), 0) AS n
         FROM students WHERE admission_no ~ $1`,
        [`^S4005/[0-9]+/${year}$`]
      );
      const admissionNo = `S4005/${String(rows[0].n + 1).padStart(4, "0")}/${year}`;
      await client.query(`UPDATE students SET admission_no = $1 WHERE id = $2`, [admissionNo, studentId]);
      return admissionNo;
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [`admission_no_${year}`]).catch(() => {});
    }
  } finally {
    client.release();
  }
};

// Shared ORDER BY fragment: Female before Male (alphabetically 'Female' <
// 'Male' already sorts that way), then alphabetical by name - the same
// convention students get their registration numbers in, kept consistent
// everywhere a class roster is listed (Student Management, Results
// Management, Food Contributions, Contribution Management).
const GENDER_NAME_ORDER_SQL = `s.gender ASC, LOWER(s.first_name) ASC, LOWER(s.middle_name) ASC, LOWER(s.last_name) ASC`;

// ── Helper: log a student history event (Tanzania time via TIMESTAMPTZ) ──────
const logHistory = async (studentId, eventType, fromValue, toValue, note, userId, run = query) => {
  await run(`
    INSERT INTO student_history (student_id, event_type, from_value, to_value, note, recorded_by)
    VALUES ($1,$2,$3,$4,$5,$6)
  `, [studentId, eventType, fromValue || null, toValue || null, note || null, userId || null]);
};

const fullNameOf = (s) => [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");

// ── SMS Parent Contacts auto-sync ────────────────────────────────────────────
// Per Communications → SMS Service: the Parent/Guardian name, phone, and
// Form captured here in Student Management are what populate the "Parents"
// SMS list - nobody re-types them. This keeps sms_parent_contacts in sync
// with a student's record on every create/update/transfer/promote. Deletes
// are handled by the DB's ON DELETE CASCADE on sms_parent_contacts.student_id.
// Only the "Individual" SMS category stays manually typed.
const syncParentContact = async (student, run = query) => {
  if (!student) return;
  const parentName = (student.parent_name || "").trim();
  const parentPhone = (student.parent_phone || "").trim();

  if (!parentName || !parentPhone) {
    // No usable contact info (yet) - clear any stale contact for this student
    // rather than leaving an outdated/incomplete one visible under SMS Service.
    await run("DELETE FROM sms_parent_contacts WHERE student_id = $1", [student.id]);
    return;
  }

  await run(`
    INSERT INTO sms_parent_contacts (student_id, parent_name, student_name, class_name, phone, is_active)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (student_id) DO UPDATE SET
      parent_name  = EXCLUDED.parent_name,
      student_name = EXCLUDED.student_name,
      class_name   = EXCLUDED.class_name,
      phone        = EXCLUDED.phone,
      is_active    = EXCLUDED.is_active
  `, [student.id, parentName, fullNameOf(student), student.form, parentPhone, student.status === "Active"]);
};

// GET /api/students
// `form` accepts the real forms ("Form I".."Form IV") OR one of two special
// sentinel values that are not real form values in the DB:
//   - "GRADUATED"   → show graduated students (status = 'Graduated'),
//                      ordered by graduation date. A graduated student's
//                      `form` column keeps their last form (e.g. "Form IV")
//                      as a historical record.
//   - "TRANSFERRED" → show students who transferred out (status =
//                      'Transferred'), ordered by transfer-out date.
// Both Graduated AND Transferred students have left the active roster -
// they are excluded from every OTHER view (all-forms list, a single
// class/form's list, etc.) by default, unless a `status` filter is
// explicitly given - that's what lets the dedicated Graduated/Transferred
// views ask for them directly via status=Graduated / status=Transferred
// without needing the form=GRADUATED / form=TRANSFERRED sentinel too.
const getStudents = async (req, res, next) => {
  try {
    const { form, gender, status, search } = req.query;
    let sql = `
      SELECT s.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', sc.id, 'charge_type', sc.charge_type,
              'amount', sc.amount, 'note', sc.note,
              'paid', sc.paid, 'charge_date', sc.charge_date
            ) ORDER BY sc.charge_date DESC
          ) FILTER (WHERE sc.id IS NOT NULL), '[]'
        ) AS charges,
        (
          SELECT CASE WHEN ru.role = 'admin' THEN 'Head Master'
                      WHEN ru.role = 'second_master' THEN 'Second Master'
                      ELSE ru.full_name END
          FROM student_history rh JOIN users ru ON ru.id = rh.recorded_by
          WHERE rh.student_id = s.id AND rh.event_type = 'Enrolled'
          ORDER BY rh.event_at ASC LIMIT 1
        ) AS registered_by
      FROM students s
      LEFT JOIN student_charges sc ON sc.student_id = s.id
      WHERE 1=1
    `;
    const params = [];
    let i = 1;
    const wantsGraduated = form === "GRADUATED";
    const wantsTransferred = form === "TRANSFERRED";

    // Self-heal: make sure every form's auto reg_no sequence is actually in
    // the documented Female-then-Male, alphabetical order before we read it
    // back. Older rows (registered before this ordering rule existed, or
    // left mis-numbered by a since-fixed race condition - see
    // renumberAutoRegNos()'s comment above) can otherwise sit out of order
    // forever, since renumbering only ran on the NEXT create/edit/delete
    // for that particular form.
    //
    // This has to cover ALL FOUR real forms, not just whichever one (if
    // any) the caller filtered by: the Student Management page's default
    // view is "All Forms" (no `form` query param at all), so scoping this
    // to `form` alone meant the self-heal never ran for anyone viewing the
    // default screen - stale data could sit there indefinitely even though
    // renumberAutoRegNos() itself was already fixed. Each call is a cheap
    // no-op SELECT (no writes) whenever that form's sequence is already
    // correct, so healing all four here costs nothing extra when there's
    // nothing to fix.
    if (!wantsGraduated && !wantsTransferred) {
      for (const f of ["Form I", "Form II", "Form III", "Form IV"]) {
        await renumberAutoRegNos(f);
      }
    }

    if (wantsGraduated) {
      sql += ` AND s.status = 'Graduated'`;
    } else if (wantsTransferred) {
      sql += ` AND s.status = 'Transferred'`;
    } else {
      if (form) { sql += ` AND s.form = $${i++}`; params.push(form); }
      // Hide Graduated AND Transferred students from every normal/
      // unfiltered class or all-forms view - a transferred student must
      // disappear from their old class list entirely, not just get a
      // "Transferred" badge inside it.
      if (!status) sql += ` AND s.status NOT IN ('Graduated','Transferred')`;
    }
    if (gender) { sql += ` AND s.gender = $${i++}`; params.push(gender); }
    if (status) { sql += ` AND s.status = $${i++}`; params.push(status); }
    if (search) {
      sql += ` AND (
        LOWER(s.first_name || ' ' || COALESCE(s.middle_name,'') || ' ' || s.last_name) LIKE $${i} OR
        LOWER(COALESCE(s.reg_no,'')) LIKE $${i} OR
        LOWER(COALESCE(s.prem_no,'')) LIKE $${i} OR
        LOWER(COALESCE(s.results_login_no,'')) LIKE $${i}
      )`;
      params.push(`%${search.toLowerCase()}%`);
      i++;
    }

    sql += (wantsGraduated || status === "Graduated")
      ? ` GROUP BY s.id ORDER BY s.graduated_at DESC NULLS LAST, ${GENDER_NAME_ORDER_SQL}`
      : (wantsTransferred || status === "Transferred")
        ? ` GROUP BY s.id ORDER BY s.transfer_out_date DESC NULLS LAST, ${GENDER_NAME_ORDER_SQL}`
        : ` GROUP BY s.id ORDER BY s.form, ${GENDER_NAME_ORDER_SQL}`;

    const result = await query(sql, params);
    // Never let the browser (or any intermediary) cache this - a promotion
    // or graduation must be visible on the very next fetch, not stale.
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (err) { next(err); }
};

// key -> { label, unit } for every food type (hidden ones included).
const foodTypeLabels = async () => Object.fromEntries((await allFoodTypes()).map((t) => [t.key, t]));

// The current year in Tanzania (the server may run in another time zone) -
// food contribution amounts are set/owed per calendar year.
const currentFoodYear = () => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam", year: "numeric" }).format(new Date()));

// Turns the raw per-delivery rows into one row per food type for the CURRENT
// year: required amount (if the school set one), total brought, amount still
// owed, completed flag, and the individual dated deliveries. Any food type
// with a required amount is included even if the student has brought nothing
// (so an untouched debt is visible), plus every type the student has ever
// brought (so older deliveries are never hidden).
const unitShortS = (u) => (u === "LITRES" ? "L" : u === "PIECES" ? "pcs" : "kg");
function buildFoodSummary(contributions, foodTypes) {
  const year = currentFoodYear();
  const byKey = new Map();
  const keyOf = (c) => c.contribution_type;
  for (const t of foodTypes) {
    if (t.required_qty) byKey.set(t.key, { key: t.key, label: t.label, unit: t.unit, required: Number(t.required_qty), brought: 0, entries: [] });
  }
  for (const c of contributions || []) {
    const k = keyOf(c);
    if (!byKey.has(k)) byKey.set(k, { key: k, label: c.label || k, unit: c.unit || "", required: null, brought: 0, entries: [] });
    const row = byKey.get(k);
    const qty = Number(c.quantity) || 0;
    row.entries.push({ quantity: qty, year: Number(c.year), date: c.created_at });
    if (Number(c.year) === year) row.brought += qty;
  }
  return [...byKey.values()]
    .filter((r) => r.required || r.entries.length)
    .map((r) => {
      const brought = Math.round(r.brought * 100) / 100;
      const remaining = r.required ? Math.max(Math.round((r.required - brought) * 100) / 100, 0) : null;
      return {
        type: r.key, label: r.label, unit: r.unit, unit_short: unitShortS(r.unit),
        required: r.required, brought, remaining,
        completed: r.required ? remaining <= 0 : null,
        year,
        entries: r.entries.sort((a, b) => new Date(b.date) - new Date(a.date)),
      };
    })
    .sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0) || a.label.localeCompare(b.label));
}

// GET /api/students/:id
const getStudent = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT s.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', sc.id, 'charge_type', sc.charge_type,
              'amount', sc.amount, 'note', sc.note,
              'paid', sc.paid, 'charge_date', sc.charge_date
            ) ORDER BY sc.charge_date DESC
          ) FILTER (WHERE sc.id IS NOT NULL), '[]'
        ) AS charges,
        (
          SELECT CASE WHEN ru.role = 'admin' THEN 'Head Master'
                      WHEN ru.role = 'second_master' THEN 'Second Master'
                      ELSE ru.full_name END
          FROM student_history rh JOIN users ru ON ru.id = rh.recorded_by
          WHERE rh.student_id = s.id AND rh.event_type = 'Enrolled'
          ORDER BY rh.event_at ASC LIMIT 1
        ) AS registered_by,
        -- Food Contributions (Mahindi/Mchele/Mafuta ya Kupikia/... - the
        -- exact same records Food Contributions' own History shows), so
        -- they no longer look like they vanished once you leave that
        -- module and check the student directly here.
        (
          SELECT COALESCE(json_agg(
            json_build_object('contribution_type', fe.contribution_type, 'quantity', fe.quantity, 'year', fe.year, 'created_at', fe.created_at)
            ORDER BY fe.created_at DESC
          ) FILTER (WHERE fe.id IS NOT NULL), '[]')
          FROM food_contribution_entries fe WHERE fe.student_id = s.id
        ) AS food_contributions,
        -- Hostel Fee history (kept in English per the school's own
        -- convention - only the food items above are Swahili).
        (
          SELECT COALESCE(json_agg(
            json_build_object('hostel_fee', hc.hostel_fee, 'term', hc.term, 'academic_year', hc.academic_year, 'comment', hc.comment, 'owes', hc.owes, 'created_at', hc.created_at)
            ORDER BY hc.created_at DESC
          ) FILTER (WHERE hc.id IS NOT NULL), '[]')
          FROM hostel_contributions hc JOIN hostel_occupants ho ON ho.id = hc.occupant_id
          WHERE ho.student_id = s.id AND hc.hostel_fee > 0
        ) AS hostel_fee_contributions,
        -- Part-Time Teachers contributions (TSH.2000/month, recorded via
        -- Contributions Management). This lived in its own
        -- contribution_parttime table and was NEVER joined in here before -
        -- charges above only ever holds Ream/Other Expenses
        -- (student_charges) - so any student who had ONLY paid Part-Time
        -- Teachers fees (by far the most common contribution) showed "No
        -- contributions recorded" in this modal even though the payment
        -- was correctly recorded and visible in Contributions Management
        -- itself. Only months with something actually paid are included.
        (
          SELECT COALESCE(json_agg(
            json_build_object('year', p.year, 'month', p.month, 'amount_paid', p.amount_paid, 'completed', p.completed, 'updated_at', p.updated_at)
            ORDER BY p.year DESC, p.month DESC
          ) FILTER (WHERE p.id IS NOT NULL), '[]')
          FROM contribution_parttime p
          WHERE p.student_id = s.id AND p.amount_paid > 0
        ) AS parttime_contributions
      FROM students s
      LEFT JOIN student_charges sc ON sc.student_id = s.id
      WHERE s.id = $1
      GROUP BY s.id
    `, [req.params.id]);

    if (!result.rows.length)
      return res.status(404).json({ success: false, message: "Student not found." });

    const student = result.rows[0];
    // Swahili label + unit attached here (not baked into the SQL) so the
    // one source of truth for these labels is the food_types table
    // (utils/foodTypes.js).
    const FOOD_TYPE_LABELS = await foodTypeLabels();
    student.food_contributions = (student.food_contributions || []).map((fc) => ({
      ...fc,
      label: FOOD_TYPE_LABELS[fc.contribution_type]?.label || fc.contribution_type,
      unit: FOOD_TYPE_LABELS[fc.contribution_type]?.unit || "",
    }));
    // A clear per-food summary for the current year: how much is required,
    // how much the student has brought, how much is still owed, whether they
    // have completed, and every dated delivery. This is what Student
    // Management shows (modal + PDF) so the Head Master sees it at a glance.
    student.food_summary = buildFoodSummary(student.food_contributions, Object.values(FOOD_TYPE_LABELS));

    // Without this, the browser (or an in-between cache) can serve a stale
    // cached/304 response for this same URL - so right after recording a
    // Ream/food/hostel/part-time contribution for this student and then
    // immediately opening Contributions for them, you could still see the
    // OLD totals (missing the entry just added) even though the database
    // itself is correct. getStudents (list) and getStats already set this;
    // this single-student endpoint (used by the Contributions modal) was
    // the one place missing it.
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true, data: student });
  } catch (err) { next(err); }
};

// POST /api/students
// Friendly validation for the student form. Previously an invalid gender or
// form came back as a raw database error, a date of birth in the future and
// a name made only of spaces were saved, and a mistyped parent phone was
// stored - which silently locked that parent out of the Results portal
// (the phone number is their password there). `partial` = update: only the
// fields actually sent are checked.
const VALID_GENDERS = ["Male", "Female"];
const VALID_FORMS_S = ["Form I", "Form II", "Form III", "Form IV"];
const VALID_STATUSES = ["Active", "Inactive", "Transferred", "Completed", "Graduated"];
function studentFieldError(b, partial = false) {
  const has = (k) => b[k] !== undefined && b[k] !== null;
  const blank = (k) => !String(b[k] ?? "").trim();
  if (!partial || has("first_name")) if (blank("first_name")) return "First name is required.";
  if (!partial || has("last_name")) if (blank("last_name")) return "Last name is required.";
  if (!partial || has("gender")) if (!VALID_GENDERS.includes(b.gender)) return "Gender must be Male or Female.";
  if (!partial || has("form")) if (!VALID_FORMS_S.includes(b.form)) return "Form must be Form I, Form II, Form III or Form IV.";
  if (has("status") && b.status !== "" && !VALID_STATUSES.includes(b.status)) return "Invalid student status.";
  const today = new Date().toISOString().slice(0, 10);
  for (const [k, label] of [["dob", "Date of birth"], ["admission_date", "Admission date"], ["transfer_in_date", "Transfer-in date"]]) {
    if (!has(k) || b[k] === "") continue;
    const d = String(b[k]).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) return `${label} is not a valid date.`;
    if (k === "dob" && d > today) return "Date of birth cannot be in the future.";
    if (k === "dob" && d < "1980-01-01") return "Date of birth looks wrong - please check the year.";
  }
  if (has("parent_phone") && String(b.parent_phone).trim()) {
    const digits = String(b.parent_phone).replace(/\D/g, "");
    const ok = /^0[67]\d{8}$/.test(digits) || /^255[67]\d{8}$/.test(digits) || /^[67]\d{8}$/.test(digits);
    if (!ok) return "Parent phone must be a valid Tanzanian mobile number, e.g. 0712345678.";
  }
  return null;
}

const createStudent = async (req, res, next) => {
  try {
    const {
      prem_no, reg_no, first_name, middle_name, last_name, gender, dob,
      form, district, admission_date, status,
      parent_name, parent_phone,
      village, ward,
      is_transfer_in, origin_region, origin_district, origin_school, transfer_in_date,
    } = req.body;

    // Prem No. and Reg. No. are OPTIONAL - first name, last name, gender and
    // form are required. (entry_no has been retired entirely - see the
    // schema note in migrate.js for why.)
    if (!first_name || !last_name || !gender || !form)
      return res.status(400).json({ success: false, message: "First name, last name, gender and form are required." });
    const fieldErr = studentFieldError(req.body);
    if (fieldErr) return res.status(400).json({ success: false, message: fieldErr });

    // ── Prevent registering the same student twice in the same class/form ──
    // Matches on full name (first + middle + last, case-insensitive, spacing
    // ignored) within the SAME form only - a student legitimately re-appears
    // under the same name in a later form (promotion) or a different form
    // entirely, so the check is scoped to `form`, not the whole school.
    const dupCheck = await query(
      `SELECT id FROM students
       WHERE form = $1
         AND LOWER(TRIM(first_name)) = LOWER(TRIM($2))
         AND LOWER(TRIM(COALESCE(middle_name,''))) = LOWER(TRIM(COALESCE($3,'')))
         AND LOWER(TRIM(last_name)) = LOWER(TRIM($4))
       LIMIT 1`,
      [form, first_name, middle_name || "", last_name]
    );
    if (dupCheck.rows.length)
      return res.status(409).json({
        success: false,
        message: `${[first_name, middle_name, last_name].filter(Boolean).join(" ")} ameshasajiliwa kwenye ${form}. Huwezi kumsajili tena mwanafunzi huyo huyo kwenye darasa hilo hilo.`,
      });

    // When left blank, reg_no starts out NULL and is assigned by
    // renumberAutoRegNos() right after insert, once this student's name/
    // gender are actually in the table and its correct position (Female
    // block first, then Male, alphabetical within each) can be computed
    // against the rest of the form's roster.
    const wasAutoRegNo = !(reg_no && reg_no.trim());
    const finalRegNo = wasAutoRegNo ? null : reg_no.trim();

    let result = await query(`
      INSERT INTO students
        (prem_no, reg_no, first_name, middle_name, last_name, gender, dob,
         form, district, admission_date, status, parent_name, parent_phone,
         village, ward, is_transfer_in, origin_region, origin_district, origin_school, transfer_in_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *
    `, [prem_no || null, finalRegNo, String(first_name).trim(), (middle_name && String(middle_name).trim()) || null, String(last_name).trim(), gender,
        dob || null, form, district || null,
        admission_date || todayTZ(),
        status || "Active", parent_name || null, parent_phone || null,
        village || null, ward || null,
        !!is_transfer_in, origin_region || null, origin_district || null, origin_school || null, transfer_in_date || null]);

    let student = result.rows[0];

    if (wasAutoRegNo) {
      await renumberAutoRegNos(form);
    }
    await assignAdmissionNo(student.id, student.admission_date);
    await assignResultsLoginNo(student.id, student.admission_date);
    { const refreshed = await query("SELECT * FROM students WHERE id = $1", [student.id]); student = refreshed.rows[0]; }

    await logHistory(student.id, "Enrolled", null, student.status,
      is_transfer_in ? `Into ${student.form} (transferred in from ${origin_school || "another school"}).` : `Into ${student.form}.`,
      req.user?.id);
    await syncParentContact(student);

    res.status(201).json({ success: true, data: student, message: `Student Successfully Saved - ${student.first_name} ${student.last_name} added to ${student.form}. Namba ya Kuingia (Matokeo): ${student.results_login_no || "-"}` });
  } catch (err) { next(err); }
};

// PUT /api/students/:id
const updateStudent = async (req, res, next) => {
  try {
    const {
      prem_no, reg_no, first_name, middle_name, last_name, gender, dob,
      form, district, admission_date, status,
      parent_name, parent_phone,
      village, ward,
      is_transfer_in, origin_region, origin_district, origin_school, transfer_in_date,
    } = req.body;

    const fieldErr = studentFieldError(req.body, true);
    if (fieldErr) return res.status(400).json({ success: false, message: fieldErr });

    const before = await query("SELECT * FROM students WHERE id = $1", [req.params.id]);
    if (!before.rows.length)
      return res.status(404).json({ success: false, message: "Student not found." });
    const prev = before.rows[0];

    // Same "blank means auto" rule as createStudent: reg_no === undefined
    // means the field wasn't sent at all (leave it untouched); a present but
    // blank/whitespace value means the Head Master cleared it on purpose,
    // which should hand it back to auto-numbering (NULL), not literally
    // store "" forever and silently drop out of renumberAutoRegNos().
    const regNoReset = reg_no !== undefined && !String(reg_no).trim();
    const finalRegNo = reg_no === undefined ? prev.reg_no : (regNoReset ? null : reg_no.trim());

    const result = await query(`
      UPDATE students SET
        prem_no = $1,
        reg_no = $2,
        first_name = COALESCE($3, first_name),
        middle_name = $4,
        last_name = COALESCE($5, last_name),
        gender = COALESCE($6, gender),
        dob = COALESCE($7, dob),
        form = COALESCE($8, form),
        district = COALESCE($9, district),
        admission_date = COALESCE($10, admission_date),
        status = COALESCE($11, status),
        parent_name = COALESCE($12, parent_name),
        parent_phone = COALESCE($13, parent_phone),
        village = COALESCE($14, village),
        ward = COALESCE($15, ward),
        is_transfer_in = COALESCE($16, is_transfer_in),
        origin_region = COALESCE($17, origin_region),
        origin_district = COALESCE($18, origin_district),
        origin_school = COALESCE($19, origin_school),
        transfer_in_date = COALESCE($20, transfer_in_date),
        updated_at = NOW()
      WHERE id = $21
      RETURNING *
    `, [prem_no ?? prev.prem_no, finalRegNo, first_name === undefined ? first_name : String(first_name).trim(), middle_name === undefined || middle_name === null ? (middle_name ?? prev.middle_name) : String(middle_name).trim(),
        last_name === undefined ? last_name : String(last_name).trim(), gender, dob, form, district, admission_date,
        status, parent_name, parent_phone,
        village, ward, is_transfer_in, origin_region, origin_district, origin_school, transfer_in_date,
        req.params.id]);

    let student = result.rows[0];

    // ── Log meaningful changes to history (Tanzania time) ──
    if (status && status !== prev.status) {
      await logHistory(student.id, "Status Change", prev.status, status, null, req.user?.id);
    }
    if (form && form !== prev.form) {
      await logHistory(student.id, "Transferred", prev.form, form, "Class/Form change.", req.user?.id);
    }
    if (!status && !form) {
      await logHistory(student.id, "Updated", null, null, "Student record updated.", req.user?.id);
    }

    // Manually editing a student's Status to "Graduated" must behave exactly
    // like bulk promotion does - stamp graduated_at so this student is
    // correctly excluded from every normal class/all-forms view and shows
    // up (in the right order) in the dedicated Graduated section.
    if (status === "Graduated" && prev.status !== "Graduated") {
      const g = await query(
        `UPDATE students SET graduated_at = COALESCE(graduated_at, NOW()) WHERE id = $1 RETURNING *`,
        [student.id]
      );
      student = g.rows[0];
    } else if (status && status !== "Graduated" && prev.status === "Graduated") {
      // Moving a student back OUT of Graduated (correcting a mistake)
      // clears graduated_at too, so a later re-graduation gets a fresh date.
      const g = await query(`UPDATE students SET graduated_at = NULL WHERE id = $1 RETURNING *`, [student.id]);
      student = g.rows[0];
    }

    await syncParentContact(student);

    // A change to gender, name, or form can shift where this student (and
    // possibly others) belong in the Female-first/alphabetical order, so
    // re-sequence the auto-generated numbers for every form this touched.
    const nameChanged = (first_name && first_name !== prev.first_name) ||
      (middle_name !== undefined && (middle_name || null) !== prev.middle_name) ||
      (last_name && last_name !== prev.last_name);
    const genderChanged = gender && gender !== prev.gender;
    const formChanged = form && form !== prev.form;
    if (nameChanged || genderChanged || formChanged || regNoReset) {
      await renumberAutoRegNos(student.form);
      if (formChanged) await renumberAutoRegNos(prev.form);
      const refreshed = await query("SELECT * FROM students WHERE id = $1", [student.id]);
      student = refreshed.rows[0];
    }

    res.json({ success: true, data: student, message: "Student Successfully Updated." });
  } catch (err) { next(err); }
};

// PATCH /api/students/:id/transfer-out - record where/when a student has transferred to
// PATCH /api/students/:id/prem-no { prem_no } - Head Master / Second Master
// type the student's PREM number by hand (empty clears it).
const setPremNo = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: "Invalid student." });
    const raw = req.body ? req.body.prem_no : undefined;
    if (raw !== null && raw !== undefined && typeof raw !== "string") return res.status(400).json({ success: false, message: "Invalid PREM number." });
    const v = String(raw || "").trim();
    if (v.length > 30) return res.status(400).json({ success: false, message: "PREM number is too long (30 characters max)." });
    if (v && !/^[A-Za-z0-9/\- ]+$/.test(v)) return res.status(400).json({ success: false, message: "PREM number may contain only letters, numbers, / and -." });
    const { rows } = await query(`UPDATE students SET prem_no = $1, updated_at = NOW() WHERE id = $2 RETURNING id, prem_no`, [v || null, id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Student not found." });
    res.json({ success: true, prem_no: rows[0].prem_no, message: v ? "PREM number saved." : "PREM number removed." });
  } catch (err) { next(err); }
};

const markTransferredOut = async (req, res, next) => {
  try {
    const { dest_region, dest_district, dest_school, transfer_out_date } = req.body;
    if (!dest_region || !dest_district || !dest_school || !transfer_out_date)
      return res.status(400).json({ success: false, message: "Destination region, district, school and date are required." });

    const result = await query(`
      UPDATE students SET
        status = 'Transferred',
        dest_region = $1, dest_district = $2, dest_school = $3, transfer_out_date = $4,
        updated_at = NOW()
      WHERE id = $5 RETURNING *
    `, [dest_region, dest_district, dest_school, transfer_out_date, req.params.id]);

    if (!result.rows.length) return res.status(404).json({ success: false, message: "Student not found." });
    const student = result.rows[0];
    await logHistory(student.id, "Transferred Out", "Active", "Transferred",
      `Transferred to ${dest_school}, ${dest_district}, ${dest_region} on ${transfer_out_date}.`, req.user?.id);
    // A student who has left the school must also leave the hostel -
    // otherwise they kept occupying a bed in Hostel Management.
    await query(
      `UPDATE hostel_occupants SET is_active = false, departed_date = COALESCE($2::date, (NOW() AT TIME ZONE 'Africa/Dar_es_Salaam')::date)
       WHERE student_id = $1 AND is_active = true`,
      [student.id, transfer_out_date || null]
    );
    await syncParentContact(student);

    res.json({ success: true, data: student });
  } catch (err) { next(err); }
};

// DELETE /api/students/:id
// Note: deleting the student also removes its synced SMS parent contact,
// and every row in student_result_pdfs (Cloudinary-archived per-student
// result PDFs - see resultsController.exportStudentResultPdf), automatically
// via each table's ON DELETE CASCADE. Those DB rows disappearing does NOT
// by itself delete the underlying Cloudinary files, so their public_ids are
// read here BEFORE the delete and destroyed on Cloudinary right after - the
// student's photo, and every exported/published result PDF that belongs
// only to them, are gone the moment their record is gone. Best-effort: a
// Cloudinary hiccup never blocks the student record itself from being
// removed.
const deleteStudent = async (req, res, next) => {
  try {
    const [photoRes, resultPdfsRes] = await Promise.all([
      query("SELECT photo_url FROM students WHERE id = $1", [req.params.id]),
      query("SELECT public_id FROM student_result_pdfs WHERE student_id = $1", [req.params.id]),
    ]);

    const result = await query("DELETE FROM students WHERE id = $1 RETURNING id, form", [req.params.id]);
    if (!result.rows.length)
      return res.status(404).json({ success: false, message: "Student not found." });
    await renumberAutoRegNos(result.rows[0].form);

    const { deleteCloudinaryImage, deleteCloudinaryAsset, publicIdFromUrl } = require("../middleware/upload");
    const photoPublicId = publicIdFromUrl(photoRes.rows[0]?.photo_url);
    if (photoPublicId) deleteCloudinaryImage(photoPublicId);
    resultPdfsRes.rows.forEach((r) => { if (r.public_id) deleteCloudinaryAsset(r.public_id, "raw"); });

    res.json({ success: true, message: "Student removed." });
  } catch (err) { next(err); }
};

// GET /api/students/stats
const getStats = async (req, res, next) => {
  try {
    const [total, graduated, transferred, byForm, byGender, byStatus] = await Promise.all([
      query("SELECT COUNT(*) AS total FROM students WHERE status NOT IN ('Graduated','Transferred')"),
      query("SELECT COUNT(*) AS total FROM students WHERE status = 'Graduated'"),
      query("SELECT COUNT(*) AS total FROM students WHERE status = 'Transferred'"),
      query("SELECT form, COUNT(*) AS count FROM students WHERE status NOT IN ('Graduated','Transferred') GROUP BY form ORDER BY form"),
      query("SELECT gender, COUNT(*) AS count FROM students WHERE status NOT IN ('Graduated','Transferred') GROUP BY gender"),
      query("SELECT status, COUNT(*) AS count FROM students GROUP BY status"),
    ]);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      data: {
        total: parseInt(total.rows[0].total),
        graduated: parseInt(graduated.rows[0].total),
        transferred: parseInt(transferred.rows[0].total),
        by_form: byForm.rows,
        by_gender: byGender.rows,
        by_status: byStatus.rows,
      },
    });
  } catch (err) { next(err); }
};

// ── Charges ───────────────────────────────────────────────────────────────────
// Money-based types (Academics, Other) use `amount`. Item-based types (e.g. "Ream")
// are not money - they are ticked as brought/not brought via markChargePaid, which
// permanently locks the record once submitted so it can't be silently un-ticked.

// POST /api/students/:id/charges
const addCharge = async (req, res, next) => {
  try {
    const { charge_type, amount, note, charge_date } = req.body;
    if (amount !== undefined && amount !== null && amount !== "" && (!Number.isFinite(Number(amount)) || Number(amount) < 0))
      return res.status(400).json({ success: false, message: "Amount must be a number of 0 or more." });
    if (!charge_type)
      return res.status(400).json({ success: false, message: "Charge type is required." });

    const result = await query(`
      INSERT INTO student_charges (student_id, charge_type, amount, note, charge_date, created_by)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
    `, [req.params.id, charge_type, amount || 0, note || null,
        charge_date || todayTZ(),
        req.user?.id || null]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

// PATCH /api/students/:id/charges/:chargeId/pay - marks paid/brought AND locks the record
const markChargePaid = async (req, res, next) => {
  try {
    const existing = await query(`SELECT locked FROM student_charges WHERE id = $1 AND student_id = $2`, [req.params.chargeId, req.params.id]);
    if (!existing.rows.length)
      return res.status(404).json({ success: false, message: "Charge not found." });
    if (existing.rows[0].locked)
      return res.status(400).json({ success: false, message: "This record has already been submitted and locked - it can no longer be edited." });

    const result = await query(`
      UPDATE student_charges SET paid = true, paid_at = NOW(), locked = true
      WHERE id = $1 AND student_id = $2
      RETURNING *
    `, [req.params.chargeId, req.params.id]);

    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

// DELETE /api/students/:id/charges/:chargeId
const deleteCharge = async (req, res, next) => {
  try {
    await query("DELETE FROM student_charges WHERE id = $1 AND student_id = $2",
      [req.params.chargeId, req.params.id]);
    res.json({ success: true, message: "Charge removed." });
  } catch (err) { next(err); }
};

// ── Enrollment History ───────────────────────────────────────────────────────

// GET /api/students/:id/history
const getHistory = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT h.*, ${tzColumn("h.event_at", "event_at_tz")},
        CASE WHEN u.role = 'admin' THEN 'Head Master'
             WHEN u.role = 'second_master' THEN 'Second Master'
             ELSE u.full_name END AS recorded_by_name
      FROM student_history h
      LEFT JOIN users u ON u.id = h.recorded_by
      WHERE h.student_id = $1
      ORDER BY h.event_at DESC
    `, [req.params.id]);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// ── PDF Export ───────────────────────────────────────────────────────────────

// Shows just the numeric part of entry/prem numbers on official documents (e.g. "2025016").
const displayNo = (v) => {
  if (!v) return "-";
  const digits = String(v).replace(/\D/g, "");
  return digits || v;
};

// GET /api/students/:id/pdf - single student profile
const exportStudentPdf = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT s.*, ${tzColumn("s.created_at", "created_at_tz")}
      FROM students s WHERE s.id = $1
    `, [req.params.id]);
    if (!result.rows.length)
      return res.status(404).json({ success: false, message: "Student not found." });
    const s = result.rows[0];

    const historyRes = await query(`
      SELECT h.event_type, h.from_value, h.to_value, h.note, ${tzColumn("h.event_at", "event_at_tz")},
        CASE WHEN u.role = 'admin' THEN 'Head Master'
             WHEN u.role = 'second_master' THEN 'Second Master'
             ELSE u.full_name END AS recorded_by_name
      FROM student_history h
      LEFT JOIN users u ON u.id = h.recorded_by
      WHERE h.student_id = $1 ORDER BY h.event_at DESC
    `, [req.params.id]);

    const chargesRes = await query(
      `SELECT charge_type, amount, paid, locked, charge_date FROM student_charges WHERE student_id = $1 ORDER BY charge_date DESC`,
      [req.params.id]
    );

    // Part-Time Teachers contributions - same table exportStudentReportPdf
    // and the Contributions modal already read (contribution_parttime).
    // This PDF's own "Charges" section only ever queried student_charges
    // (Ream/Other Expenses) above and never this one, so a student profile
    // download could look like it had "No charges recorded" even after
    // real Part-Time Teachers payments - the same gap fixed in getStudent().
    const parttimeRes = await query(
      `SELECT year, month, amount_paid, completed, updated_at FROM contribution_parttime WHERE student_id = $1 AND amount_paid > 0 ORDER BY year DESC, month DESC`,
      [req.params.id]
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${s.reg_no || s.id}-profile.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
    doc.pipe(res);

    drawLetterhead(doc, `Student Profile - ${fullNameOf(s)}`);

    if (s.photo_url) {
      try {
        // Ask Cloudinary for a small, auto-compressed derivative sized for
        // exactly how it's displayed here - not the full original upload,
        // which can be several MB straight off a phone camera and was
        // previously embedded at full size, bloating every profile PDF.
        const photoRes = await fetch(cloudinaryResized(s.photo_url, "w_170,h_195,c_fill,q_auto,f_auto"));
        if (photoRes.ok) {
          const photoBuffer = Buffer.from(await photoRes.arrayBuffer());
          const photoW = 85, photoX = doc.page.width - doc.page.margins.right - photoW, photoY = doc.y;
          doc.image(photoBuffer, photoX, photoY, { width: photoW, height: photoW * 1.15 });
          doc.rect(photoX, photoY, photoW, photoW * 1.15).strokeColor("#CBD5E1").lineWidth(0.8).stroke();
        }
      } catch { /* photo unreachable/corrupt - skip silently, rest of the PDF still renders */ }
    }

    const row = (label, value) => {
      const labelW = 150, startY = doc.y, startX = doc.page.margins.left;
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#475569").text(label, startX, startY, { width: labelW, lineBreak: false });
      doc.font("Helvetica").fillColor("#0F172A").text(String(value ?? "-"), startX + labelW, startY, { lineBreak: false });
      doc.x = startX; doc.y = startY + 16;
    };

    row("Full Name:", fullNameOf(s));
    row("Prem No.:", displayNo(s.prem_no));
    row("Reg. No.:", s.reg_no);
    row("Namba ya Kuingia (Matokeo):", s.results_login_no);
    row("Gender:", s.gender);
    row("Date of Birth:", dateOnly(s.dob) || "-");
    row("Form:", s.form);
    row("District:", s.district);
    row("Admission Date:", dateOnly(s.admission_date) || "-");
    row("Status:", s.status);
    row("Parent/Guardian:", s.parent_name);
    row("Parent Phone:", s.parent_phone);
    doc.moveDown(1);

    doc.fontSize(12).font("Helvetica-Bold").fillColor("#0F172A").text("Enrollment History");
    doc.moveDown(0.3);
    if (!historyRes.rows.length) {
      doc.fontSize(10).font("Helvetica").fillColor("#64748B").text("No history recorded.");
    } else {
      historyRes.rows.forEach(h => {
        doc.fontSize(9).font("Helvetica").fillColor("#0F172A")
          .text(`${String(h.event_at_tz || "").slice(0, 10)}  -  ${h.event_type}${h.from_value ? `  (${h.from_value} → ${h.to_value})` : ""}${h.note ? `  ${h.note}` : ""}${h.recorded_by_name ? `  - by ${h.recorded_by_name}` : ""}`);
      });
    }
    doc.moveDown(1);

    doc.fontSize(12).font("Helvetica-Bold").fillColor("#0F172A").text("Charges");
    doc.moveDown(0.3);
    if (!chargesRes.rows.length) {
      doc.fontSize(10).font("Helvetica").fillColor("#64748B").text("No charges recorded.");
    } else {
      chargesRes.rows.forEach(c => {
        const status = c.charge_type === "Ream" ? (c.paid ? "Brought" : "Not brought") : (c.paid ? "Paid" : "Unpaid");
        const amountStr = c.charge_type === "Ream" ? "" : `  -  TZS ${Number(c.amount).toLocaleString()}`;
        doc.fontSize(9).font("Helvetica").fillColor("#0F172A")
          .text(`${dateOnly(c.charge_date)}  -  ${c.charge_type}${amountStr}  -  ${status}${c.locked ? " (locked)" : ""}`);
      });
    }
    doc.moveDown(1);

    doc.fontSize(12).font("Helvetica-Bold").fillColor("#0F172A").text("Part-Time Teachers Contribution");
    doc.moveDown(0.3);
    if (!parttimeRes.rows.length) {
      doc.fontSize(10).font("Helvetica").fillColor("#64748B").text("No Part-Time Teachers contributions recorded.");
    } else {
      parttimeRes.rows.forEach(p => {
        doc.fontSize(9).font("Helvetica").fillColor("#0F172A")
          .text(`${MONTH_NAMES_SHORT[p.month - 1]} ${p.year}  -  TZS ${Number(p.amount_paid).toLocaleString()} of 2,000  -  ${p.completed ? "Completed" : "Partial"}`);
      });
    }

    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

// GET /api/students/pdf - list export (respects same filters as getStudents)
const exportStudentsListPdf = async (req, res, next) => {
  try {
    const { form, gender, status, search } = req.query;
    let sql = `SELECT * FROM students WHERE 1=1`;
    const params = [];
    let i = 1;
    const wantsGraduated = form === "GRADUATED";
    if (wantsGraduated) {
      sql += ` AND status = 'Graduated'`;
    } else {
      if (form) { sql += ` AND form = $${i++}`; params.push(form); }
      if (!status) sql += ` AND status != 'Graduated'`;
    }
    if (gender) { sql += ` AND gender = $${i++}`; params.push(gender); }
    if (status) { sql += ` AND status = $${i++}`; params.push(status); }
    if (search) {
      sql += ` AND LOWER(first_name || ' ' || COALESCE(middle_name,'') || ' ' || last_name) LIKE $${i++}`;
      params.push(`%${search.toLowerCase()}%`);
    }
    sql += (wantsGraduated || status === "Graduated")
      ? ` ORDER BY graduated_at DESC NULLS LAST, gender ASC, LOWER(first_name) ASC, LOWER(middle_name) ASC, LOWER(last_name) ASC`
      : ` ORDER BY form, gender ASC, LOWER(first_name) ASC, LOWER(middle_name) ASC, LOWER(last_name) ASC`;
    const result = await query(sql, params);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="students-list.pdf"`);

    const doc = new PDFDocument({ margin: 30, size: "A4", layout: "landscape", bufferPages: true });
    doc.pipe(res);
    const listYear = new Date().getFullYear();
    // Document title: "FORM <x> REGISTERED STUDENTS - <year>" for a single-
    // form roster (the normal case - downloading one class's list); falls
    // back to a sensible label for the Graduated view or an all-forms pull.
    const listTitle = wantsGraduated
      ? `GRADUATED STUDENTS - ${listYear}`
      : form
        ? `${form.toUpperCase()} REGISTERED STUDENTS - ${listYear}`
        : `ALL FORMS REGISTERED STUDENTS - ${listYear}`;
    drawLetterhead(doc, listTitle);

    const now = new Date();
    doc.fontSize(9).font("Helvetica").fillColor("#64748B")
      .text(`As at: ${dateOnly(now)}  (${now.toLocaleDateString("en-GB",{month:"long"})} ${now.getFullYear()})`, { align: "right" });
    doc.moveDown(0.6);

    // Prem No. and Status dropped; District/Ward/Village added (English-
    // language labels only, per spec) in place of them. Gender is shown
    // abbreviated (F/M). Reg. No. leads the row (before the name) and the
    // phone column is labelled Parent Phone No. - this is a parent/guardian
    // contact number, not the student's own phone.
    const colX = [30, 110, 280, 340, 385, 485, 585, 685];
    const headers = ["Reg. No.", "Full Name", "Form", "Gender", "District", "Ward", "Village", "Parent Phone No."];
    const tableTop = doc.y;
    doc.rect(30, tableTop - 4, 770, 18).fill(STUDENT_THEME.headerBg);
    doc.fillColor(STUDENT_THEME.text).fontSize(8).font("Helvetica-Bold");
    headers.forEach((h, idx) => doc.text(h, colX[idx] + 4, tableTop, { width: (colX[idx+1]||800) - colX[idx] - 6 }));
    let y = tableTop + 18;
    let rowYs = [tableTop - 4, y]; // every row boundary on the CURRENT page, header included

    doc.font("Helvetica").fillColor(STUDENT_THEME.text);
    result.rows.forEach((s, idx) => {
      if (y > 520) {
        drawTableGrid(doc, colX, 800, rowYs, STUDENT_THEME.border); // close out this page's grid before starting a new one
        doc.addPage({ margin: 30, size: "A4", layout: "landscape" });
        y = 40;
        rowYs = [y - 4, y - 4];
      }
      doc.rect(30, y - 3, 770, 16).fill(idx % 2 === 0 ? STUDENT_THEME.rowBg : STUDENT_THEME.rowAltBg).fillColor(STUDENT_THEME.text);
      const formCell = s.status === "Graduated" ? `Graduated (${s.graduated_at ? new Date(s.graduated_at).getFullYear() : "-"})` : s.form;
      const genderCell = s.gender === "Female" ? "F" : s.gender === "Male" ? "M" : (s.gender || "-");
      const vals = [s.reg_no || "-", fullNameOf(s), formCell, genderCell, s.district || "-", s.ward || "-", s.village || "-", s.parent_phone || "-"];
      vals.forEach((v, i2) => doc.fontSize(8).fillColor(STUDENT_THEME.text).text(String(v), colX[i2] + 4, y, { width: (colX[i2+1]||800) - colX[i2] - 6 }));
      y += 16;
      rowYs.push(y - 3);
    });
    drawTableGrid(doc, colX, 800, rowYs, STUDENT_THEME.border);

    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

// GET /api/students/:id/report?include=hostel,contributions - Admin bulk download.
// include is a comma-separated list; "enrollment" data is always included.
const exportStudentReportPdf = async (req, res, next) => {
  try {
    const include = (req.query.include || "").split(",").map(s => s.trim()).filter(Boolean);
    const wantHostel = include.includes("hostel");
    const wantContrib = include.includes("contributions");
    const wantResults = include.includes("results") && req.query.results_sheet_id;

    const sRes = await query(`SELECT * FROM students WHERE id = $1`, [req.params.id]);
    if (!sRes.rows.length) return res.status(404).json({ success: false, message: "Student not found." });
    const s = sRes.rows[0];

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${s.reg_no || s.id}-report.pdf"`);
    const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
    doc.pipe(res);
    // Whole-page light-blue backdrop, same as the "MATOKEO YA JUMLA" table
    // and the Parent Report (resultsController.js's paintPageBg/
    // NECTA_SUMMARY_BG pattern) - painted first, before anything else, so
    // every section on this page (Enrollment, Hostel, Contributions,
    // Results) sits on top of it, not just one section. This report is
    // always a single page (no doc.addPage() anywhere below), so one call
    // is enough - a multi-page version would need to repaint after every
    // addPage(), the way resultsController.js's paintPageBg() does.
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(NECTA_SUMMARY_BG);
    drawLetterhead(doc, `STUDENT PROFILE - ${fullNameOf(s)}`);

    const row = (label, value) => {
      const labelW = 150, startY = doc.y, startX = doc.page.margins.left;
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#475569").text(label, startX, startY, { width: labelW, lineBreak: false });
      doc.font("Helvetica").fillColor("#0F172A").text(String(value ?? "-"), startX + labelW, startY, { lineBreak: false });
      doc.x = startX; doc.y = startY + 16;
    };

    doc.fontSize(12).font("Helvetica-Bold").fillColor("#0F172A").text("Enrollment Information");
    doc.moveDown(0.3);
    row("Full Name:", fullNameOf(s));
    row("Prem No.:", displayNo(s.prem_no));
    row("Reg. No.:", s.reg_no);
    row("Gender:", s.gender);
    row("Date of Birth:", dateOnly(s.dob) || "-");
    row("Form:", s.form);
    row("District:", s.district);
    row("Village/Street:", s.village);
    row("Ward:", s.ward);
    row("Status:", s.status);
    row("Parent/Guardian:", s.parent_name);
    row("Parent Phone:", s.parent_phone);
    if (s.is_transfer_in) {
      row("Transferred From:", `${s.origin_school || "-"}, ${s.origin_district || "-"}, ${s.origin_region || "-"}`);
      row("Transfer-in Date:", dateOnly(s.transfer_in_date) || "-");
    }
    if (s.status === "Transferred") {
      row("Transferred To:", `${s.dest_school || "-"}, ${s.dest_district || "-"}, ${s.dest_region || "-"}`);
      row("Transfer-out Date:", dateOnly(s.transfer_out_date) || "-");
    }
    doc.moveDown(1);

    // ── Hostel ──
    if (wantHostel) {
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#0F172A").text("Hostel Information");
      doc.moveDown(0.3);
      // Room number lives on hostel_rooms (via room_id), NOT as a column on
      // hostel_occupants itself - without this join, o.room_number was
      // always undefined and the report silently fell back to "-" for
      // every Girls Hostel occupant, even ones with an assigned room.
      const occRes = await query(
        `SELECT o.*, r.room_number FROM hostel_occupants o LEFT JOIN hostel_rooms r ON r.id = o.room_id
         WHERE o.student_id = $1 AND o.is_active = true ORDER BY o.created_at DESC LIMIT 1`,
        [req.params.id]
      );
      if (!occRes.rows.length) {
        doc.fontSize(10).font("Helvetica").fillColor("#64748B").text("This student does not reside in the hostel.");
      } else {
        const o = occRes.rows[0];
        row("Hostel:", o.hostel_name);
        row("Room:", o.room_number || (o.hostel_name === "Boys Hostel" ? "Boarding Facility" : "-"));
        row("Admitted:", dateOnly(o.admitted_date) || "-");
      }
      doc.moveDown(1);
    }

    // ── School Contributions ──
    if (wantContrib) {
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#0F172A").text("School Contributions");
      doc.moveDown(0.3);

      const currentYear = new Date().getFullYear();
      const reamRes = await query(
        `SELECT charge_date FROM student_charges WHERE student_id = $1 AND charge_type = 'Ream' AND EXTRACT(YEAR FROM charge_date) = $2::int ORDER BY charge_date DESC LIMIT 1`,
        [req.params.id, currentYear]
      );
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#0F172A").text(`Ream (${currentYear}):`, { continued: true });
      if (reamRes.rows.length) {
        doc.font("Helvetica").fillColor("#0F172A").text(`  Brought (${dateOnly(reamRes.rows[0].charge_date)})`);
      } else {
        doc.font("Helvetica-Oblique").fillColor("#94A3B8").text("  Not yet");
      }
      doc.moveDown(0.5);

      const ptRes = await query(`SELECT * FROM contribution_parttime WHERE student_id = $1 ORDER BY year DESC, month DESC`, [req.params.id]);
      if (ptRes.rows.length) {
        doc.fontSize(10).font("Helvetica-Bold").fillColor("#0F172A").text("Part-time Teachers Contribution:");
        ptRes.rows.forEach(p => {
          doc.fontSize(9).font("Helvetica").fillColor("#0F172A")
            .text(`${p.month}/${p.year}  -  TZS ${Number(p.amount_paid).toLocaleString()} of 2,000  -  ${p.completed ? "Completed" : "Partial"}`);
        });
        doc.moveDown(0.5);
      }

      if (wantHostel) {
        const occRes2 = await query(`SELECT id FROM hostel_occupants WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1`, [req.params.id]);
        if (occRes2.rows.length) {
          // Only hostel_fee is real, live data (recorded via Hostel
          // Management → Hostel Fees). maize_kg/vegetables_kg/oil_litres/
          // salt_kg/rice_kg on this table are never written by any reachable
          // part of the app, so they must NOT be printed here - doing so
          // used to print a fake "Maize 0kg, Cooking Oil 0L" line (in
          // English) on every report that had a hostel_fee entry.
          const hcRes = await query(`SELECT * FROM hostel_contributions WHERE occupant_id = $1 AND hostel_fee > 0 ORDER BY created_at DESC`, [occRes2.rows[0].id]);
          if (hcRes.rows.length) {
            doc.fontSize(10).font("Helvetica-Bold").fillColor("#0F172A").text("Hostel Fee:");
            hcRes.rows.forEach(c => {
              doc.fontSize(9).font("Helvetica").fillColor("#0F172A").text(`${c.term || ""} ${c.academic_year || ""}  -  TZS ${Number(c.hostel_fee).toLocaleString()}  -  ${c.owes ? "Outstanding" : "Paid"}`);
            });
            doc.moveDown(0.5);
          }
        }
      }

      // Michango ya Chakula (Food Contributions) - shown whenever School
      // Contributions are included (it belongs with contributions, not with
      // hostel). Real records from food_contribution_entries.
        const feRes = await query(
          `SELECT contribution_type, quantity, year, created_at FROM food_contribution_entries WHERE student_id = $1 ORDER BY created_at DESC`,
          [req.params.id]
        );
        const FOOD_TYPE_LABELS = await foodTypeLabels();
        const foodRows = feRes.rows.map((fe) => ({
          contribution_type: fe.contribution_type, quantity: fe.quantity, year: fe.year, created_at: fe.created_at,
          label: FOOD_TYPE_LABELS[fe.contribution_type]?.label || fe.contribution_type,
          unit: FOOD_TYPE_LABELS[fe.contribution_type]?.unit || "",
        }));
        const foodSummary = buildFoodSummary(foodRows, Object.values(FOOD_TYPE_LABELS));
        if (foodSummary.length) {
          const curYear = currentFoodYear();
          // Labels follow the language the report was requested in (req.lang).
          const sw = req.lang === "sw";
          const L = sw
            ? { title: "Michango ya Chakula", required: "Inatakiwa", brought: `Ametoa ${curYear}`, owed: "Anadaiwa", status: "Hali", done: "Imekamilika", owes: "Anadaiwa", dates: "Alileta lini", type: "Aina" }
            : { title: "Food Contributions", required: "Required", brought: `Brought ${curYear}`, owed: "Owed", status: "Status", done: "Completed", owes: "Owes", dates: "Dates brought", type: "Type" };
          doc.fontSize(10).font("Helvetica-Bold").fillColor("#0F172A").text(`${L.title} - ${curYear}:`);
          doc.moveDown(0.2);
          // Table: Type | Required | Brought (this year) | Owed | Status
          const left = doc.page.margins.left;
          const widths = [130, 85, 90, 85, 70];
          const colX = widths.reduce((acc, w) => [...acc, acc[acc.length - 1] + w], [left]);
          const tableW = colX[colX.length - 1] - left;
          const head = [L.type, L.required, L.brought, L.owed, L.status];
          doc.rect(left, doc.y, tableW, 16).fill("#334155");
          let hy = doc.y;
          doc.fillColor("#FFFFFF").fontSize(7.5).font("Helvetica-Bold");
          head.forEach((h, i) => doc.text(h, colX[i] + 3, hy + 4, { width: widths[i] - 6 }));
          let y = hy + 16;
          doc.font("Helvetica");
          foodSummary.forEach((r, i) => {
            if (i % 2 === 0) { doc.rect(left, y, tableW, 15).fill("#F8FAFC"); }
            const u = r.unit_short;
            const cells = [
              r.label,
              r.required ? `${r.required} ${u}` : "-",
              `${r.brought} ${u}`,
              r.required ? (r.remaining > 0 ? `${r.remaining} ${u}` : "0") : "-",
              r.required == null ? "-" : (r.completed ? L.done : L.owes),
            ];
            cells.forEach((c, k) => doc.fontSize(7.5).fillColor(k === 4 && r.required != null ? (r.completed ? "#15803D" : "#B91C1C") : "#0F172A").text(String(c), colX[k] + 3, y + 4, { width: widths[k] - 6 }));
            y += 15;
          });
          // thin grid: vertical column lines + top/bottom borders
          doc.strokeColor("#CBD5E1").lineWidth(0.5);
          [left, ...colX.slice(1), left + tableW].forEach((x) => doc.moveTo(x, hy).lineTo(x, y).stroke());
          doc.moveTo(left, hy).lineTo(left + tableW, hy).stroke();
          doc.moveTo(left, y).lineTo(left + tableW, y).stroke();
          doc.y = y + 6;
          // Dated deliveries per type (so "brought when" is clear).
          if (foodSummary.some((r) => r.entries.length)) {
            doc.fontSize(8.5).fillColor("#0F172A").font("Helvetica-Bold").text(`${L.dates}:`, left, doc.y, { width: tableW });
            doc.moveDown(0.1);
          }
          foodSummary.forEach((r) => {
            if (!r.entries.length) return;
            const parts = r.entries.map((e) => `${new Date(e.date).toLocaleDateString("en-GB", { timeZone: "Africa/Dar_es_Salaam" })} (${Number(e.quantity)} ${r.unit_short})`).join(",  ");
            doc.fontSize(8).fillColor("#475569").font("Helvetica").text(`${r.label}: ${parts}`, left, doc.y, { width: tableW });
          });
          doc.moveDown(0.5);
        }
    }

    // ── Student Results ──
    if (wantResults) {
      const sheetRes = await query(
        `SELECT ss.*, ap.exam_type, ap.month, ap.year FROM score_sheets ss JOIN academic_periods ap ON ap.id = ss.period_id WHERE ss.id = $1`,
        [req.query.results_sheet_id]
      );
      const sheet = sheetRes.rows[0];
      const srRes = sheet
        ? await query(`SELECT * FROM student_results WHERE sheet_id = $1 AND student_id = $2`, [req.query.results_sheet_id, req.params.id])
        : { rows: [] };

      doc.fontSize(12).font("Helvetica-Bold").fillColor("#0F172A")
        .text(sheet ? `Student Results - ${sheet.exam_type} (${sheet.month} ${sheet.year})` : "Student Results");
      doc.moveDown(0.3);

      if (!sheet || !srRes.rows.length) {
        doc.fontSize(10).font("Helvetica").fillColor("#64748B").text("No results found for the selected exam period.");
      } else {
        const sr = srRes.rows[0];
        const totalRes = await query(`SELECT COUNT(*)::int AS total FROM student_results WHERE sheet_id = $1`, [req.query.results_sheet_id]);
        const totalStudents = totalRes.rows[0]?.total ?? null;
        const scoresRes = await query(
          `SELECT sub.name AS subject_name, ROUND(sc.marks)::INT AS marks, sc.grade
           FROM included_scores sc JOIN subjects sub ON sc.subject_id = sub.id
           WHERE sc.sheet_id = $1 AND sc.student_id = $2 AND sc.marks IS NOT NULL
           ORDER BY sub.sort_order ASC, sub.code ASC`,
          [req.query.results_sheet_id, req.params.id]
        );
        // Rendered as an actual bordered table (Subject / Marks / Grade),
        // matching the Student Management colour scheme - not as plain
        // text lines like before.
        const left = doc.page.margins.left;
        const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const rColX = [left, left + tableWidth - 160, left + tableWidth - 80];
        const rTableTop = doc.y;
        doc.rect(left, rTableTop, tableWidth, 16).fill(STUDENT_THEME.headerBg);
        doc.fillColor(STUDENT_THEME.text).fontSize(9).font("Helvetica-Bold");
        ["Subject", "Marks", "Grade"].forEach((h, i) => doc.text(h, rColX[i] + 4, rTableTop + 4, { width: (rColX[i + 1] || left + tableWidth) - rColX[i] - 6 }));
        let ry = rTableTop + 16;
        const rRowYs = [rTableTop, ry];
        doc.font("Helvetica");
        scoresRes.rows.forEach((sc, idx) => {
          doc.rect(left, ry, tableWidth, 15).fill(idx % 2 === 0 ? STUDENT_THEME.rowBg : STUDENT_THEME.rowAltBg);
          const vals = [sc.subject_name, String(sc.marks ?? "-"), sc.grade || "-"];
          vals.forEach((v, i) => doc.fontSize(9).fillColor(STUDENT_THEME.text).text(v, rColX[i] + 4, ry + 3, { width: (rColX[i + 1] || left + tableWidth) - rColX[i] - 6 }));
          ry += 15;
          rRowYs.push(ry);
        });
        drawTableGrid(doc, rColX, left + tableWidth, rRowYs, STUDENT_THEME.border);
        doc.y = ry + 8;
        doc.x = left;
        doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#0F172A").text(
          `Division: ${sr.division ?? "-"}   Points: ${sr.points ?? "-"}   Position: ${sr.position != null && totalStudents != null ? `${sr.position} out of ${totalStudents}` : (sr.position ?? "-")}   GPA: ${sr.gpa ?? "-"}`
        );
      }
      doc.moveDown(1);
    }

    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

// POST /api/students/:id/photo - multipart upload, goes straight to Cloudinary
const uploadPhoto = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No photo uploaded." });

    const prev = await query("SELECT photo_url FROM students WHERE id = $1", [req.params.id]);
    if (!prev.rows.length) return res.status(404).json({ success: false, message: "Student not found." });

    const { uploadBufferToCloudinary, deleteCloudinaryImage, publicIdFromUrl } = require("../middleware/upload");
    const uploaded = await uploadBufferToCloudinary(req.file.buffer, { public_id: `student-${req.params.id}-${Date.now()}` });

    const result = await query(
      "UPDATE students SET photo_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [uploaded.secure_url, req.params.id]
    );

    // Remove the old Cloudinary photo (best-effort - don't fail the request if this errors).
    const oldPublicId = publicIdFromUrl(prev.rows[0].photo_url);
    if (oldPublicId) deleteCloudinaryImage(oldPublicId);

    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

// DELETE /api/students/:id/photo - removes the student's saved photo (both
// the Cloudinary image and the photo_url column), leaving the rest of the
// record untouched. Used from the Edit Student form's "Remove Photo" button
// for a photo that was already uploaded in a previous save (as opposed to
// one just picked locally, which the frontend can discard without a call).
const deletePhoto = async (req, res, next) => {
  try {
    const prev = await query("SELECT photo_url FROM students WHERE id = $1", [req.params.id]);
    if (!prev.rows.length) return res.status(404).json({ success: false, message: "Student not found." });
    if (!prev.rows[0].photo_url) return res.status(400).json({ success: false, message: "Student has no photo to remove." });

    const { deleteCloudinaryImage, publicIdFromUrl } = require("../middleware/upload");
    const oldPublicId = publicIdFromUrl(prev.rows[0].photo_url);
    if (oldPublicId) deleteCloudinaryImage(oldPublicId);

    const result = await query(
      "UPDATE students SET photo_url = NULL, updated_at = NOW() WHERE id = $1 RETURNING *",
      [req.params.id]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

const FORM_ORDER = ["Form I", "Form II", "Form III", "Form IV"];

// POST /api/students/promote  { student_ids: [...] }
// Bulk end-of-year promotion: Form I->II->III->IV, and Form IV -> Graduated
// (there's no Form V). Only the students in student_ids are promoted - the
// frontend sends every currently-checked student for a given form, having
// already let the Head Master un-check anyone who should NOT move up.
// Every student here is promoted TOGETHER in one transaction-like pass.
const promoteStudents = async (req, res, next) => {
  const { student_ids } = req.body;
  if (!Array.isArray(student_ids) || !student_ids.length)
    return res.status(400).json({ success: false, message: "No students selected to promote." });

  const client = await pool.connect();
  const run = (text, params) => client.query(text, params);
  try {
    await client.query("BEGIN");
    const { rows } = await run(`SELECT id, form, status, reg_no, first_name, middle_name, last_name, parent_name, parent_phone FROM students WHERE id = ANY($1::int[])`, [student_ids]);
    if (!rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "No matching students found." });
    }

    let promotedCount = 0, graduatedCount = 0, skippedCount = 0;
    const touchedForms = new Set();
    for (const s of rows) {
      // Only CURRENT students move up. A Transferred/Inactive/Graduated
      // student picked by mistake used to be moved into the next form too.
      if (s.status !== "Active") { skippedCount++; continue; }
      const idx = FORM_ORDER.indexOf(s.form);
      if (idx === -1) continue; // unrecognized form value - skip rather than guess
      touchedForms.add(s.form);
      if (idx === FORM_ORDER.length - 1) {
        const r = await run(`UPDATE students SET status = 'Graduated', graduated_at = NOW() WHERE id = $1 AND status != 'Graduated'`, [s.id]);
        // A 0-row result here means the student was already Graduated (a
        // harmless re-click) - anything else is a real problem, and used to
        // fail completely silently, leaving the Head Master with a
        // "Promotion Successfully Completed" message despite nothing
        // actually changing. Now it surfaces as a visible error instead.
        if (r.rowCount === 1) {
          graduatedCount++;
          // Record the graduation in history - without this, the Enrollment
          // History tab showed nothing at all for a graduated student.
          await logHistory(s.id, "Graduated", s.form, "Graduated", "Promoted from Form IV via bulk promotion.", req.user?.id, run);
          await run(
            `UPDATE hostel_occupants SET is_active = false, departed_date = (NOW() AT TIME ZONE 'Africa/Dar_es_Salaam')::date
             WHERE student_id = $1 AND is_active = true`, [s.id]);
        }
        await syncParentContact({ ...s, status: "Graduated" }, run);
      } else {
        const newForm = FORM_ORDER[idx + 1];
        // A student's reg_no is only unique *within their current form*
        // (every form's numbering restarts at S4005/0001) - carrying an
        // auto-assigned number straight into the new form almost always
        // collides with whichever student already holds that number there,
        // which used to fail the whole batch with a raw "duplicate" error.
        // Clearing it here (only when it's one of ours, not a manually
        // typed number) is safe: renumberAutoRegNos() below immediately
        // hands out a fresh, collision-free number in the new form.
        const clearAutoRegNo = s.reg_no && AUTO_REGNO_RE.test(s.reg_no);
        const r = await run(
          clearAutoRegNo
            ? `UPDATE students SET form = $1, reg_no = NULL WHERE id = $2`
            : `UPDATE students SET form = $1 WHERE id = $2`,
          [newForm, s.id]
        );
        if (r.rowCount !== 1) {
          throw new Error(`Failed to move ${fullNameOf(s)} (#${s.id}) from ${s.form} to ${newForm} - the database reported no row was updated. No students in this batch were promoted; please try again or contact support.`);
        }
        touchedForms.add(newForm);
        promotedCount++;
        // Record the promotion in history - same as a manual form edit does -
        // so "Form I → Form II" etc. shows up in the student's timeline.
        await logHistory(s.id, "Promoted", s.form, newForm, "Bulk end-of-year promotion.", req.user?.id, run);
        // Keep the student's current hostel record on the new Form too, so
        // hostel lists/reports don't keep showing last year's class.
        await run(`UPDATE hostel_occupants SET form = $1 WHERE student_id = $2 AND is_active = true`, [newForm, s.id]);
        // Moved up a form - re-sync so the parent now appears under the new
        // class (promotion doesn't change status, so keep whatever it was).
        await syncParentContact({ ...s, form: newForm }, run);
      }
    }
    // Every form that lost or gained students needs its auto reg numbers
    // re-sequenced (Female block first, then Male, alphabetical within each).
    for (const f of touchedForms) await renumberAutoRegNos(f, run);
    await client.query("COMMIT");
    res.json({
      success: true,
      message: `Promotion Successfully Completed - ${promotedCount} student(s) moved up a form${graduatedCount ? `, ${graduatedCount} graduated` : ""}${skippedCount ? `, ${skippedCount} skipped (not active)` : ""}.`,
      promoted: promotedCount, graduated: graduatedCount, skipped: skippedCount,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
};

// ══════════════════ Bulk Student Registration (CSV / Excel) ══════════════════
// POST /api/students/bulk-import/preview
// Parses an uploaded CSV/Excel roster and validates every row - but saves
// NOTHING. Lets the Head Master/Second Master see exactly what will be
// imported (and why any row would be skipped) before anything touches the
// database. A bad or garbled file can never damage live data at this step.
const previewStudentImport = async (req, res, next) => {
  try {
    if (!req.file)
      return res.status(400).json({ success: false, message: "No file was uploaded. Please choose a CSV or Excel (.xlsx/.xls) file." });

    let parsedRows;
    try {
      parsedRows = await parseRosterFile(req.file.buffer, req.file.originalname);
    } catch (parseErr) {
      return res.status(400).json({ success: false, message: parseErr.message || "Could not read this file. Please check the format and try again." });
    }

    if (!parsedRows.length)
      return res.status(400).json({ success: false, message: "No student rows were found below the header row." });
    if (parsedRows.length > MAX_IMPORT_ROWS)
      return res.status(400).json({ success: false, message: `This file has ${parsedRows.length} rows - the limit per import is ${MAX_IMPORT_ROWS}. Please split it into smaller files.` });

    const normalized = parsedRows.map(({ rowNumber, raw }) => {
      const { parsed, errors } = normalizeStudentRow(raw);
      return { row: rowNumber, parsed, errors: [...errors] };
    });

    // Flag duplicates WITHIN the file itself (same form + full name) - the
    // first occurrence stays clean, later ones are flagged so the same
    // student can't be inserted twice from one upload.
    const seenInFile = new Set();
    for (const r of normalized) {
      if (!r.parsed.form || !r.parsed.first_name || !r.parsed.last_name) continue;
      const key = `${r.parsed.form}::${fullNameKey(r.parsed)}`;
      if (seenInFile.has(key)) r.errors.push("Duplicate of another row already in this file (same name and form).");
      else seenInFile.add(key);
    }

    // Flag duplicates against students ALREADY in the database - one query
    // scoped to just the forms present in this file, not one query per row.
    const formsInFile = [...new Set(normalized.map((r) => r.parsed.form).filter(Boolean))];
    if (formsInFile.length) {
      const existingRes = await query(
        `SELECT form, first_name, middle_name, last_name FROM students WHERE form = ANY($1::text[])`,
        [formsInFile]
      );
      const existingKeys = new Set(existingRes.rows.map((s) => `${s.form}::${fullNameKey(s)}`));
      for (const r of normalized) {
        if (!r.parsed.form || !r.parsed.first_name || !r.parsed.last_name) continue;
        const key = `${r.parsed.form}::${fullNameKey(r.parsed)}`;
        if (existingKeys.has(key)) r.errors.push("Already registered in this form (same name).");
      }
    }

    const rows = normalized.map((r) => ({ ...r, valid: r.errors.length === 0 }));
    const validCount = rows.filter((r) => r.valid).length;

    res.json({ success: true, total: rows.length, valid_count: validCount, invalid_count: rows.length - validCount, rows });
  } catch (err) { next(err); }
};

// POST /api/students/bulk-import/commit
// Body: { rows: [ { first_name, last_name, gender, form, ... }, ... ] } -
// normally just the rows the Head Master/Second Master approved in the
// preview step. Every row is independently RE-validated and RE-checked for
// duplicates here regardless of what the preview said - never trust the
// client - so nothing invalid can reach the database even if the frontend
// had a bug or another registration happened in between.
const commitStudentImport = async (req, res, next) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || !rows.length)
    return res.status(400).json({ success: false, message: "No students to import." });
  if (rows.length > MAX_IMPORT_ROWS)
    return res.status(400).json({ success: false, message: `Too many rows in one request (limit ${MAX_IMPORT_ROWS}).` });

  try {
    const created = [];
    const failed = [];
    const touchedForms = new Set();

    for (let i = 0; i < rows.length; i++) {
      const { parsed, errors } = normalizeStudentRow(rows[i] || {});
      const label = [parsed.first_name, parsed.middle_name, parsed.last_name].filter(Boolean).join(" ") || `Row ${i + 1}`;
      if (errors.length) { failed.push({ row: i + 1, name: label, reason: errors.join(" ") }); continue; }

      try {
        const dupCheck = await query(
          `SELECT id FROM students
           WHERE form = $1
             AND LOWER(TRIM(first_name)) = LOWER(TRIM($2))
             AND LOWER(TRIM(COALESCE(middle_name,''))) = LOWER(TRIM(COALESCE($3,'')))
             AND LOWER(TRIM(last_name)) = LOWER(TRIM($4))
           LIMIT 1`,
          [parsed.form, parsed.first_name, parsed.middle_name || "", parsed.last_name]
        );
        if (dupCheck.rows.length) { failed.push({ row: i + 1, name: label, reason: `Already registered in ${parsed.form}.` }); continue; }

        const result = await query(`
          INSERT INTO students
            (prem_no, reg_no, first_name, middle_name, last_name, gender, dob,
             form, district, admission_date, status, parent_name, parent_phone,
             village, ward)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          RETURNING *
        `, [parsed.prem_no, parsed.reg_no, parsed.first_name, parsed.middle_name, parsed.last_name,
            parsed.gender, parsed.dob, parsed.form, parsed.district,
            parsed.admission_date || todayTZ(), parsed.status, parsed.parent_name, parsed.parent_phone,
            parsed.village, parsed.ward]);

        const student = result.rows[0];
        touchedForms.add(student.form);
        await assignAdmissionNo(student.id, student.admission_date);
        await assignResultsLoginNo(student.id, student.admission_date);
        await logHistory(student.id, "Enrolled", null, student.status, `Into ${student.form} (bulk import).`, req.user?.id);
        await syncParentContact(student);
        created.push(student);
      } catch (rowErr) {
        failed.push({ row: i + 1, name: label, reason: rowErr.message || "Could not save this student." });
      }
    }

    // Re-sequence auto reg numbers once per form touched (not once per
    // row) - cheaper, and every touched form ends up correctly ordered
    // regardless of how many rows landed in it.
    for (const f of touchedForms) await renumberAutoRegNos(f);

    // Refresh the created rows so the response carries each student's
    // FINAL reg_no (renumbering above may have changed it), not the
    // pre-renumber value from the INSERT.
    if (created.length) {
      const refreshed = await query(`SELECT * FROM students WHERE id = ANY($1::int[])`, [created.map((s) => s.id)]);
      const byId = new Map(refreshed.rows.map((s) => [s.id, s]));
      for (let i = 0; i < created.length; i++) created[i] = byId.get(created[i].id) || created[i];
    }

    res.status(created.length ? 201 : 200).json({
      success: true,
      created: created.length,
      failed_count: failed.length,
      students: created,
      failed,
      message: `${created.length} student(s) imported successfully.${failed.length ? ` ${failed.length} row(s) were skipped - see details.` : ""}`,
    });
  } catch (err) { next(err); }
};

module.exports = {
  getStudents, getStudent, createStudent, updateStudent,
  deleteStudent, getStats, addCharge, markChargePaid, deleteCharge,
  getHistory, exportStudentPdf, exportStudentsListPdf, uploadPhoto, deletePhoto,
  markTransferredOut, setPremNo, exportStudentReportPdf, genRegNo, promoteStudents,
  renumberAutoRegNos, deleteOldGraduatedStudents,
  previewStudentImport, commitStudentImport,
};

// Retention window before a Graduated student's record is removed - kept as
// one constant so the manual "Delete Old Graduated" button below and the
// automatic nightly job (backend/src/index.js) always agree.
const GRADUATED_RETENTION_YEARS = 2;

// DELETE /api/students/graduated/cleanup
// Manual, on-demand version of the automatic nightly cleanup in index.js -
// same rule (Graduated 2+ years ago), same effect - so an Admin/Second
// Master doesn't have to wait for the next scheduled run and can see exactly
// how many records were removed, right now.
async function deleteOldGraduatedStudents(req, res, next) {
  try {
    const toRemove = await query(
      `SELECT id, photo_url FROM students
       WHERE status = 'Graduated' AND graduated_at IS NOT NULL
         AND graduated_at < NOW() - ($1 || ' years')::interval`,
      [GRADUATED_RETENTION_YEARS]
    );
    const ids = toRemove.rows.map((r) => r.id);
    const resultPdfsRes = ids.length
      ? await query("SELECT public_id FROM student_result_pdfs WHERE student_id = ANY($1::int[])", [ids])
      : { rows: [] };

    const result = await query(
      `DELETE FROM students
       WHERE status = 'Graduated' AND graduated_at IS NOT NULL
         AND graduated_at < NOW() - ($1 || ' years')::interval
       RETURNING id, form`,
      [GRADUATED_RETENTION_YEARS]
    );
    if (result.rowCount) {
      const touchedForms = new Set(result.rows.map((r) => r.form));
      for (const f of touchedForms) await renumberAutoRegNos(f);

      const { deleteCloudinaryImage, deleteCloudinaryAsset, publicIdFromUrl } = require("../middleware/upload");
      toRemove.rows.forEach((r) => { const pid = publicIdFromUrl(r.photo_url); if (pid) deleteCloudinaryImage(pid); });
      resultPdfsRes.rows.forEach((r) => { if (r.public_id) deleteCloudinaryAsset(r.public_id, "raw"); });
    }
    res.json({
      success: true,
      message: result.rowCount
        ? `Removed ${result.rowCount} graduated student(s) who graduated ${GRADUATED_RETENTION_YEARS}+ years ago.`
        : `No graduated students older than ${GRADUATED_RETENTION_YEARS} years were found.`,
      removed: result.rowCount,
    });
  } catch (err) { next(err); }
}
