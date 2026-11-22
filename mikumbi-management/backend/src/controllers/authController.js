const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
// Staff sessions last at most 12 hours (one working day); the browser also
// signs out after 30 minutes without activity (see AuthContext).
// JWT_EXPIRES_IN can only make it SHORTER, never longer than 12 hours.
const SESSION_TTL = (() => {
  const v = String(process.env.JWT_EXPIRES_IN || "").trim();
  const m = /^(\d+)\s*([smh])$/.exec(v);
  const secs = m ? Number(m[1]) * { s: 1, m: 60, h: 3600 }[m[2]] : Infinity;
  return Math.min(secs, 12 * 3600);
})();
const crypto = require("crypto");
const { passwordProblem, BCRYPT_ROUNDS } = require("../utils/passwordPolicy");

// Wrong passwords in a row before an account is locked for 15 minutes.
const MAX_FAILED_LOGINS = 8;
// A valid bcrypt hash of a random string - compared against when the
// username doesn't exist, so a login for a real and a fake username take
// the same time.
const DUMMY_HASH = "$2a$12$xJ1yJPvObIn5xOqN1udLruyay6AbFkR2Kj9oTRjZhQw8GcYI9RxrW";
const { query } = require("../db/db");
const { sendPasswordResetEmail } = require("../utils/mailer");
const { recordAudit } = require("../utils/auditLogger");
// The account itself as the "actor" of its own sign-in entries.
const asActor = (u) => ({ id: u.id, username: u.username, role: u.role });

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
    if (result.rows.length === 0) {
      // Spend the same time as a real check so response timing can't reveal
      // which usernames exist.
      await bcrypt.compare(String(password), DUMMY_HASH);
      // The typed name is NOT stored: people sometimes type their password
      // into the username box by mistake.
      recordAudit({ actor: null, action: "auth.login_failed", entityType: "user",
        description: "Failed sign-in: unknown or inactive username.", metadata: { reason: "unknown_username" }, req });
      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    const user = result.rows[0];
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const mins = Math.max(1, Math.ceil((new Date(user.locked_until) - new Date()) / 60000));
      return res.status(423).json({ success: false, message: `This account is temporarily locked after too many wrong passwords. Try again in ${mins} minute(s), or ask the Head Master to reset the password.` });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      const upd = await query(
        `UPDATE users SET failed_logins = failed_logins + 1,
           locked_until = CASE WHEN failed_logins + 1 >= ${MAX_FAILED_LOGINS} THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END
         WHERE id = $1 RETURNING failed_logins, locked_until`, [user.id]);
      const tries = upd.rows[0]?.failed_logins || 0;
      const nowLocked = upd.rows[0]?.locked_until && new Date(upd.rows[0].locked_until) > new Date();
      await recordAudit({ actor: asActor(user), action: "auth.login_failed", entityType: "user", entityId: user.id,
        description: `Wrong password for ${user.full_name} (${tries} in a row).`, metadata: { reason: "wrong_password", tries }, req });
      if (nowLocked && tries === MAX_FAILED_LOGINS) {
        await recordAudit({ actor: asActor(user), action: "auth.locked", entityType: "user", entityId: user.id,
          description: `${user.full_name}'s account was locked for 15 minutes after ${tries} wrong passwords.`, metadata: { tries }, req });
      }
      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }
    if (user.failed_logins || user.locked_until) {
      await query(`UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1`, [user.id]);
    }

    // Two-step verification for the Head Master and Second Master on a new
    // device (see twoFactor below). Trusted devices skip it for 30 days.
    const gate = await twoFactorGate(user, req.body && req.body.device_token);
    if (gate) return res.json(gate);

    await recordAudit({ actor: asActor(user), action: "auth.login", entityType: "user", entityId: user.id,
      description: `${user.full_name} signed in.`, req });
    return issueLogin(res, user);
  } catch (err) {
    next(err);
  }
};

