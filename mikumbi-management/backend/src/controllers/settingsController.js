// controllers/settingsController.js — Settings → "Signature & Stamp".
//
// Two independent things live here, deliberately never mixed:
//
//  1. school_settings (one row, id=1) — the HEAD MASTER's own signature AND
//     the school stamp, for the "MHURI/SAINI YA MKUU WA SHULE" line on the
//     Parent Report. Admin, Second Master, or Academic may upload/replace
//     either image (any of the three can act on the Head Master's behalf).
//
//  2. class_teacher_signatures (one row per Form I-IV) — a Class Teacher's
//     OWN signature, for the "Sahihi" line under their comment on the
//     Parent Report. No stamp column exists here at all — a Class Teacher
//     never stamps, only signs. A logged-in Class Teacher can only ever
//     touch their OWN Form's row (their class_teacher_of); Admin, Second
//     Master, or Academic may upload for ANY Form on that teacher's behalf
//     (e.g. the teacher's phone is broken, or they're away) by picking the
//     Form themselves.
//
// Both are already-transparent PNGs by the time they reach here - the
// background (white paper) removal happens client-side in the browser (see
// frontend/src/utils/signatureBackground.js) before upload, so this
// controller just stores whatever image it's given. The Parent Report PDF
// (resultsController.js) reads both tables directly from the DB (not
// through this API) and stamps the right image into the right slot
// automatically, for every role that can generate that report.
const { query } = require("../db/db");
const { encryptSecret } = require("../utils/secureBox");
const { uploadBufferToCloudinary, deleteCloudinaryImage, publicIdFromBrandingUrl } = require("../middleware/upload");

const VALID_FORMS = ["Form I", "Form II", "Form III", "Form IV"];
const ADMIN_TIER = ["admin", "second_master", "academic"];

function isAdminTier(req) {
  const roles = req.user.roles && req.user.roles.length ? req.user.roles : [req.user.role];
  return roles.some((r) => ADMIN_TIER.includes(r));
}
function isClassTeacher(req) {
  const roles = req.user.roles && req.user.roles.length ? req.user.roles : [req.user.role];
  return roles.includes("class_teacher");
}

// Works out WHICH Form's class_teacher_signatures row a request is allowed
// to touch. Admin/Second Master/Academic must say which Form they're acting
// on behalf of; a Class Teacher can only ever be resolved to their own
// assignment, regardless of what (if anything) they pass in - so there is
// no way, even by editing the request, for a Class Teacher to overwrite
// another Form's signature.
function resolveTargetForm(req) {
  if (isAdminTier(req)) {
    const requested = req.body.form || req.query.form;
    if (!requested || !VALID_FORMS.includes(requested)) {
      return { error: "Please choose which Form (I-IV) this signature is for." };
    }
    return { form: requested };
  }
  if (isClassTeacher(req)) {
    if (!req.user.class_teacher_of) {
      return { error: "You are not currently assigned as a Class Teacher of any Form." };
    }
    return { form: req.user.class_teacher_of };
  }
  return { error: "Forbidden." };
}

// ── Head Master signature + school stamp (school_settings, singleton) ─────
async function getHeadmasterRow() {
  const res = await query("SELECT headmaster_signature_url, school_stamp_url, updated_at FROM school_settings WHERE id = 1");
  return res.rows[0] || { headmaster_signature_url: null, school_stamp_url: null, updated_at: null };
}

const getBranding = async (req, res, next) => {
  try {
    const row = await getHeadmasterRow();
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
};

async function uploadBrandingImage(req, res, next, column) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No image file was uploaded." });
    const prev = await getHeadmasterRow();
    const oldUrl = prev[column];
    const result = await uploadBufferToCloudinary(req.file.buffer, { folder: "mikumbi/branding", format: "png" });
    await query(`UPDATE school_settings SET ${column} = $1, updated_at = NOW(), updated_by = $2 WHERE id = 1`, [result.secure_url, req.user.id]);
    const oldPublicId = publicIdFromBrandingUrl(oldUrl);
    if (oldPublicId) deleteCloudinaryImage(oldPublicId);
    res.json({ success: true, data: { url: result.secure_url } });
  } catch (err) { next(err); }
}
const uploadSignature = (req, res, next) => uploadBrandingImage(req, res, next, "headmaster_signature_url");
const uploadStamp = (req, res, next) => uploadBrandingImage(req, res, next, "school_stamp_url");

async function deleteBrandingImage(req, res, next, column) {
  try {
    const prev = await getHeadmasterRow();
    const url = prev[column];
    if (!url) return res.status(400).json({ success: false, message: "Nothing to remove." });
    await query(`UPDATE school_settings SET ${column} = NULL, updated_at = NOW(), updated_by = $1 WHERE id = 1`, [req.user.id]);
    const publicId = publicIdFromBrandingUrl(url);
    if (publicId) deleteCloudinaryImage(publicId);
    res.json({ success: true });
  } catch (err) { next(err); }
}
const deleteSignature = (req, res, next) => deleteBrandingImage(req, res, next, "headmaster_signature_url");
const deleteStamp = (req, res, next) => deleteBrandingImage(req, res, next, "school_stamp_url");

