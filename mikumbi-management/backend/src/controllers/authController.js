const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { query } = require("../db/db");
const { sendPasswordResetEmail } = require("../utils/mailer");

// Every role (including Patron/Matron) now uses Gmail self-service reset,
// same as any other teacher — there is no admin-only-reset role anymore.
// The Head Master/Second Master can still use "Reset" in User Accounts as a
// manual override for anyone, but that's no longer the ONLY option for
// Patron/Matron.

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, message: "Username and password required." });

    const result = await query(
      "SELECT * FROM users WHERE username = $1 AND is_active = true",
      [username]
    );
    if (result.rows.length === 0)
      return res.status(401).json({ success: false, message: "Invalid credentials." });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ success: false, message: "Invalid credentials." });

    // Combined role list: primary role + any extra roles (e.g. an Academic
    // Master who is ALSO the Matron) — everything in this app that checks
    // permissions looks at this array, not the single `role` column.
    const roles = Array.from(new Set([user.role, ...(user.extra_roles || [])]));

    // Subject NAMES (not just the raw subject_ids) — needed so the account's
    // own Profile view can show "Subjects Taught" the same way User Accounts
    // does, without a separate round-trip.
    const subjectNamesResult = await query(
      `SELECT COALESCE(array_agg(name ORDER BY name), '{}') AS subject_names FROM subjects WHERE id = ANY($1)`,
      [user.subject_ids || []]
    );
    const subject_names = subjectNamesResult.rows[0]?.subject_names || [];

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, roles, full_name: user.full_name,
        subject_ids: user.subject_ids || [], assigned_forms: user.assigned_forms || [],
        class_teacher_of: user.class_teacher_of || null },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, role: user.role, roles, full_name: user.full_name,
        subject_ids: user.subject_ids || [], subject_names, assigned_forms: user.assigned_forms || [],
        class_teacher_of: user.class_teacher_of || null, photo_url: user.photo_url || null,
        phone: user.phone || null, email: user.email || null, employment_type: user.employment_type || "Permanent" },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me
const me = async (req, res) => {
  res.json({ success: true, user: req.user });
};

// POST /api/auth/change-password
const changePassword = async (req, res, next) => {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password)
      return res.status(400).json({ success: false, message: "Both old and new passwords required." });

    const result = await query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    const user = result.rows[0];

    const valid = await bcrypt.compare(old_password, user.password);
    if (!valid)
      return res.status(401).json({ success: false, message: "Old password is incorrect." });

    const hashed = await bcrypt.hash(new_password, 10);
    await query("UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2", [hashed, req.user.id]);

    res.json({ success: true, message: "Password changed successfully." });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/forgot-password  { email }
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required." });

    // Case/whitespace-INSENSITIVE match. Accounts are now stored trimmed +
    // lowercased on create/edit (see usersController.js), but this also
    // still matches any older account that was saved before that fix (with
    // stray capitalisation or a trailing space) - without this, an already-
    // mismatched stored email would keep silently failing to match forever,
    // even after the storage-side fix, since existing rows aren't rewritten
    // by that fix alone.
    const result = await query("SELECT * FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) AND is_active = true", [email]);
    // Always respond the same way whether or not the email exists, so we
    // don't leak which emails are registered.
    const genericMsg = { success: true, message: "If that email is registered, a reset link has been sent." };

    if (result.rows.length === 0) return res.json(genericMsg);
    const user = result.rows[0];

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await query(
      "UPDATE users SET reset_token_hash = $1, reset_token_expires = $2 WHERE id = $3",
      [tokenHash, expires, user.id]
    );

    const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password?token=${rawToken}&uid=${user.id}`;
    await sendPasswordResetEmail(user.email, user.full_name, resetUrl);

    res.json(genericMsg);
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/reset-password  { uid, token, new_password }
const resetPassword = async (req, res, next) => {
  try {
    const { uid, token, new_password } = req.body;
    if (!uid || !token || !new_password)
      return res.status(400).json({ success: false, message: "Missing required fields." });
    if (new_password.length < 6)
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });

    const result = await query("SELECT * FROM users WHERE id = $1", [uid]);
    if (result.rows.length === 0)
      return res.status(400).json({ success: false, message: "Invalid or expired reset link." });

    const user = result.rows[0];
    if (!user.reset_token_hash || !user.reset_token_expires || new Date(user.reset_token_expires) < new Date())
      return res.status(400).json({ success: false, message: "This reset link has expired. Please request a new one." });

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    if (tokenHash !== user.reset_token_hash)
      return res.status(400).json({ success: false, message: "Invalid or expired reset link." });

    const hashed = await bcrypt.hash(new_password, 10);
    await query(
      "UPDATE users SET password = $1, reset_token_hash = NULL, reset_token_expires = NULL, updated_at = NOW() WHERE id = $2",
      [hashed, uid]
    );

    res.json({ success: true, message: "Password has been reset successfully. You can now log in." });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/photo — multipart upload of the logged-in user's own
// profile photo, straight to Cloudinary. Any previously-uploaded photo for
// this account is deleted afterwards (best-effort, mirrors the student
// photo flow in studentController.js).
const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No photo uploaded." });

    const { uploadBufferToCloudinary, deleteCloudinaryImage, publicIdFromUserPhotoUrl } = require("../middleware/upload");
    const prev = await query("SELECT photo_url FROM users WHERE id = $1", [req.user.id]);

    const uploaded = await uploadBufferToCloudinary(req.file.buffer, {
      folder: "mikumbi/users",
      public_id: `user-${req.user.id}-${Date.now()}`,
    });

    await query("UPDATE users SET photo_url = $1, updated_at = NOW() WHERE id = $2", [uploaded.secure_url, req.user.id]);

    const oldPublicId = publicIdFromUserPhotoUrl(prev.rows[0]?.photo_url);
    if (oldPublicId) deleteCloudinaryImage(oldPublicId);

    res.json({ success: true, photo_url: uploaded.secure_url });
  } catch (err) { next(err); }
};

// DELETE /api/auth/photo — removes the logged-in user's own profile photo,
// reverting the account header back to initials.
const removeAvatar = async (req, res, next) => {
  try {
    const { deleteCloudinaryImage, publicIdFromUserPhotoUrl } = require("../middleware/upload");
    const prev = await query("SELECT photo_url FROM users WHERE id = $1", [req.user.id]);
    if (!prev.rows[0]?.photo_url) return res.json({ success: true, photo_url: null }); // nothing to remove

    await query("UPDATE users SET photo_url = NULL, updated_at = NOW() WHERE id = $1", [req.user.id]);

    const oldPublicId = publicIdFromUserPhotoUrl(prev.rows[0].photo_url);
    if (oldPublicId) deleteCloudinaryImage(oldPublicId);

    res.json({ success: true, photo_url: null });
  } catch (err) { next(err); }
};

module.exports = { login, me, changePassword, forgotPassword, resetPassword, uploadAvatar, removeAvatar };
