// controllers/auditController.js — Audit Log (security/accountability trail).
// Read-only: entries are written by recordAudit() (utils/auditLogger.js)
// from the controllers that perform sensitive actions. Visible to Admin
// (Head Master), Second Master, and Academic Master.
const { query } = require("../db/db");

// GET /api/audit?from=&to=&action=&actor_id=&q=&page=&pageSize=
const listAuditLog = async (req, res, next) => {
  try {
    const { from, to, action, actor_id, q } = req.query;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 25, 1), 100);
    const conditions = [];
    const params = [];

    if (from) { params.push(from); conditions.push(`created_at >= $${params.length}::date`); }
    if (to) { params.push(to); conditions.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`); }
    if (action) { params.push(action); conditions.push(`action = $${params.length}`); }
    if (actor_id) { params.push(Number(actor_id)); conditions.push(`actor_id = $${params.length}`); }
    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      conditions.push(`(description ILIKE $${params.length} OR actor_name ILIKE $${params.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRes = await query(`SELECT COUNT(*) AS total FROM audit_log ${where}`, params);
    const total = Number(countRes.rows[0].total) || 0;

    const offset = (page - 1) * pageSize;
    params.push(pageSize, offset);
    const rowsRes = await query(
      `SELECT id, actor_id, actor_name, actor_role, action, entity_type, entity_id, description, metadata, ip_address, created_at
       FROM audit_log ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1),
      records: rowsRes.rows,
    });
  } catch (err) { next(err); }
};

// GET /api/audit/actions — distinct action codes seen so far, to populate
// the filter dropdown without hardcoding the list on the frontend (new
// action codes added later show up automatically).
const listAuditActions = async (_req, res, next) => {
  try {
    const { rows } = await query(`SELECT DISTINCT action FROM audit_log ORDER BY action ASC`);
    res.json({ success: true, actions: rows.map((r) => r.action) });
  } catch (err) { next(err); }
};

module.exports = { listAuditLog, listAuditActions };