// ── Class Teacher signature (class_teacher_signatures, one row per Form) ──

// Returns every Form's signature in one call - a small (max 4-row) table,
// so there's no meaningful privacy cost in Admin/Second Master/Academic/any
// Class Teacher all seeing the full picture (which Forms already have a
// signature on file) rather than juggling per-Form permission slices.
const getClassTeacherSignatures = async (req, res, next) => {
  try {
    const rows = await query("SELECT form, signature_url, updated_at FROM class_teacher_signatures");
    const byForm = {};
    VALID_FORMS.forEach((f) => { byForm[f] = null; });
    rows.rows.forEach((r) => { byForm[r.form] = r.signature_url; });
    res.json({ success: true, data: byForm, editable_form: isAdminTier(req) ? null : (req.user.class_teacher_of || null) });
  } catch (err) { next(err); }
};

const uploadClassTeacherSignature = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No image file was uploaded." });
    const resolved = resolveTargetForm(req);
    if (resolved.error) return res.status(403).json({ success: false, message: resolved.error });
    const { form } = resolved;

    const prevRes = await query("SELECT signature_url FROM class_teacher_signatures WHERE form = $1", [form]);
    const oldUrl = prevRes.rows[0]?.signature_url || null;

    const result = await uploadBufferToCloudinary(req.file.buffer, { folder: "mikumbi/branding", format: "png" });

    await query(
      `INSERT INTO class_teacher_signatures (form, signature_url, updated_at, updated_by)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (form) DO UPDATE SET signature_url = $2, updated_at = NOW(), updated_by = $3`,
      [form, result.secure_url, req.user.id]
    );

    const oldPublicId = publicIdFromBrandingUrl(oldUrl);
    if (oldPublicId) deleteCloudinaryImage(oldPublicId);

    res.json({ success: true, data: { form, url: result.secure_url } });
  } catch (err) { next(err); }
};

const deleteClassTeacherSignature = async (req, res, next) => {
  try {
    const resolved = resolveTargetForm(req);
    if (resolved.error) return res.status(403).json({ success: false, message: resolved.error });
    const { form } = resolved;

    const prevRes = await query("SELECT signature_url FROM class_teacher_signatures WHERE form = $1", [form]);
    const url = prevRes.rows[0]?.signature_url;
    if (!url) return res.status(400).json({ success: false, message: "Nothing to remove." });

    await query("UPDATE class_teacher_signatures SET signature_url = NULL, updated_at = NOW(), updated_by = $1 WHERE form = $2", [req.user.id, form]);

    const publicId = publicIdFromBrandingUrl(url);
    if (publicId) deleteCloudinaryImage(publicId);

    res.json({ success: true });
  } catch (err) { next(err); }
};

// ── SMS Provider settings (Results SMS: NextSMS vs Android SMS Gateway) ───
// Same singleton row as the Head Master signature/stamp above. The gateway
// password is intentionally never sent back to the browser once saved -
// getSmsSettings reports whether one is set (a boolean) instead of the
// value itself, and updateSmsSettings only overwrites it if a new one is
// actually provided (an empty/omitted password on save means "keep the
// existing one", not "clear it").
const getSmsSettings = async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT sms_provider, android_sms_gateway_url, android_sms_gateway_username,
              (android_sms_gateway_password IS NOT NULL AND android_sms_gateway_password <> '') AS gateway_password_set
       FROM school_settings WHERE id = 1`
    );
    const row = rows[0] || {};
    res.json({
      success: true,
      data: {
        sms_provider: row.sms_provider || "nextsms",
        android_sms_gateway_url: row.android_sms_gateway_url || "",
        android_sms_gateway_username: row.android_sms_gateway_username || "",
        android_sms_gateway_password_set: !!row.gateway_password_set,
      },
    });
  } catch (err) { next(err); }
};

const updateSmsSettings = async (req, res, next) => {
  try {
    const { sms_provider, android_sms_gateway_url, android_sms_gateway_username, android_sms_gateway_password } = req.body || {};
    if (sms_provider && !["nextsms", "android_gateway"].includes(sms_provider)) {
      return res.status(400).json({ success: false, message: "Invalid sms_provider." });
    }
    await query(
      `UPDATE school_settings SET
         sms_provider = COALESCE($1::varchar, sms_provider),
         android_sms_gateway_url = COALESCE($2::varchar, android_sms_gateway_url),
         android_sms_gateway_username = COALESCE($3::varchar, android_sms_gateway_username),
         android_sms_gateway_password = CASE WHEN $4::text IS NOT NULL AND $4::text <> '' THEN $4::text ELSE android_sms_gateway_password END,
         updated_at = NOW(), updated_by = $5::integer
       WHERE id = 1`,
      [sms_provider || null, android_sms_gateway_url ?? null, android_sms_gateway_username ?? null,
       android_sms_gateway_password ? encryptSecret(String(android_sms_gateway_password)) : null, req.user.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
};

module.exports = {
  getBranding, uploadSignature, uploadStamp, deleteSignature, deleteStamp,
  getClassTeacherSignatures, uploadClassTeacherSignature, deleteClassTeacherSignature,
  getSmsSettings, updateSmsSettings,
};
