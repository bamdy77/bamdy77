const { query } = require("../db/db");

// GET /api/classes — all active classes, e.g. "Form I" or "Form I A"
const getClasses = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT * FROM school_classes WHERE is_active = true
      ORDER BY form,
        CASE WHEN stream IS NULL THEN '' ELSE stream END
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// POST /api/classes — add a class. Leave `stream` blank for a single class with no stream (e.g. "Form I").
const addClass = async (req, res, next) => {
  try {
    const { form, stream } = req.body;
    if (!form) return res.status(400).json({ success: false, message: "Form is required." });
    const cleanStream = stream && stream.trim() ? stream.trim().toUpperCase() : null;
    const label = cleanStream ? `${form} ${cleanStream}` : form;

    const result = await query(`
      INSERT INTO school_classes (form, stream, label) VALUES ($1,$2,$3)
      ON CONFLICT (label) DO UPDATE SET is_active = true
      RETURNING *
    `, [form, cleanStream, label]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

// DELETE /api/classes/:id — soft-remove a class (keeps historical timetable/records intact)
const deleteClass = async (req, res, next) => {
  try {
    const result = await query(`UPDATE school_classes SET is_active = false WHERE id = $1 RETURNING *`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Class not found." });
    res.json({ success: true, message: "Class removed." });
  } catch (err) { next(err); }
};

module.exports = { getClasses, addClass, deleteClass };
