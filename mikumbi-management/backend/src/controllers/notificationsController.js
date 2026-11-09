// controllers/notificationsController.js — NOTIFICATION CENTER (bell icon)
// Every logged-in user (whatever their role) reads only their OWN
// notifications — always scoped by req.user.id, never by a body/query id,
// so one account can never read or mark another account's notifications.
const { query } = require("../db/db");

// GET /api/notifications?limit=30 — most recent first.
const listNotifications = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const { rows } = await query(
      `SELECT id, type, title, message, metadata, is_read, created_at
       FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [req.user.id, limit]
    );
    res.json({ success: true, notifications: rows });
  } catch (err) { next(err); }
};

// GET /api/notifications/unread-count — cheap poll target for the bell badge.
const unreadCount = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );
    res.json({ success: true, count: rows[0].count });
  } catch (err) { next(err); }
};

// PATCH /api/notifications/:id/read
const markRead = async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Notification not found." });
    res.json({ success: true });
  } catch (err) { next(err); }
};

// PATCH /api/notifications/read-all
const markAllRead = async (req, res, next) => {
  try {
    await query(`UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`, [req.user.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
};

module.exports = { listNotifications, unreadCount, markRead, markAllRead };
