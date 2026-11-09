// utils/auditLogger.js — writes to the `audit_log` table.
//
// Used everywhere the system needs an accountability trail: who changed
// what, and when. Kept intentionally simple (one INSERT) so it can be
// dropped into any controller without pulling in extra dependencies.
//
// IMPORTANT: audit logging must never be the reason a real user-facing
// action fails. If the INSERT itself fails (e.g. a transient DB hiccup),
// we log the failure to the server console and swallow it — the caller's
// primary action (saving marks, unlocking a sheet, publishing a result...)
// already succeeded and must not be rolled back just because its audit
// trail entry could not be written.
const { query } = require("../db/db");

/**
 * Record one audit trail entry.
 *
 * @param {object} opts
 * @param {object} opts.actor        req.user of whoever performed the action.
 * @param {string} opts.action       Short machine-readable action code, e.g. "score.edit_locked".
 * @param {string} [opts.entityType] What kind of record was affected, e.g. "score_sheet".
 * @param {number} [opts.entityId]   The primary key of that record, when there is one single one.
 * @param {string} opts.description  Human-readable summary shown in the Audit Log screen.
 * @param {object} [opts.metadata]   Extra structured detail (before/after values, counts, etc).
 * @param {object} [opts.req]        The Express request, used only to capture the caller's IP.
 */
async function recordAudit({ actor, action, entityType, entityId, description, metadata, req }) {
  try {
    const actorId = actor && actor.id != null ? actor.id : null;
    const actorName = (actor && (actor.username || actor.full_name)) || null;
    const actorRole = (actor && (actor.role || (actor.roles && actor.roles[0]))) || null;
    const ip = req ? (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null) : null;

    await query(
      `INSERT INTO audit_log (actor_id, actor_name, actor_role, action, entity_type, entity_id, description, metadata, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        actorId, actorName, actorRole, action,
        entityType || null, entityId != null ? entityId : null,
        description, metadata ? JSON.stringify(metadata) : null,
        ip ? String(ip).split(",")[0].trim() : null,
      ]
    );
  } catch (err) {
    // Never let a broken audit write take down the real request.
    console.error("Audit log write failed:", err.message);
  }
}

module.exports = { recordAudit };
