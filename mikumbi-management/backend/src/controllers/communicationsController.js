const { query } = require("../db/db");
const { sendOne, sendBulk, formatPhone } = require("../utils/nextsms");

// ═══════════════════════════ ANNOUNCEMENTS ═══════════════════════════════
// Posted by the Head Master / Second Master. Each announcement is addressed to
// Staff, to Parents & public, or to Both. The admin chooses how long it stays
// visible (1-365 days, until a date, or never = until deleted); it can also be
// deleted anytime.

// Who an announcement is for. Validated against this whitelist on the server -
// the UI selector is only a convenience, never the source of truth.
const AUDIENCES = ["staff", "public", "both"];

// How long an announcement stays visible. Returns { ok, value, message }:
//   value = Date  -> expires then;   value = null -> never expires (until deleted).
// Accepted body fields:
//   expiry_type: "days" (default) | "date" | "never"
//   expiry_days: 1..365 (type "days"; defaults to 3, the original behaviour)
//   expiry_date: "YYYY-MM-DD" (type "date"; visible through the END of that day, Tanzania time)
const resolveExpiry = (body) => {
  const bad = (message) => ({ ok: false, value: undefined, message });
  const type = typeof body.expiry_type === "string" ? body.expiry_type.trim().toLowerCase() : "days";

  if (type === "never") return { ok: true, value: null };

  if (type === "days") {
    const days = body.expiry_days === undefined || body.expiry_days === "" ? 3 : Number(body.expiry_days);
    if (!Number.isInteger(days) || days < 1 || days > 365)
      return bad("Duration must be a whole number of days from 1 to 365.");
    return { ok: true, value: new Date(Date.now() + days * 24 * 60 * 60 * 1000) };
  }

  if (type === "date") {
    const d = typeof body.expiry_date === "string" ? body.expiry_date.trim() : "";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (!m) return bad("Please choose a valid end date.");
    const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const check = new Date(Date.UTC(y, mo - 1, da));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== da)
      return bad("Please choose a valid end date.");
    const end = new Date(`${d}T23:59:59+03:00`); // Africa/Dar_es_Salaam is UTC+3 all year
    if (Number.isNaN(end.getTime())) return bad("Please choose a valid end date.");
    if (end.getTime() <= Date.now()) return bad("The end date must be today or a future date.");
    if (end.getTime() > Date.now() + 2 * 365 * 24 * 60 * 60 * 1000) return bad("The end date can be at most 2 years from now.");
    return { ok: true, value: end };
  }

  return bad("Unknown expiry option.");
};

// POST /api/communications/announcements  { title, message, audience, expiry_type, expiry_days | expiry_date }
const createAnnouncement = async (req, res, next) => {
  try {
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
    const audience = typeof req.body.audience === "string" ? req.body.audience.trim().toLowerCase() : "";
    if (!title || !message)
      return res.status(400).json({ success: false, message: "Title and message are required." });
    if (title.length > 200)
      return res.status(400).json({ success: false, message: "Title is too long (maximum 200 characters)." });
    if (!AUDIENCES.includes(audience))
      return res.status(400).json({ success: false, message: "Please choose who this announcement is for: Staff, Parents & public, or Both." });

    const expiry = resolveExpiry(req.body);
    if (!expiry.ok) return res.status(400).json({ success: false, message: expiry.message });

    // expiry.value === null is stored as NULL = never expires.
    const result = await query(
      `INSERT INTO announcements (title, message, created_by, audience, expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [title, message, req.user.id, audience, expiry.value]
    );
    res.status(201).json({ success: true, announcement: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// GET /api/communications/announcements — for the logged-in dashboard (all, incl. expired history)
const listAnnouncements = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT a.*, CASE WHEN u.role = 'admin' THEN 'Head Of School' ELSE u.full_name END AS created_by_name
       FROM announcements a JOIN users u ON a.created_by = u.id
       ORDER BY a.created_at DESC`
    );
    res.json({ success: true, announcements: result.rows });
  } catch (err) {
    next(err);
  }
};

