const { query } = require("../db/db");
const PDFDocument = require("pdfkit");
const { tzColumn, formatTZ, dateOnly, todayTZ } = require("../utils/tz");
const { drawLetterhead, drawFooter, drawTableGrid } = require("../utils/pdfHeader");

const fullName = (o) => [o.first_name, o.middle_name, o.last_name].filter(Boolean).join(" ");

const logHistory = async (occupantId, eventType, note, userId) => {
  await query(`
    INSERT INTO hostel_history (occupant_id, event_type, note, recorded_by)
    VALUES ($1,$2,$3,$4)
  `, [occupantId, eventType, note || null, userId || null]);
};

// ── Rooms (GIRLS HOSTEL ONLY - Boys Hostel is one Hall, no rooms) ────────────

// GET /api/hostel/rooms?hostel=Girls Hostel
const getRooms = async (req, res, next) => {
  try {
    const { hostel } = req.query;
    let sql = `
      SELECT r.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', o.id, 'student_id', o.student_id,
              'first_name', o.first_name, 'middle_name', o.middle_name, 'last_name', o.last_name,
              'form', o.form, 'admitted_date', o.admitted_date
            ) ORDER BY o.admitted_date
          ) FILTER (WHERE o.id IS NOT NULL AND o.is_active = true), '[]'
        ) AS occupants,
        (SELECT COUNT(*) FROM hostel_occupants o2 WHERE o2.room_id = r.id AND o2.is_active = true) AS occupied_count
      FROM hostel_rooms r
      LEFT JOIN hostel_occupants o ON o.room_id = r.id AND o.is_active = true
      WHERE 1=1
    `;
    const params = [];
    if (hostel) { sql += " AND r.hostel_name = $1"; params.push(hostel); }
    sql += " GROUP BY r.id ORDER BY r.hostel_name, r.room_number";
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// POST /api/hostel/rooms - add a room (beds). Girls Hostel only.
const createRoom = async (req, res, next) => {
  try {
    const { hostel_name, room_number, capacity, gender } = req.body;
    if (!hostel_name || !room_number || !capacity)
      return res.status(400).json({ success: false, message: "Hostel, room number and bed capacity are required." });
    if (hostel_name !== "Girls Hostel")
      return res.status(400).json({ success: false, message: "Only Girls Hostel has rooms. Boys use the boarding facility directly (no room needed)." });

    const result = await query(`
      INSERT INTO hostel_rooms (hostel_name, room_number, capacity, gender)
      VALUES ($1,$2,$3,'Female') RETURNING *
    `, [hostel_name, room_number, capacity]);
    res.status(201).json({ success: true, data: result.rows[0], message: "Room Successfully Added." });
  } catch (err) { next(err); }
};

// PUT /api/hostel/rooms/:id - edit beds (capacity) / room number
const updateRoom = async (req, res, next) => {
  try {
    const { room_number, capacity } = req.body;
    const result = await query(`
      UPDATE hostel_rooms SET room_number = COALESCE($1, room_number), capacity = COALESCE($2, capacity)
      WHERE id = $3 RETURNING *
    `, [room_number, capacity, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Room not found." });
    res.json({ success: true, data: result.rows[0], message: "Room Successfully Updated." });
  } catch (err) { next(err); }
};

// DELETE /api/hostel/rooms/:id - remove a room (blocked while it has active occupants)
const deleteRoom = async (req, res, next) => {
  try {
    const occ = await query(`SELECT COUNT(*) FROM hostel_occupants WHERE room_id = $1 AND is_active = true`, [req.params.id]);
    if (parseInt(occ.rows[0].count) > 0)
      return res.status(400).json({ success: false, message: "Remove all students from this room before deleting it." });
    const result = await query(`DELETE FROM hostel_rooms WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Room not found." });
    res.json({ success: true, message: "Room removed." });
  } catch (err) { next(err); }
};

// ── Stats ──────────────────────────────────────────────────────────────────

// GET /api/hostel/occupants?search=  - search active residents across BOTH hostels
// (used by the School Contributions module to find who to record a contribution for).
const searchOccupants = async (req, res, next) => {
  try {
    const { search = "", hostel } = req.query;
    const params = [`%${search.toLowerCase()}%`];
    let hostelClause = "";
    if (hostel) { params.push(hostel); hostelClause = `AND o.hostel_name = $${params.length}`; }
    const result = await query(`
      SELECT o.*, r.room_number
      FROM hostel_occupants o LEFT JOIN hostel_rooms r ON r.id = o.room_id
      WHERE o.is_active = true
        AND LOWER(o.first_name || ' ' || COALESCE(o.middle_name,'') || ' ' || o.last_name) LIKE $1
        ${hostelClause}
      ORDER BY o.last_name LIMIT 30
    `, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// GET /api/hostel/stats
// GET /api/hostel/history-by-class?hostel_name=Boys Hostel
// Full admission history for a hostel, grouped by Form - every student ever
// admitted (current AND past/departed), so the Head Master/Patron/Matron can
// see the whole class-by-class record, not just who's there right now.
const getHistoryByClass = async (req, res, next) => {
  try {
    const { hostel_name } = req.query;
    if (!hostel_name || !["Boys Hostel", "Girls Hostel"].includes(hostel_name))
      return res.status(400).json({ success: false, message: "hostel_name must be 'Boys Hostel' or 'Girls Hostel'." });

    const result = await query(`
      SELECT o.id, o.form, o.first_name, o.middle_name, o.last_name, o.is_active,
        o.admitted_date, r.room_number,
        (SELECT h.event_at FROM hostel_history h WHERE h.occupant_id = o.id AND h.event_type = 'Departed' ORDER BY h.event_at DESC LIMIT 1) AS departed_date
      FROM hostel_occupants o
      LEFT JOIN hostel_rooms r ON r.id = o.room_id
      WHERE o.hostel_name = $1
      ORDER BY o.form, o.last_name, o.first_name
    `, [hostel_name]);

    const byForm = {};
    for (const row of result.rows) {
      const f = row.form || "Unspecified";
      if (!byForm[f]) byForm[f] = [];
      byForm[f].push(row);
    }
    res.json({ success: true, hostel_name, data: byForm });
  } catch (err) { next(err); }
};

const getStats = async (req, res, next) => {
  try {
    const girls = await query(`
      SELECT 'Girls Hostel' AS hostel_name, 'Female' AS gender,
        COALESCE(SUM(r.capacity),0) AS total_beds,
        (SELECT COUNT(*) FROM hostel_occupants o WHERE o.hostel_name='Girls Hostel' AND o.is_active=true) AS occupied
      FROM hostel_rooms r WHERE r.hostel_name = 'Girls Hostel'
    `);
    const boys = await query(`
      SELECT 'Boys Hostel' AS hostel_name, 'Male' AS gender,
        NULL::bigint AS total_beds,
        (SELECT COUNT(*) FROM hostel_occupants o WHERE o.hostel_name='Boys Hostel' AND o.is_active=true) AS occupied
    `);
    res.json({ success: true, data: [...girls.rows, ...boys.rows] });
  } catch (err) { next(err); }
};

// ── Admission - Girls (room-based) ───────────────────────────────────────────

// A boy must never be admitted into the Girls Hostel (or a girl into the
// Boys Hostel), and only a CURRENT student can be admitted - previously
// neither was checked, so a wrong pick in the student search silently put a
// boy into a girls' room.
function hostelGenderError(student, requiredGender, hostelName) {
  const g = String(student.gender || "").trim().toLowerCase();
  const want = String(requiredGender || "").trim().toLowerCase();
  const norm = (x) => (x.startsWith("f") ? "female" : x.startsWith("m") ? "male" : x);
  if (student.status && String(student.status).toLowerCase() !== "active") {
    return `This student is not an active student (status: ${student.status}) and cannot be admitted to a hostel.`;
  }
  if (g && want && norm(g) !== norm(want)) {
    return norm(want) === "female"
      ? `${hostelName} is for girls only - this student is registered as Male.`
      : `${hostelName} is for boys only - this student is registered as Female.`;
  }
  return null;
}

// POST /api/hostel/rooms/:roomId/assign
const assignStudent = async (req, res, next) => {
  try {
    const { student_id, admitted_date } = req.body;
    if (!student_id)
      return res.status(400).json({ success: false, message: "Select an enrolled student to admit." });

    const studentRes = await query(`SELECT first_name, middle_name, last_name, form, gender, status FROM students WHERE id = $1`, [student_id]);
    if (!studentRes.rows.length)
      return res.status(404).json({ success: false, message: "That student was not found in Student Management." });
    const { first_name, middle_name, last_name, form } = studentRes.rows[0];

    const already = await query(`SELECT id, hostel_name FROM hostel_occupants WHERE student_id = $1 AND is_active = true`, [student_id]);
    if (already.rows.length)
      return res.status(400).json({ success: false, message: `This student is already registered in ${already.rows[0].hostel_name}. A student can only be registered in one hostel.` });

    const cap = await query(`
      SELECT r.capacity, r.hostel_name, r.room_number, r.gender,
        (SELECT COUNT(*) FROM hostel_occupants o WHERE o.room_id = r.id AND o.is_active = true) AS occupied
      FROM hostel_rooms r WHERE r.id = $1
    `, [req.params.roomId]);
    if (!cap.rows.length) return res.status(404).json({ success: false, message: "Room not found." });

    const { capacity, occupied, hostel_name, room_number, gender: roomGender } = cap.rows[0];
    const genderErr = hostelGenderError(studentRes.rows[0], roomGender || "Female", hostel_name);
    if (genderErr) return res.status(400).json({ success: false, message: genderErr });
    if (parseInt(occupied) >= parseInt(capacity))
      return res.status(400).json({ success: false, message: "Room is full." });

    const result = await query(`
      INSERT INTO hostel_occupants (room_id, hostel_name, student_id, first_name, middle_name, last_name, form, admitted_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8, (NOW() AT TIME ZONE 'Africa/Dar_es_Salaam')::date)) RETURNING *
    `, [req.params.roomId, hostel_name, student_id, first_name, middle_name || null, last_name, form,
        admitted_date || null]);

    const occupant = result.rows[0];
    await logHistory(occupant.id, "Admitted", `Admitted into ${hostel_name}, ${room_number || `Room ${occupant.room_id}`}.`, req.user?.id);
    res.status(201).json({ success: true, data: occupant });
  } catch (err) { next(err); }
};

// ── Admission - Boys (Boarding Facility, no rooms) ─────────────────────────

// GET /api/hostel/boys - list active Boys Hostel occupants (no room grouping - just the Hall)
const getBoysOccupants = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT * FROM hostel_occupants
      WHERE hostel_name = 'Boys Hostel' AND is_active = true
      ORDER BY admitted_date DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// POST /api/hostel/boys - admit a boy directly into the Hall (no room/bed count)
const admitBoysHall = async (req, res, next) => {
  try {
    const { student_id, admitted_date } = req.body;
    if (!student_id)
      return res.status(400).json({ success: false, message: "Select an enrolled student to admit." });

    const studentRes = await query(`SELECT first_name, middle_name, last_name, form, gender, status FROM students WHERE id = $1`, [student_id]);
    if (!studentRes.rows.length)
      return res.status(404).json({ success: false, message: "That student was not found in Student Management." });
    const { first_name, middle_name, last_name, form } = studentRes.rows[0];

    const already = await query(`SELECT id, hostel_name FROM hostel_occupants WHERE student_id = $1 AND is_active = true`, [student_id]);
    if (already.rows.length)
      return res.status(400).json({ success: false, message: `This student is already registered in ${already.rows[0].hostel_name}. A student can only be registered in one hostel.` });

    const genderErr = hostelGenderError(studentRes.rows[0], "Male", "Boys Hostel");
    if (genderErr) return res.status(400).json({ success: false, message: genderErr });

    const result = await query(`
      INSERT INTO hostel_occupants (room_id, hostel_name, student_id, first_name, middle_name, last_name, form, admitted_date)
      VALUES (NULL,'Boys Hostel',$1,$2,$3,$4,$5, COALESCE($6, (NOW() AT TIME ZONE 'Africa/Dar_es_Salaam')::date)) RETURNING *
    `, [student_id, first_name, middle_name || null, last_name, form, admitted_date || null]);

    const occupant = result.rows[0];
    await logHistory(occupant.id, "Admitted", "Admitted into the Boys boarding facility.", req.user?.id);
    res.status(201).json({ success: true, data: occupant, message: "Student Successfully Admitted to the hostel." });
  } catch (err) { next(err); }
};

// ── Removal (both hostels) ────────────────────────────────────────────────────

// DELETE /api/hostel/occupants/:occupantId
const removeOccupant = async (req, res, next) => {
  try {
    const result = await query(`
      UPDATE hostel_occupants
      SET is_active = false, departed_date = ((NOW() AT TIME ZONE 'Africa/Dar_es_Salaam')::date)
      WHERE id = $1 AND is_active = true RETURNING *
    `, [req.params.occupantId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Occupant not found, or already removed from the hostel." });
    await logHistory(result.rows[0].id, "Departed", "Left the hostel.", req.user?.id);
    res.json({ success: true, message: "Student removed from hostel." });
  } catch (err) { next(err); }
};

// DELETE /api/hostel/occupants/:occupantId/permanent
// Hard-delete a MISTAKEN registration (wrong student picked, duplicate
// admission, etc). This is different from removeOccupant() above:
//   - removeOccupant() = soft delete (is_active=false, departed_date set).
//     Used for a REAL departure - the student genuinely leaves the hostel,
//     and by design they must keep showing up forever in
//     getHistoryByClass()/HostelHistoryTab as "Departed", because that is
//     the permanent admission record the Matron/Patron need.
//   - permanentlyDeleteOccupant() = hard delete. Used ONLY to correct a
//     registration mistake that should never have existed in the first
//     place. It removes the hostel_occupants row entirely (hostel_history
//     and hostel_contributions rows for it cascade-delete automatically -
//     see migrate.js ON DELETE CASCADE), so the mistaken entry:
//       1. stops lingering in History after being "removed" (it disappears
//          completely instead of sitting there forever as "Departed"), and
//       2. does not leave a duplicate row behind if the same student is
//          then correctly re-admitted (soft-delete kept the old row, so
//          admitting them again created a second, separate occupant row -
//          hence the student appearing twice in History).
const permanentlyDeleteOccupant = async (req, res, next) => {
  try {
    const result = await query(`DELETE FROM hostel_occupants WHERE id = $1 RETURNING id`, [req.params.occupantId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Occupant not found." });
    res.json({ success: true, message: "Registration permanently deleted - it will no longer appear in History." });
  } catch (err) { next(err); }
};

// GET /api/hostel/occupants/:id
const getOccupant = async (req, res, next) => {
  try {
    const result = await query(`SELECT o.*, r.room_number FROM hostel_occupants o LEFT JOIN hostel_rooms r ON r.id=o.room_id WHERE o.id=$1`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Occupant not found." });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

// ── History ────────────────────────────────────────────────────────────────

// GET /api/hostel/occupants/:id/history
const getHistory = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT h.*, ${tzColumn("h.event_at", "event_at_tz")}, u.full_name AS recorded_by_name
      FROM hostel_history h
      LEFT JOIN users u ON u.id = h.recorded_by
      WHERE h.occupant_id = $1 ORDER BY h.event_at DESC
    `, [req.params.id]);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// ── Contributions (Maize / Vegetables / Oil / Hostel Fee + owing status) ─────

// GET /api/hostel/occupants/:id/contributions
const getContributions = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT c.*, ${tzColumn("c.created_at", "created_at_tz")}, u.full_name AS recorded_by_name
      FROM hostel_contributions c
      LEFT JOIN users u ON u.id = c.recorded_by
      WHERE c.occupant_id = $1 ORDER BY c.created_at DESC
    `, [req.params.id]);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// POST /api/hostel/occupants/:id/contributions
const addContribution = async (req, res, next) => {
  try {
    const {
      term, academic_year, maize_kg, vegetable_type, vegetables_kg,
      oil_litres, salt_kg, rice_kg, hostel_fee, owes, comment,
    } = req.body;
    // Every quantity/amount must be a real number >= 0 (previously "-5" kg
    // was stored as-is), and a contribution with nothing in it at all is
    // refused instead of creating an empty record.
    const amounts = { "Maize": maize_kg, "Vegetables": vegetables_kg, "Cooking Oil": oil_litres, "Salt": salt_kg, "Rice": rice_kg, "Hostel Fee": hostel_fee };
    for (const [label, v] of Object.entries(amounts)) {
      if (v === undefined || v === null || v === "") continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ success: false, message: `${label} must be a number of 0 or more.` });
      }
    }
    const anyAmount = Object.values(amounts).some((v) => Number(v) > 0);
    if (!anyAmount && !owes && !(comment && String(comment).trim())) {
      return res.status(400).json({ success: false, message: "Enter at least one item or amount for this contribution." });
    }
    const occ = await query(`SELECT id FROM hostel_occupants WHERE id = $1`, [req.params.id]);
    if (!occ.rows.length) return res.status(404).json({ success: false, message: "Hostel student not found." });

    // NOTE: "Other Item" (e.g. Soap) has been removed from the form per request -
    // the column still exists in the database for old records, so it is left
    // out of every new INSERT instead of being dropped (no data loss, no logic broken).
    const result = await query(`
      INSERT INTO hostel_contributions
        (occupant_id, term, academic_year, maize_kg, vegetable_type, vegetables_kg,
         oil_litres, salt_kg, rice_kg, hostel_fee, owes, comment, recorded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [req.params.id, term || null, academic_year || null,
        maize_kg || 0, vegetable_type || null, vegetables_kg || 0,
        oil_litres || 0, salt_kg || 0, rice_kg || 0,
        hostel_fee || 0, !!owes, comment || null, req.user?.id || null]);

    const vegDesc = vegetables_kg ? `${vegetable_type || "Vegetables"} ${vegetables_kg}kg` : "";
    await logHistory(req.params.id, "Contribution Recorded",
      `Maize ${maize_kg||0}kg${vegDesc ? `, ${vegDesc}` : ""}, Cooking Oil ${oil_litres||0}L, Salt ${salt_kg||0}kg, Rice ${rice_kg||0}kg, Fee TZS ${hostel_fee||0} - ${owes?"Outstanding":"Paid"}.`,
      req.user?.id);

    res.status(201).json({ success: true, data: result.rows[0], message: "Contribution Successfully Recorded." });
  } catch (err) { next(err); }
};

// DELETE /api/hostel/contributions/:id
const deleteContribution = async (req, res, next) => {
  try {
    await query(`DELETE FROM hostel_contributions WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: "Contribution record removed." });
  } catch (err) { next(err); }
};

// ── Discipline ─────────────────────────────────────────────────────────────

// GET /api/hostel/discipline
const getDiscipline = async (req, res, next) => {
  try {
    const { hostel } = req.query;
    let sql = "SELECT * FROM hostel_discipline WHERE 1=1";
    const params = [];
    if (hostel) { sql += " AND hostel_name = $1"; params.push(hostel); }
    sql += " ORDER BY incident_date DESC";
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// POST /api/hostel/discipline
const addDiscipline = async (req, res, next) => {
  try {
    const { student_name, student_id, room_id, hostel_name, room_number, severity, issue, action_taken, incident_date } = req.body;
    if (!student_name || !issue)
      return res.status(400).json({ success: false, message: "Student name and issue required." });

    const result = await query(`
      INSERT INTO hostel_discipline
        (student_name, student_id, room_id, hostel_name, room_number,
         severity, issue, action_taken, incident_date, recorded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [student_name, student_id || null, room_id || null, hostel_name || null,
        room_number || null, severity || "Minor", issue,
        action_taken || null,
        // incident_date is NOT NULL in the schema. The frontend's date input
        // starts empty ("") when the user doesn't pick a date, and "" is
        // falsy just like undefined/null - so this used to fall through to
        // `|| null` and insert NULL into a NOT NULL column, which Postgres
        // rejects outright (the column's own CURRENT_DATE default is never
        // applied when a value, even NULL, is explicitly supplied). Default
        // to today in Tanzania time instead, so the request always succeeds.
        incident_date || todayTZ(),
        req.user?.id || null]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

// ── PDF Export ────────────────────────────────────────────────────────────────

// GET /api/hostel/occupants/:id/pdf - profile + contributions + history
const exportOccupantPdf = async (req, res, next) => {
  try {
    const oRes = await query(`SELECT o.*, r.room_number FROM hostel_occupants o LEFT JOIN hostel_rooms r ON r.id=o.room_id WHERE o.id=$1`, [req.params.id]);
    if (!oRes.rows.length) return res.status(404).json({ success: false, message: "Occupant not found." });
    const o = oRes.rows[0];

    const [contribRes, histRes] = await Promise.all([
      query(`SELECT *, ${tzColumn("created_at","created_at_tz")} FROM hostel_contributions WHERE occupant_id=$1 ORDER BY created_at DESC`, [req.params.id]),
      query(`SELECT *, ${tzColumn("event_at","event_at_tz")} FROM hostel_history WHERE occupant_id=$1 ORDER BY event_at DESC`, [req.params.id]),
    ]);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="hostel-${fullName(o).replace(/\s+/g,"-")}.pdf"`);
    const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
    doc.pipe(res);
    drawLetterhead(doc, `Hostel Resident Profile - ${fullName(o)}`);

    const row = (label, value) => {
      const labelW = 150, startY = doc.y, startX = doc.page.margins.left;
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#475569").text(label, startX, startY, { width: labelW, lineBreak: false });
      doc.font("Helvetica").fillColor("#0F172A").text(String(value ?? "-"), startX + labelW, startY, { lineBreak: false });
      doc.x = startX; doc.y = startY + 16;
    };
    row("Full Name:", fullName(o));
    row("Hostel:", o.hostel_name);
    row("Room:", o.room_number || (o.hostel_name==="Boys Hostel" ? "Boarding Facility (no room numbers)" : "-"));
    row("Form:", o.form);
    row("Admitted:", dateOnly(o.admitted_date) || "-");
    row("Status:", o.is_active ? "Active" : `Departed ${dateOnly(o.departed_date) || ""}`);
    doc.moveDown(1);

    doc.fontSize(12).font("Helvetica-Bold").fillColor("#0F172A").text("Contributions");
    doc.moveDown(0.3);
    if (!contribRes.rows.length) doc.fontSize(10).font("Helvetica").fillColor("#64748B").text("No contributions recorded.");
    else contribRes.rows.forEach(c => {
      const veg = Number(c.vegetables_kg) ? `${c.vegetable_type || "Vegetables"} ${c.vegetables_kg}kg` : null;
      const other = c.other_item ? `${c.other_item} ${c.other_qty || ""}` : null;
      const parts = [`Maize ${c.maize_kg}kg`, veg, `Cooking Oil ${c.oil_litres}L`, Number(c.salt_kg) ? `Salt ${c.salt_kg}kg` : null, other, `Fee TZS ${Number(c.hostel_fee).toLocaleString()}`].filter(Boolean);
      doc.fontSize(9).font("Helvetica").fillColor("#0F172A").text(
        `${c.created_at_tz}  -  ${c.term || ""} ${c.academic_year || ""}  -  ${parts.join(", ")}  -  ${c.owes?"OUTSTANDING":"Paid"}${c.comment?`  (${c.comment})`:""}`
      );
    });
    doc.moveDown(1);

    doc.fontSize(12).font("Helvetica-Bold").fillColor("#0F172A").text("History");
    doc.moveDown(0.3);
    if (!histRes.rows.length) doc.fontSize(10).font("Helvetica").fillColor("#64748B").text("No history recorded.");
    else histRes.rows.forEach(h => {
      doc.fontSize(9).font("Helvetica").fillColor("#0F172A").text(`${h.event_at_tz}  -  ${h.event_type}${h.note?`  ${h.note}`:""}`);
    });

    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

// GET /api/hostel/contributions/:id/receipt - official receipt for one contribution record
const exportContributionReceipt = async (req, res, next) => {
  try {
    const r = await query(`
      SELECT c.*, o.first_name, o.middle_name, o.last_name, o.form, o.hostel_name
      FROM hostel_contributions c JOIN hostel_occupants o ON o.id = c.occupant_id
      WHERE c.id = $1
    `, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ success: false, message: "Contribution record not found." });
    const c = r.rows[0];
    const veg = Number(c.vegetables_kg) ? `${c.vegetable_type || "Vegetables"} ${c.vegetables_kg}kg` : null;
    const parts = [`Maize ${c.maize_kg}kg`, veg, `Cooking Oil ${c.oil_litres}L`, Number(c.salt_kg) ? `Salt ${c.salt_kg}kg` : null, Number(c.rice_kg) ? `Rice ${c.rice_kg}kg` : null, `Fee TZS ${Number(c.hostel_fee).toLocaleString()}`].filter(Boolean);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="receipt-hostel-${c.id}.pdf"`);
    const doc = new PDFDocument({ margin: 40, size: "A5" });
    doc.pipe(res);
    drawLetterhead(doc, "Official Receipt - Hostel Contribution");

    const row2 = (label, value) => {
      const labelW = 140, startY = doc.y, startX = doc.page.margins.left;
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#475569").text(label, startX, startY, { width: labelW, lineBreak: false });
      doc.font("Helvetica").fillColor("#0F172A").text(String(value ?? "-"), startX + labelW, startY, { lineBreak: false });
      doc.x = startX; doc.y = startY + 18;
    };
    row2("Student Name:", fullName(c));
    row2("Form:", c.form);
    row2("Hostel:", c.hostel_name);
    row2("Term/Year:", `${c.term || "-"} ${c.academic_year || ""}`);
    row2("Contribution:", parts.join(", "));
    row2("Status:", c.owes ? "Outstanding" : "Paid");
    if (c.comment) row2("Comment:", c.comment);
    doc.moveDown(1);

    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

// GET /api/hostel/pdf?hostel=Girls Hostel - full resident list for a hostel.
// For Girls Hostel (the only hostel with rooms) the list is broken down
// room-by-room - "ROOM 1", then every student in it, "ROOM 2", and so on -
// so the Matron can hand this straight to an inspection instead of having
// to cross-reference a flat name list against which student lives where.
// Boys Hostel has no rooms (one shared Hall), so it stays a single list.
const exportHostelListPdf = async (req, res, next) => {
  try {
    const { hostel = "Girls Hostel" } = req.query;
    const result = await query(`
      SELECT o.*, r.room_number FROM hostel_occupants o LEFT JOIN hostel_rooms r ON r.id=o.room_id
      WHERE o.hostel_name = $1 AND o.is_active = true
      ORDER BY r.room_number NULLS LAST, o.last_name
    `, [hostel]);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${hostel.replace(/\s+/g,"-")}-residents.pdf"`);
    const doc = new PDFDocument({ margin: 30, size: "A4", bufferPages: true });
    doc.pipe(res);
    drawLetterhead(doc, `${hostel} - Resident List (${result.rows.length})`);

    const left = doc.page.margins.left;
    const tableWidth = 480;
    const colX = [left, left + 190, left + 320, left + 400];
    const headers = ["Full Name", "Form", "Admitted", ""];

    // Draws one room/section's own mini-table (its own header row, zebra
    // striping, and border) - starting wherever doc.y currently is, and
    // moving to a new page first if there isn't reasonable room left.
    const drawSection = (label, occupants) => {
      if (doc.y > 680) doc.addPage({ margin: 30, size: "A4" });
      doc.moveDown(0.7);
      doc.fontSize(10.5).font("Helvetica-Bold").fillColor("#1E3A8A")
        .text(`${label}  -  ${occupants.length} student${occupants.length === 1 ? "" : "s"}`, left, doc.y);
      doc.moveDown(0.25);

      const tableTop = doc.y;
      const drawHeaderRow = (y) => {
        doc.rect(left, y, tableWidth, 18).fill("#334155");
        doc.fillColor("#FFFFFF").fontSize(8).font("Helvetica-Bold");
        headers.forEach((h, i) => doc.text(h, colX[i] + 4, y + 5, { width: (colX[i + 1] || left + tableWidth) - colX[i] - 6 }));
        return y + 18;
      };
      let y = drawHeaderRow(tableTop);
      const rowYs = [tableTop, y]; // every row boundary on the CURRENT page, header included
      doc.font("Helvetica");
      occupants.forEach((o, idx) => {
        if (y > 760) {
          drawTableGrid(doc, colX, left + tableWidth, rowYs); // close out this page's grid before starting a new one
          doc.addPage({ margin: 30, size: "A4" });
          y = drawHeaderRow(40);
          rowYs.length = 0; rowYs.push(40, y);
        }
        if (idx % 2 === 0) doc.rect(left, y, tableWidth, 16).fill("#F8FAFC");
        const vals = [fullName(o), o.form, dateOnly(o.admitted_date), ""];
        vals.forEach((v, i) => doc.fontSize(8).fillColor("#0F172A").font("Helvetica").text(String(v), colX[i] + 4, y + 4, { width: (colX[i + 1] || left + tableWidth) - colX[i] - 6 }));
        y += 16;
        rowYs.push(y);
      });
      drawTableGrid(doc, colX, left + tableWidth, rowYs);
      doc.y = y + 4;
    };

    if (hostel === "Girls Hostel") {
      const byRoom = {};
      const noRoom = [];
      result.rows.forEach((o) => {
        if (o.room_number) { (byRoom[o.room_number] ||= []).push(o); }
        else noRoom.push(o);
      });
      const roomNumbers = Object.keys(byRoom).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      if (!roomNumbers.length && !noRoom.length) {
        doc.fontSize(10).font("Helvetica").fillColor("#64748B").text("No residents currently recorded.");
      }
      roomNumbers.forEach((rn) => drawSection(`ROOM ${rn}`, byRoom[rn]));
      if (noRoom.length) drawSection("Unassigned / No Room Recorded", noRoom);
    } else {
      if (!result.rows.length) {
        doc.fontSize(10).font("Helvetica").fillColor("#64748B").text("No residents currently recorded.");
      } else {
        drawSection("Boarding Facility (Hall)", result.rows);
      }
    }

    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

// GET /api/hostel/discipline/pdf?hostel=Girls Hostel - discipline records export
const exportDisciplinePdf = async (req, res, next) => {
  try {
    const { hostel } = req.query;
    let sql = "SELECT * FROM hostel_discipline WHERE 1=1";
    const params = [];
    if (hostel) { sql += " AND hostel_name = $1"; params.push(hostel); }
    sql += " ORDER BY incident_date DESC";
    const result = await query(sql, params);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="discipline-records${hostel ? `-${hostel.replace(/\s+/g,"-")}` : ""}.pdf"`);
    const doc = new PDFDocument({ margin: 30, size: "A4", layout: "landscape", bufferPages: true });
    doc.pipe(res);
    drawLetterhead(doc, `Discipline Records${hostel ? ` - ${hostel}` : ""} (${result.rows.length})`);

    const left = doc.page.margins.left;
    const colX = [left, left+90, left+230, left+310, left+390, left+490, left+590];
    const headers = ["Date", "Student", "Hostel", "Room", "Severity", "Issue", "Action Taken"];
    const tableTop = doc.y;
    doc.rect(left, tableTop, 770, 18).fill("#334155");
    doc.fillColor("#FFFFFF").fontSize(8).font("Helvetica-Bold");
    headers.forEach((h,i) => doc.text(h, colX[i]+4, tableTop+5, { width: (colX[i+1]||left+770)-colX[i]-6 }));
    let y = tableTop + 18;
    let rowYs = [tableTop, y];

    doc.font("Helvetica").fillColor("#0F172A");
    result.rows.forEach((d, idx) => {
      if (y > 500) {
        drawTableGrid(doc, colX, left + 770, rowYs); // close out this page's grid before starting a new one
        doc.addPage({ margin: 30, size: "A4", layout: "landscape" });
        y = 40;
        rowYs = [40, 40];
      }
      if (idx % 2 === 0) doc.rect(left, y, 770, 22).fill("#F8FAFC").fillColor("#0F172A");
      const dateStr = dateOnly(d.incident_date) || "-";
      const vals = [dateStr, d.student_name, d.hostel_name || "-", d.room_number || "-", d.severity, d.issue, d.action_taken || "-"];
      vals.forEach((v,i) => doc.fontSize(7.5).fillColor("#0F172A").text(String(v), colX[i]+4, y+4, { width: (colX[i+1]||left+770)-colX[i]-6 }));
      y += 22;
      rowYs.push(y);
    });
    drawTableGrid(doc, colX, left + 770, rowYs);

    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

// PATCH /api/hostel/occupants/:id - fix a registration recorded by mistake:
// the admission date and, for the Girls Hostel, the room (capacity + gender
// checked). The class/name come from Student Management and are not edited
// here. Matron/Patron and Head Master/Second Master.
const updateOccupant = async (req, res, next) => {
  try {
    const { admitted_date, room_id } = req.body;
    const occRes = await query(
      `SELECT o.*, s.gender AS student_gender, s.status AS student_status FROM hostel_occupants o
       LEFT JOIN students s ON s.id = o.student_id WHERE o.id = $1`, [req.params.id]);
    if (!occRes.rows.length) return res.status(404).json({ success: false, message: "Registration not found." });
    const occ = occRes.rows[0];

    let newRoomId = occ.room_id;
    let roomNote = "";
    if (room_id !== undefined && room_id !== null && String(room_id) !== String(occ.room_id)) {
      if (occ.hostel_name === "Boys Hostel")
        return res.status(400).json({ success: false, message: "The Boys Hostel has no rooms to move between." });
      if (!occ.is_active)
        return res.status(400).json({ success: false, message: "This student has left the hostel, so the room cannot be changed. Re-admit them instead." });
      const cap = await query(`
        SELECT r.capacity, r.hostel_name, r.room_number, r.gender,
          (SELECT COUNT(*) FROM hostel_occupants o WHERE o.room_id = r.id AND o.is_active = true) AS occupied
        FROM hostel_rooms r WHERE r.id = $1`, [room_id]);
      if (!cap.rows.length) return res.status(404).json({ success: false, message: "Room not found." });
      const room = cap.rows[0];
      if (room.hostel_name !== occ.hostel_name)
        return res.status(400).json({ success: false, message: "That room belongs to a different hostel." });
      if (parseInt(room.occupied) >= parseInt(room.capacity))
        return res.status(400).json({ success: false, message: "That room is full." });
      newRoomId = room_id;
      roomNote = ` Moved to ${room.room_number || `Room ${room_id}`}.`;
    }

    let dateExpr = "admitted_date";
    const params = [newRoomId];
    if (admitted_date !== undefined) {
      if (admitted_date && !/^\d{4}-\d{2}-\d{2}$/.test(String(admitted_date)))
        return res.status(400).json({ success: false, message: "Enter the admission date as YYYY-MM-DD." });
      params.push(admitted_date || null);
      dateExpr = `COALESCE($${params.length}::date, admitted_date)`;
    }
    params.push(req.params.id);
    const upd = await query(
      `UPDATE hostel_occupants SET room_id = $1, admitted_date = ${dateExpr} WHERE id = $${params.length} RETURNING *`, params);

    await logHistory(occ.id, "Edited", `Registration edited.${roomNote}${admitted_date ? ` Admission date set to ${admitted_date}.` : ""}`, req.user?.id);
    const { recordAudit } = require("../utils/auditLogger");
    await recordAudit({ actor: req.user, action: "hostel.edit", entityType: "hostel_occupant", entityId: occ.id,
      description: `Edited hostel registration for ${[occ.first_name, occ.last_name].filter(Boolean).join(" ")} (${occ.hostel_name}).${roomNote}`,
      metadata: { admitted_date: admitted_date || undefined, room_id: newRoomId }, req });
    res.json({ success: true, data: upd.rows[0] });
  } catch (err) { next(err); }
};

module.exports = {
  getRooms, createRoom, updateRoom, deleteRoom, searchOccupants,
  getStats, assignStudent, getBoysOccupants, admitBoysHall, updateOccupant,
  removeOccupant, permanentlyDeleteOccupant, getOccupant, getHistory, getHistoryByClass,
  getContributions, addContribution, deleteContribution,
  getDiscipline, addDiscipline,
  exportOccupantPdf, exportHostelListPdf, exportDisciplinePdf, exportContributionReceipt,
};
