const { query } = require("../db/db");

// GET /api/subjects
const getSubjects = async (req, res, next) => {
  try {
    const result = await query(`SELECT * FROM subjects WHERE is_active = true ORDER BY sort_order ASC, name ASC`);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// POST /api/subjects
const addSubject = async (req, res, next) => {
  try {
    const { name, code, sort_order } = req.body;
    if (!name || !name.trim())
      return res.status(400).json({ success: false, message: "Subject name is required." });
    // An abbreviation is required — Results Management prints it (DETAILS
    // SUBJECTS, SCHOOL EXAMINATION SUBJECT PERFORMANCE) and a subject
    // without one would show up there as blank/"null".
    if (!code || !code.trim())
      return res.status(400).json({ success: false, message: "Subject abbreviation (code) is required." });
    const result = await query(`
      INSERT INTO subjects (name, code, sort_order) VALUES ($1, $2, $3)
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name,
        code = COALESCE(EXCLUDED.code, subjects.code),
        sort_order = COALESCE(EXCLUDED.sort_order, subjects.sort_order),
        is_active = true
      RETURNING *
    `, [name.trim().toUpperCase(), code.trim().toUpperCase(), sort_order ?? 99]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

// PATCH /api/subjects/:id — used by Results Management to set the exam
// code (e.g. "MATH") and print/ordering position for a subject that
// already exists in Student Management.
const updateSubject = async (req, res, next) => {
  try {
    const { code, sort_order, is_active } = req.body;
    const result = await query(
      `UPDATE subjects SET
         code = COALESCE($1, code),
         sort_order = COALESCE($2, sort_order),
         is_active = COALESCE($3, is_active)
       WHERE id = $4 RETURNING *`,
      [code ? code.trim().toUpperCase() : null, sort_order ?? null, is_active ?? null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Subject not found." });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

// DELETE /api/subjects/:id — soft-remove only (is_active=false). Never a
// hard delete: scores.subject_id and teacher_sheet_status.subject_id are
// both ON DELETE CASCADE, so a real DELETE here would silently wipe every
// historical score ever recorded for this subject, school-wide, across
// every year and term, with zero warning and no way back.
const deleteSubject = async (req, res, next) => {
  try {
    const result = await query(`UPDATE subjects SET is_active = false WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Subject not found." });
    res.json({ success: true, message: "Subject removed." });
  } catch (err) { next(err); }
};

module.exports = { getSubjects, addSubject, updateSubject, deleteSubject };