// GET /api/communications/announcements/public — NO login. Feeds the PUBLIC website
// (parents/visitors). Only announcements addressed to 'public' or 'both', active and
// not expired. Staff-only notices are never returned here, and only safe fields are exposed.
const listPublicAnnouncements = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT a.id, a.title, a.message, a.created_at, a.expires_at
       FROM announcements a
       WHERE a.is_active = true AND (a.expires_at IS NULL OR a.expires_at > NOW()) AND a.audience IN ('public','both')
       ORDER BY a.created_at DESC
       LIMIT 20`
    );
    res.json({ success: true, announcements: result.rows });
  } catch (err) {
    next(err);
  }
};

// GET /api/communications/announcements/staff — login required (any staff role). Feeds the
// banner inside the staff dashboard: only announcements addressed to 'staff' or 'both'.
const listStaffAnnouncements = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT a.id, a.title, a.message, a.created_at, a.expires_at, a.audience,
              CASE WHEN u.role = 'admin' THEN 'Head Of School' ELSE u.full_name END AS created_by_name
       FROM announcements a JOIN users u ON a.created_by = u.id
       WHERE a.is_active = true AND (a.expires_at IS NULL OR a.expires_at > NOW()) AND a.audience IN ('staff','both')
       ORDER BY a.created_at DESC
       LIMIT 20`
    );
    res.json({ success: true, announcements: result.rows });
  } catch (err) {
    next(err);
  }
};