// ── Two-step verification (2FA) ─────────────────────────────────────────
// Head Master, Second Master and Academic Master accounts must confirm a 6-digit code sent to
// their account email when signing in from a device not used before. The
// device is then trusted for TRUST_DAYS. Codes live 10 minutes and allow 5
// tries. Changing/resetting the password forgets every trusted device.
const TWO_FACTOR_ROLES = ["admin", "second_master", "academic"];
const TRUST_DAYS = 30;
const CODE_MINUTES = 10;
const MAX_CODE_TRIES = 5;
const sha256 = (v) => crypto.createHash("sha256").update(String(v)).digest("hex");
const maskEmail = (e) => String(e).replace(/^(.)(.*)(@.*)$/, (_m, a, b, c) => a + "*".repeat(Math.max(2, b.length)) + c);

async function twoFactorGate(user, deviceToken) {
  const roles = [user.role, ...(user.extra_roles || [])];
  if (!roles.some((r) => TWO_FACTOR_ROLES.includes(r))) return null;
  const { mailStatus } = require("../utils/mailer");
  if (!user.email || !/^Brevo/.test(mailStatus())) {
    // Cannot send a code (no email on the account, or email not set up on
    // the server) - let them in rather than lock the school out, and say so.
    console.warn(`[2FA] skipped for user ${user.id}: ${!user.email ? "no email on account" : "email not configured"}`);
    return null;
  }
  if (typeof deviceToken === "string" && /^[a-f0-9]{64}$/.test(deviceToken)) {
    const { rows } = await query(
      `UPDATE trusted_devices SET last_used_at = NOW() WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW() RETURNING id`,
      [user.id, sha256(deviceToken)]);
    if (rows.length) return null; // known device
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const challengeId = crypto.randomBytes(24).toString("hex");
  await query(`DELETE FROM login_challenges WHERE user_id = $1 OR expires_at < NOW()`, [user.id]);
  await query(
    `INSERT INTO login_challenges (id, user_id, code_hash, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '${CODE_MINUTES} minutes')`,
    [challengeId, user.id, sha256(`${challengeId}:${code}`)]);
  const { sendMail, esc } = require("../utils/mailer");
  await sendMail({
    to: user.email, toName: user.full_name, subject: `Login code: ${code} - Mikumbi Secondary School`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e0e0e0;border-radius:4px;">
      <h2 style="color:#0c426f;margin:0 0 14px;">Mikumbi Secondary School</h2>
      <p>Hello ${esc(user.full_name)},</p>
      <p>Someone (hopefully you) is signing in to your account from a new device. Your login code is:</p>
      <p style="font-size:30px;font-weight:800;letter-spacing:8px;text-align:center;margin:22px 0;color:#0c426f;">${code}</p>
      <p style="font-size:13px;color:#555;">It expires in ${CODE_MINUTES} minutes. If this was not you, change your password immediately.</p></div>`,
  });
  return { success: true, twofa_required: true, challenge_id: challengeId, email_hint: maskEmail(user.email),
    message: `A login code was sent to ${maskEmail(user.email)}.` };
}

// POST /api/auth/login/verify { challenge_id, code, remember }
const verifyLoginCode = async (req, res, next) => {
  try {
    const { challenge_id: cid, code } = req.body || {};
    if (typeof cid !== "string" || !/^[a-f0-9]{48}$/.test(cid) || typeof code !== "string" || !/^\d{6}$/.test(code.trim()))
      return res.status(400).json({ success: false, message: "Enter the 6-digit code from your email." });
    const { rows } = await query(`SELECT * FROM login_challenges WHERE id = $1`, [cid]);
    const ch = rows[0];
    if (!ch || new Date(ch.expires_at) < new Date() || ch.attempts >= MAX_CODE_TRIES)
      return res.status(401).json({ success: false, expired: true, message: "This code has expired. Please sign in again to get a new code." });
    const ok = crypto.timingSafeEqual(Buffer.from(ch.code_hash), Buffer.from(sha256(`${cid}:${code.trim()}`)));
    if (!ok) {
      await query(`UPDATE login_challenges SET attempts = attempts + 1 WHERE id = $1`, [cid]);
      const left = MAX_CODE_TRIES - ch.attempts - 1;
      const who = await query(`SELECT id, username, role, full_name FROM users WHERE id = $1`, [ch.user_id]);
      if (who.rows[0]) await recordAudit({ actor: asActor(who.rows[0]), action: "auth.2fa_failed", entityType: "user", entityId: ch.user_id,
        description: `Wrong login code for ${who.rows[0].full_name}${left > 0 ? ` (${left} attempt(s) left)` : " - sign-in blocked, a new code is needed"}.`,
        metadata: { attempts_left: Math.max(left, 0) }, req });
      return res.status(401).json({ success: false, expired: left <= 0,
        message: left > 0 ? `Wrong code. ${left} attempt(s) left.` : "Too many wrong codes. Please sign in again." });
    }
    await query(`DELETE FROM login_challenges WHERE id = $1`, [cid]);
    const uRes = await query(`SELECT * FROM users WHERE id = $1 AND is_active = true`, [ch.user_id]);
    if (!uRes.rows.length) return res.status(401).json({ success: false, message: "Account not available." });
    const deviceToken = crypto.randomBytes(32).toString("hex");
    await query(
      `INSERT INTO trusted_devices (user_id, token_hash, user_agent, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '${TRUST_DAYS} days')`,
      [ch.user_id, sha256(deviceToken), String(req.headers["user-agent"] || "").slice(0, 200)]);
    await recordAudit({ actor: asActor(uRes.rows[0]), action: "auth.login", entityType: "user", entityId: ch.user_id,
      description: `${uRes.rows[0].full_name} signed in on a new device (login code confirmed).`, metadata: { two_factor: true }, req });
    return issueLogin(res, uRes.rows[0], { device_token: deviceToken });
  } catch (err) { next(err); }
};

// Builds the normal login response (token + user) - shared by password
// login and by the 2-step code check.
async function issueLogin(res, user, extra = {}) {

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
      { expiresIn: SESSION_TTL }
    );

    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, role: user.role, roles, full_name: user.full_name,
        subject_ids: user.subject_ids || [], subject_names, assigned_forms: user.assigned_forms || [],
        class_teacher_of: user.class_teacher_of || null, photo_url: user.photo_url || null,
        phone: user.phone || null, email: user.email || null, employment_type: user.employment_type || "Permanent",
        preferred_font: user.preferred_font || null, preferred_language: user.preferred_language || null },
      ...extra,
    });
}

// GET /api/auth/me
const me = async (req, res) => {
  res.json({ success: true, user: req.user });
};

// PUT /api/auth/preferences/font  { font }
// Saves the interface font for the CALLER only (req.user.id from the token;
// there is no user id in the request, so nobody can change someone else's).
const FONT_CHOICES = ["default", "arial", "poppins", "times", "opensans"];
const setPreferredFont = async (req, res, next) => {
  try {
    const font = req.body ? req.body.font : undefined;
    if (typeof font !== "string" || !FONT_CHOICES.includes(font))
      return res.status(400).json({ success: false, message: `Invalid font. Choose one of: ${FONT_CHOICES.join(", ")}.` });
    // "default" is stored as NULL so the account simply follows the system default.
    await query("UPDATE users SET preferred_font = $1 WHERE id = $2", [font === "default" ? null : font, req.user.id]);
    res.json({ success: true, preferred_font: font === "default" ? null : font });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/download-token - a 2-minute token for opening one PDF in a
// new tab (see middleware/auth.js). It carries the same identity and roles,
// is checked against the account like any sign-in, and stops working after
// a password change, like every other token.
const issueDownloadToken = async (req, res) => {
  const token = jwt.sign({ id: req.user.id, username: req.user.username, full_name: req.user.full_name, type: "download" }, process.env.JWT_SECRET, { expiresIn: 120 });
  res.json({ success: true, token, expires_in: 120 });
};

// PUT /api/auth/preferences/language  { language: "en" | "sw" }
// Saves the interface language for the CALLER only (id from the token).
const setPreferredLanguage = async (req, res, next) => {
  try {
    const language = req.body ? req.body.language : undefined;
    if (language !== "en" && language !== "sw")
      return res.status(400).json({ success: false, message: "Invalid language. Choose en or sw." });
    await query("UPDATE users SET preferred_language = $1 WHERE id = $2", [language, req.user.id]);
    res.json({ success: true, preferred_language: language });
  } catch (err) {
    next(err);
  }
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
    const pwErr = passwordProblem(new_password, user);
    if (pwErr) return res.status(400).json({ success: false, message: pwErr });

    const hashed = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
    // password_changed_at logs out every OTHER session that used the old
    // password; this browser gets a fresh token below so it stays signed in.
    await query("UPDATE users SET password = $1, password_changed_at = NOW(), failed_logins = 0, locked_until = NULL, updated_at = NOW() WHERE id = $2", [hashed, req.user.id]);
    await query("DELETE FROM trusted_devices WHERE user_id = $1", [req.user.id]); // new password = re-verify devices
    await recordAudit({ actor: req.user, action: "auth.password_changed", entityType: "user", entityId: req.user.id,
      description: `${user.full_name} changed their own password.`, req });
    const freshToken = jwt.sign(
      { id: user.id, username: user.username, role: user.role, roles: Array.from(new Set([user.role, ...(user.extra_roles || [])])), full_name: user.full_name,
        subject_ids: user.subject_ids || [], assigned_forms: user.assigned_forms || [], class_teacher_of: user.class_teacher_of || null },
      process.env.JWT_SECRET,
      { expiresIn: SESSION_TTL }
    );
    return res.json({ success: true, message: "Password changed successfully.", token: freshToken });
  } catch (err) {
    next(err);
  }
};

// Where the reset link should point. FRONTEND_URL wins; without it the
// link used to point at http://localhost:5173, which opens nothing on the
// user's phone. Fallback: the site the request came from, but ONLY if it is
// a trusted origin (ALLOWED_ORIGINS or a *.vercel.app preview) - never an
// arbitrary Origin header, so the link cannot be redirected to a fake site.
function staffSiteUrl(req) {
  const configured = String(process.env.FRONTEND_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const origin = String(req.headers.origin || "").trim().replace(/\/+$/, "");
  const allowed = String(process.env.ALLOWED_ORIGINS || "").split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean);
  try {
    const u = new URL(origin);
    if (u.protocol === "https:" && (allowed.includes(origin) || /\.vercel\.app$/i.test(u.hostname))) return origin;
  } catch { /* not a URL */ }
  return "http://localhost:5173";
}

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

    const resetUrl = `${staffSiteUrl(req)}/reset-password?token=${rawToken}&uid=${user.id}`;
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
    { const pwErr = passwordProblem(new_password); if (pwErr) return res.status(400).json({ success: false, message: pwErr }); }

    const result = await query("SELECT * FROM users WHERE id = $1", [uid]);
    if (result.rows.length === 0)
      return res.status(400).json({ success: false, message: "Invalid or expired reset link." });

    const user = result.rows[0];
    if (!user.reset_token_hash || !user.reset_token_expires || new Date(user.reset_token_expires) < new Date())
      return res.status(400).json({ success: false, message: "This reset link has expired. Please request a new one." });

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    if (tokenHash !== user.reset_token_hash)
      return res.status(400).json({ success: false, message: "Invalid or expired reset link." });

    const hashed = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
    await query(
      "UPDATE users SET password = $1, reset_token_hash = NULL, reset_token_expires = NULL, password_changed_at = NOW(), failed_logins = 0, locked_until = NULL, updated_at = NOW() WHERE id = $2",
      [hashed, uid]
    );
    await query("DELETE FROM trusted_devices WHERE user_id = $1", [uid]); // new password = re-verify devices
    {
      const who = await query(`SELECT id, username, role, full_name FROM users WHERE id = $1`, [uid]);
      if (who.rows[0]) await recordAudit({ actor: asActor(who.rows[0]), action: "auth.password_reset_email", entityType: "user", entityId: uid,
        description: `${who.rows[0].full_name} set a new password with the email reset link.`, req });
    }

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

module.exports = {
  setPreferredFont, setPreferredLanguage, issueDownloadToken,
  verifyLoginCode, login, me, changePassword, forgotPassword, resetPassword, uploadAvatar, removeAvatar };
