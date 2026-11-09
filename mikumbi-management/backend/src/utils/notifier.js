// utils/notifier.js — writes to the `notifications` table (in-app
// Notification Center / bell). Kept intentionally simple, same spirit as
// auditLogger.js: never let a notification write take down the real
// user-facing action it was triggered by.
const { query } = require("../db/db");

// Send one notification to ONE specific user (by id).
async function notifyUser({ userId, type, title, message, metadata }) {
  if (!userId) return;
  try {
    await query(
      `INSERT INTO notifications (user_id, type, title, message, metadata) VALUES ($1,$2,$3,$4,$5)`,
      [userId, type, title, message, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    console.error("Notification write failed:", err.message);
  }
}

// Send the SAME notification to every active user holding ANY of the given
// role(s) — e.g. notifying the Academic Master (and, since roles can
// overlap, Head Master / Second Master too) that a teacher submitted or
// requested an unlock. Looks at both the primary `role` column and
// `extra_roles`, matching the same "any role" logic auth.js uses.
async function notifyRoles({ roles, type, title, message, metadata, excludeUserId }) {
  if (!roles || !roles.length) return;
  try {
    const { rows } = await query(
      `SELECT id FROM users
       WHERE is_active = true
         AND (role = ANY($1::text[]) OR extra_roles && $1::text[])
         AND ($2::int IS NULL OR id <> $2)`,
      [roles, excludeUserId || null]
    );
    if (!rows.length) return;
    const values = [];
    const params = [];
    rows.forEach((r, i) => {
      const base = i * 5;
      values.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5})`);
      params.push(r.id, type, title, message, metadata ? JSON.stringify(metadata) : null);
    });
    await query(
      `INSERT INTO notifications (user_id, type, title, message, metadata) VALUES ${values.join(",")}`,
      params
    );
  } catch (err) {
    console.error("Notification (role broadcast) write failed:", err.message);
  }
}

module.exports = { notifyUser, notifyRoles };
