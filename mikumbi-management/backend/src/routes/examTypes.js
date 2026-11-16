// routes/examTypes.js - the list of exam types used in Results Management.
// Every logged-in user can read the list; the Head Master and Second Master
// can add new types, set the Kiswahili name used in SMS, hide a type, or
// delete one that has never been used.
const express = require("express");
const auth = require("../middleware/auth");
const { query } = require("../db/db");
const { recordAudit } = require("../utils/auditLogger");

const router = express.Router();
const MANAGERS = ["admin", "second_master"];
const clean = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const NAME_OK = /^[\p{L}\p{N} &/().,'-]+$/u;

// GET /api/exam-types            -> active types (for the pickers)
// GET /api/exam-types?all=1      -> every type with "used" counts (managers)
router.get("/", auth(), async (req, res, next) => {
  try {
    const all = req.query.all === "1" && req.user.roles.some((r) => MANAGERS.includes(r));
    const { rows } = await query(`
      SELECT et.id, et.name, et.name_sw, et.is_active, et.sort_order,
             (SELECT COUNT(*)::int FROM academic_periods ap WHERE ap.exam_type = et.name) AS used
      FROM exam_types et
      ${all ? "" : "WHERE et.is_active = true"}
      ORDER BY et.sort_order, et.id`);
    res.json({ exam_types: rows });
  } catch (err) { next(err); }
});

router.post("/", auth(MANAGERS), async (req, res, next) => {
  try {
    const name = clean(req.body?.name, 120);
    const nameSw = clean(req.body?.name_sw, 160);
    if (name.length < 3) return res.status(400).json({ message: "Please type the exam type name (at least 3 letters)." });
    if (!NAME_OK.test(name) || (nameSw && !NAME_OK.test(nameSw)))
      return res.status(400).json({ message: "Use letters, numbers, spaces and & / ( ) . , ' - only." });
    const dup = await query(`SELECT id, is_active FROM exam_types WHERE LOWER(name) = LOWER($1)`, [name]);
    if (dup.rows.length) {
      if (!dup.rows[0].is_active) {
        await query(`UPDATE exam_types SET is_active = true WHERE id = $1`, [dup.rows[0].id]);
        return res.json({ message: "This exam type already existed and has been shown again." });
      }
      return res.status(409).json({ message: "This exam type already exists." });
    }
    const { rows } = await query(
      `INSERT INTO exam_types (name, name_sw, sort_order) VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) FROM exam_types), 0) + 1) RETURNING *`,
      [name, nameSw || null]);
    res.status(201).json({ exam_type: rows[0], message: "Exam type added." });
    recordAudit({ actor: req.user, action: "exam_type.create", entityType: "exam_types", entityId: rows[0].id, description: `${req.user.full_name || req.user.username} added the exam type "${name}".`, req });
  } catch (err) { next(err); }
});

// PATCH: Kiswahili name and show/hide. The English name is not editable once
// it has been used, because past exam periods are stored with that name.
router.patch("/:id", auth(MANAGERS), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid exam type." });
    const cur = (await query(`SELECT et.*, (SELECT COUNT(*)::int FROM academic_periods ap WHERE ap.exam_type = et.name) AS used FROM exam_types et WHERE id = $1`, [id])).rows[0];
    if (!cur) return res.status(404).json({ message: "Exam type not found." });
    const sets = []; const vals = [];
    if (req.body?.name !== undefined) {
      const name = clean(req.body.name, 120);
      if (name.length < 3 || !NAME_OK.test(name)) return res.status(400).json({ message: "Invalid exam type name." });
      if (name !== cur.name) {
        if (cur.used > 0) return res.status(400).json({ message: "This exam type has already been used, so its name cannot be changed. Add a new type instead." });
        const dup = await query(`SELECT 1 FROM exam_types WHERE LOWER(name) = LOWER($1) AND id <> $2`, [name, id]);
        if (dup.rows.length) return res.status(409).json({ message: "Another exam type already has this name." });
        vals.push(name); sets.push(`name = $${vals.length}`);
      }
    }
    if (req.body?.name_sw !== undefined) {
      const sw = clean(req.body.name_sw, 160);
      if (sw && !NAME_OK.test(sw)) return res.status(400).json({ message: "Invalid Kiswahili name." });
      vals.push(sw || null); sets.push(`name_sw = $${vals.length}`);
    }
    if (typeof req.body?.is_active === "boolean") { vals.push(req.body.is_active); sets.push(`is_active = $${vals.length}`); }
    if (!sets.length) return res.json({ exam_type: cur });
    vals.push(id);
    const { rows } = await query(`UPDATE exam_types SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`, vals);
    res.json({ exam_type: rows[0] });
  } catch (err) { next(err); }
});

// DELETE only when never used; otherwise hide it (keeps old results readable).
router.delete("/:id", auth(MANAGERS), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid exam type." });
    const cur = (await query(`SELECT et.name, (SELECT COUNT(*)::int FROM academic_periods ap WHERE ap.exam_type = et.name) AS used FROM exam_types et WHERE id = $1`, [id])).rows[0];
    if (!cur) return res.status(404).json({ message: "Exam type not found." });
    if (cur.used > 0) return res.status(400).json({ message: "This exam type already has results, so it cannot be deleted. You can hide it instead." });
    await query(`DELETE FROM exam_types WHERE id = $1`, [id]);
    res.json({ message: "Exam type deleted." });
    recordAudit({ actor: req.user, action: "exam_type.delete", entityType: "exam_types", entityId: id, description: `${req.user.full_name || req.user.username} deleted the exam type "${cur.name}".`, req });
  } catch (err) { next(err); }
});

module.exports = router;
