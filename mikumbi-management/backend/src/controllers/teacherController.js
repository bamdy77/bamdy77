const { query } = require("../db/db");
const { resolveClassFormStream } = require("../utils/classHelper");

// GET /api/teachers
const getTeachers = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT t.*,
        u.username AS registered_username,
        COALESCE(
          (SELECT array_agg(s.name ORDER BY s.name) FROM subjects s WHERE s.id = ANY(u.subject_ids)),
          ARRAY[t.subject]
        ) AS registered_subjects,
        u.assigned_forms AS registered_forms,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ta.id, 'form', ta.form,
              'stream', ta.stream, 'subject', ta.subject, 'periods_per_week', ta.periods_per_week
            ) ORDER BY ta.form, ta.stream
          ) FILTER (WHERE ta.id IS NOT NULL), '[]'
        ) AS assignments,
        COALESCE(
          (SELECT array_agg(DISTINCT ta2.subject ORDER BY ta2.subject) FROM teacher_assignments ta2 WHERE ta2.teacher_id = t.id),
          ARRAY[t.subject]
        ) AS subjects
      FROM teachers t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN teacher_assignments ta ON ta.teacher_id = t.id
      WHERE t.is_active = true
      GROUP BY t.id, u.username, u.subject_ids, u.assigned_forms
      ORDER BY t.short_name
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// GET /api/teachers/:id
const getTeacher = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT t.*,
        COALESCE(
          json_agg(
            json_build_object('id', ta.id, 'form', ta.form, 'stream', ta.stream, 'subject', ta.subject, 'periods_per_week', ta.periods_per_week)
          ) FILTER (WHERE ta.id IS NOT NULL), '[]'
        ) AS assignments
      FROM teachers t
      LEFT JOIN teacher_assignments ta ON ta.teacher_id = t.id
      WHERE t.id = $1 GROUP BY t.id
    `, [req.params.id]);

    if (!result.rows.length)
      return res.status(404).json({ success: false, message: "Teacher not found." });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

// POST /api/teachers
const createTeacher = async (req, res, next) => {
  try {
    const { short_name, full_name, subject, classes } = req.body;
    if (!short_name || !subject)
      return res.status(400).json({ success: false, message: "Short name and subject required." });

    const result = await query(`
      INSERT INTO teachers (short_name, full_name, subject)
      VALUES ($1,$2,$3) RETURNING *
    `, [short_name, full_name || null, subject]);

    const teacher = result.rows[0];

    // Insert class assignments — `classes` items can be a plain "Form I A" string
    // (defaults to the teacher's main subject, 4 periods/week) or an object
    // {cls, periods_per_week, subject} — `subject` lets one teacher teach a
    // DIFFERENT subject to a different class (e.g. Maths to Form I A, Physics
    // to Form II B) so multi-subject teachers don't need duplicate records.
    if (classes && classes.length) {
      for (const item of classes) {
        const cls = typeof item === "string" ? item : item.cls;
        const periodsPerWeek = typeof item === "string" ? 4 : (item.periods_per_week || 4);
        const itemSubject = (typeof item === "object" && item.subject) ? item.subject : subject;
        const { form, stream } = await resolveClassFormStream(cls);
        await query(`
          INSERT INTO teacher_assignments (teacher_id, form, stream, subject, periods_per_week)
          VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (teacher_id, form, stream, subject) DO UPDATE SET periods_per_week = EXCLUDED.periods_per_week
        `, [teacher.id, form, stream, itemSubject, periodsPerWeek]);
      }
    }

    res.status(201).json({ success: true, data: teacher });
  } catch (err) { next(err); }
};

// PUT /api/teachers/:id
const updateTeacher = async (req, res, next) => {
  try {
    const { short_name, full_name, subject, classes } = req.body;

    const result = await query(`
      UPDATE teachers SET
        short_name = COALESCE($1, short_name),
        full_name  = COALESCE($2, full_name),
        subject    = COALESCE($3, subject),
        updated_at = NOW()
      WHERE id = $4 RETURNING *
    `, [short_name, full_name, subject, req.params.id]);

    if (!result.rows.length)
      return res.status(404).json({ success: false, message: "Teacher not found." });

    // Replace assignments
    if (classes !== undefined) {
      await query("DELETE FROM teacher_assignments WHERE teacher_id = $1", [req.params.id]);
      const defaultSubj = subject || result.rows[0].subject;
      for (const item of classes) {
        const cls = typeof item === "string" ? item : item.cls;
        const periodsPerWeek = typeof item === "string" ? 4 : (item.periods_per_week || 4);
        const itemSubject = (typeof item === "object" && item.subject) ? item.subject : defaultSubj;
        const { form, stream } = await resolveClassFormStream(cls);
        await query(`
          INSERT INTO teacher_assignments (teacher_id, form, stream, subject, periods_per_week)
          VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING
        `, [req.params.id, form, stream, itemSubject, periodsPerWeek]);
      }
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

// DELETE /api/teachers/:id
const deleteTeacher = async (req, res, next) => {
  try {
    await query("UPDATE teachers SET is_active = false WHERE id = $1", [req.params.id]);
    res.json({ success: true, message: "Teacher removed." });
  } catch (err) { next(err); }
};

module.exports = { getTeachers, getTeacher, createTeacher, updateTeacher, deleteTeacher };