// PUT /api/communications/announcements/:id — edit an existing announcement
// (title, message, audience, expiry). Same validation as create.
const updateAnnouncement = async (req, res, next) => {
  try {
    const id = req.params.id;
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
    const audience = typeof req.body.audience === "string" ? req.body.audience.trim().toLowerCase() : "";
    if (!title || !message)
      return res.status(400).json({ success: false, message: "Title and message are required." });
    if (title.length > 200)
      return res.status(400).json({ success: false, message: "Title is too long (maximum 200 characters)." });
    if (!AUDIENCES.includes(audience))
      return res.status(400).json({ success: false, message: "Please choose who this announcement is for: Staff, Parents & public, or Both." });
    const expiry = resolveExpiry(req.body);
    if (!expiry.ok) return res.status(400).json({ success: false, message: expiry.message });
    const result = await query(
      `UPDATE announcements SET title=$1, message=$2, audience=$3, expires_at=$4 WHERE id=$5 RETURNING *`,
      [title, message, audience, expiry.value, id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Announcement not found." });
    res.json({ success: true, announcement: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/communications/announcements/:id — can be deleted anytime, per spec
const deleteAnnouncement = async (req, res, next) => {
  try {
    await query("DELETE FROM announcements WHERE id = $1", [req.params.id]);
    res.json({ success: true, message: "Announcement deleted." });
  } catch (err) {
    next(err);
  }
};

// ═══════════════════════════ SMS — CONTACTS ═══════════════════════════════
const CONTACT_TABLES = {
  staff: { table: "sms_staff_contacts", cols: ["name", "position", "phone"] },
  parents: { table: "sms_parent_contacts", cols: ["parent_name", "student_name", "class_name", "phone"] },
  class_teachers: { table: "sms_class_teacher_contacts", cols: ["class_name", "teacher_name", "phone"] },
  individuals: { table: "sms_individual_contacts", cols: ["name", "phone"] },
};

// GET /api/communications/sms/contacts/:type
const listContacts = async (req, res, next) => {
  try {
    const def = CONTACT_TABLES[req.params.type];
    if (!def) return res.status(400).json({ success: false, message: "Unknown contact type." });
    const result = await query(`SELECT * FROM ${def.table} WHERE is_active = true ORDER BY created_at DESC`);
    res.json({ success: true, contacts: result.rows });
  } catch (err) {
    next(err);
  }
};

// POST /api/communications/sms/contacts/:type
const addContact = async (req, res, next) => {
  try {
    const def = CONTACT_TABLES[req.params.type];
    if (!def) return res.status(400).json({ success: false, message: "Unknown contact type." });
    if (req.params.type === "parents")
      return res.status(400).json({ success: false, message: "Parent contacts are added automatically from Student Management — register or edit the student there instead." });
    if (req.params.type === "staff")
      return res.status(400).json({ success: false, message: "Staff contacts are added automatically from User Accounts — register or edit the account there instead." });
    const values = def.cols.map((c) => req.body[c]);
    if (values.some((v) => !v))
      return res.status(400).json({ success: false, message: `Required fields: ${def.cols.join(", ")}` });
    const placeholders = def.cols.map((_, i) => `$${i + 1}`).join(",");
    const result = await query(
      `INSERT INTO ${def.table} (${def.cols.join(",")}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    res.status(201).json({ success: true, contact: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/communications/sms/contacts/:type/:id
const deleteContact = async (req, res, next) => {
  try {
    const def = CONTACT_TABLES[req.params.type];
    if (!def) return res.status(400).json({ success: false, message: "Unknown contact type." });
    if (req.params.type === "parents")
      return res.status(400).json({ success: false, message: "Parent contacts follow Student Management — remove or transfer the student there instead." });
    if (req.params.type === "staff")
      return res.status(400).json({ success: false, message: "Staff contacts follow User Accounts — deactivate or delete the account there instead." });
    await query(`UPDATE ${def.table} SET is_active = false WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: "Contact removed." });
  } catch (err) {
    next(err);
  }
};

// ═══════════════════════════ SMS — SEND ═══════════════════════════════════
// POST /api/communications/sms/send
// body: { category: 'all_staff'|'all_parents'|'everyone'|'parents_by_class'|
//                    'selected_staff'|'selected_parents'|'individual',
//         message, class_name, staff_ids[], parent_ids[], phone }
const sendSms = async (req, res, next) => {
  try {
    const { category, message, class_name, staff_ids, parent_ids, individual_ids, phone } = req.body;
    if (!message || !message.trim())
      return res.status(400).json({ success: false, message: "Write a message to send." });
    if (!category) return res.status(400).json({ success: false, message: "Choose a recipient category." });

    let phoneList = [];
    let recipientsDesc = "";

    if (category === "all_staff") {
      const r = await query("SELECT phone FROM sms_staff_contacts WHERE is_active = true");
      phoneList = r.rows.map((x) => x.phone);
      recipientsDesc = `All staff (${phoneList.length})`;
    } else if (category === "all_parents") {
      const r = await query("SELECT phone FROM sms_parent_contacts WHERE is_active = true");
      phoneList = r.rows.map((x) => x.phone);
      recipientsDesc = `All parents (${phoneList.length})`;
    } else if (category === "everyone") {
      const [s, p] = await Promise.all([
        query("SELECT phone FROM sms_staff_contacts WHERE is_active = true"),
        query("SELECT phone FROM sms_parent_contacts WHERE is_active = true"),
      ]);
      phoneList = [...s.rows.map((x) => x.phone), ...p.rows.map((x) => x.phone)];
      recipientsDesc = `Staff + Parents (${phoneList.length})`;
    } else if (category === "parents_by_class" && class_name) {
      const r = await query("SELECT phone FROM sms_parent_contacts WHERE is_active = true AND class_name = $1", [class_name]);
      phoneList = r.rows.map((x) => x.phone);
      recipientsDesc = `Parents of ${class_name} (${phoneList.length})`;
    } else if (category === "selected_staff" && staff_ids?.length) {
      const r = await query(`SELECT phone FROM sms_staff_contacts WHERE id = ANY($1::int[]) AND is_active = true`, [staff_ids]);
      phoneList = r.rows.map((x) => x.phone);
      recipientsDesc = `Selected staff (${phoneList.length})`;
    } else if (category === "selected_parents" && parent_ids?.length) {
      const r = await query(`SELECT phone FROM sms_parent_contacts WHERE id = ANY($1::int[]) AND is_active = true`, [parent_ids]);
      phoneList = r.rows.map((x) => x.phone);
      recipientsDesc = `Selected parents (${phoneList.length})`;
    } else if (category === "selected_individuals" && individual_ids?.length) {
      // Sends to one, several, or ALL saved individual contacts — whichever
      // ids the picker sent through (the "select all" button on the frontend
      // just passes every id).
      const r = await query(`SELECT phone FROM sms_individual_contacts WHERE id = ANY($1::int[]) AND is_active = true`, [individual_ids]);
      phoneList = r.rows.map((x) => x.phone);
      recipientsDesc = `Selected individuals (${phoneList.length})`;
    } else if (category === "individual" && phone) {
      phoneList = [phone];
      recipientsDesc = `Individual: ${phone}`;
    }

    // Drop any blank/unusable numbers BEFORE sending — a stray empty phone
    // slipping into the batch used to still count toward recipient_count and
    // get silently "sent" to an invalid number, which is exactly the kind of
    // mismatch that made it hard to trust an SMS really reached who it
    // should have.
    phoneList = phoneList.map((p) => (p || "").toString().trim()).filter(Boolean);

    if (phoneList.length === 0)
      return res.status(400).json({ success: false, message: "No recipients matched your selection." });

    // The exact, normalized numbers actually handed to the SMS gateway —
    // stored alongside the log entry so Communications can show precisely
    // who a message was directed to, not just a count.
    const formattedNumbers = phoneList.map(formatPhone);

    const result = phoneList.length === 1 ? await sendOne(phoneList[0], message.trim()) : await sendBulk(phoneList, message.trim());
    const status = result.success ? "sent" : "failed";

    await query(
      `INSERT INTO sms_log (category, recipients, message, recipient_count, status, sender_id, notes, sent_by, recipient_numbers)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [category, recipientsDesc, message.trim(), phoneList.length, status, process.env.NEXTSMS_SENDER_ID || "Millanzi", result.success ? null : JSON.stringify(result.error), req.user.id, formattedNumbers.join(", ")]
    );

    if (!result.success)
      return res.status(500).json({ success: false, message: "Failed to send SMS. Check API credentials.", details: result.error });

    res.json({ success: true, message: `SMS sent to ${phoneList.length} recipient(s).`, count: phoneList.length });
  } catch (err) {
    next(err);
  }
};

// GET /api/communications/sms/history?limit=50
const smsHistory = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const result = await query("SELECT * FROM sms_log WHERE is_active = true ORDER BY created_at DESC LIMIT $1", [limit]);
    res.json({ success: true, logs: result.rows });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/communications/sms/history/failed — clears every failed
// message from history in one action, so the list doesn't stay cluttered
// with old failed sends that don't need retrying/investigating any more.
const deleteFailedSms = async (req, res, next) => {
  try {
    const result = await query("DELETE FROM sms_log WHERE status = 'failed'");
    res.json({ success: true, message: `${result.rowCount} failed message(s) removed.`, count: result.rowCount });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/communications/sms/history/all — clears the WHOLE message history.
const deleteAllSms = async (req, res, next) => {
  try {
    const result = await query("DELETE FROM sms_log");
    res.json({ success: true, message: `${result.rowCount} message(s) removed.`, count: result.rowCount });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/communications/sms/history/:id — remove one message from history.
const deleteSmsEntry = async (req, res, next) => {
  try {
    await query("DELETE FROM sms_log WHERE id = $1", [req.params.id]);
    res.json({ success: true, message: "Message removed." });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createAnnouncement, updateAnnouncement, listAnnouncements, listPublicAnnouncements, listStaffAnnouncements, deleteAnnouncement,
  listContacts, addContact, deleteContact, sendSms, smsHistory, deleteFailedSms, deleteAllSms, deleteSmsEntry,
};
