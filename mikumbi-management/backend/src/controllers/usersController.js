// controllers/usersController.js — Head Master (and Second Master, who has
// the same access) manages every login account in the system.
const { passwordProblem, BCRYPT_ROUNDS } = require("../utils/passwordPolicy");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { query } = require("../db/db");

const VALID_ROLES = ["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"];
// A person can hold several roles at once (their primary `role` plus any
// number of `extra_roles`), but "admin" (Head Master) is a single, fixed
// seat — it must never appear as an extra role on anyone else's account.
const EXTRA_ROLES_ALLOWED = VALID_ROLES.filter((r) => r !== "admin");
// Patron/Matron accounts have no subjects/classes to teach, so
// subject_ids/assigned_forms are always cleared/hidden for them — this is
// purely about Results Management scope, NOT about email/password reset.
// Every role (including Patron/Matron) now requires an email and uses
// Gmail self-service "Forgot Password" the same as any other teacher.
const NO_TEACHING_ROLES = ["patron", "matron"];
// Permanent = employed by the Government (Serikali); Temporary = not yet
// on Government payroll. Shown as a badge next to the person's name.
const VALID_EMPLOYMENT_TYPES = ["Permanent", "Temporary"];
// The ONE class a Class Teacher is Class Teacher of — scopes Contribution
// Management. Distinct from `assigned_forms` (what they TEACH, for Results
// Management) — see migrate.js for the full explanation.
const VALID_FORMS = ["Form I", "Form II", "Form III", "Form IV"];

// GET /api/users
const listUsers = async (_req, res, next) => {
  try {
    const result = await query(`
      SELECT u.id, u.username, u.full_name, u.role, u.extra_roles, u.email, u.phone, u.is_active,
             u.subject_ids, u.assigned_forms, u.class_teacher_of, u.employment_type, u.photo_url,
             COALESCE(
               (SELECT array_agg(s.name ORDER BY s.name) FROM subjects s WHERE s.id = ANY(u.subject_ids)),
               '{}'
             ) AS subject_names,
             t.id AS teacher_id, t.short_name AS teacher_short_name,
             u.created_at
      FROM users u
      LEFT JOIN teachers t ON t.user_id = u.id
      ORDER BY u.role, u.full_name
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

function randomTempPassword() {
  return crypto.randomBytes(12).toString("base64url"); // 16 random characters
}

const ROLE_LABELS = {
  admin: "Head Master", second_master: "Second Master", academic: "Academic Master",
  teacher: "Teacher", patron: "School Patron", matron: "School Matron",
  class_teacher: "Class Teacher", food_teacher: "Food Teacher",
};
const positionOf = (role, extraRoles) =>
  Array.from(new Set([role, ...(extraRoles || [])])).map((r) => ROLE_LABELS[r] || r).join(" + ");

// ── SMS Staff Contacts auto-sync ─────────────────────────────────────────────
// Per Communications → SMS Service: the staff Name, Phone, and Role captured
// here in User Accounts are what populate the "Staff" SMS list — nobody
// re-types them. This keeps sms_staff_contacts in sync with an account's
// record on every create/update/deactivate/reactivate. Permanent deletes are
// handled by the DB's ON DELETE CASCADE on sms_staff_contacts.user_id.
const syncStaffContact = async (u) => {
  if (!u) return;
  const phone = (u.phone || "").trim();
  const fullName = (u.full_name || "").trim();

  if (!phone || !fullName) {
    // No usable phone (yet) — clear any stale contact for this account
    // rather than leaving an outdated/incomplete one visible under SMS Service.
    await query("DELETE FROM sms_staff_contacts WHERE user_id = $1", [u.id]);
    return;
  }

  await query(`
    INSERT INTO sms_staff_contacts (user_id, name, position, phone, is_active)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (user_id) DO UPDATE SET
      name      = EXCLUDED.name,
      position  = EXCLUDED.position,
      phone     = EXCLUDED.phone,
      is_active = EXCLUDED.is_active
  `, [u.id, fullName, positionOf(u.role, u.extra_roles), phone, u.is_active !== false]);
};

// POST /api/users
// body: { username, full_name, role, email, subject_ids?[], assigned_forms?[], teacher_id?, password? }
// - role='teacher': subject_ids + assigned_forms (both arrays — a teacher can
//   teach more than one subject and/or more than one class) scope what they
//   see/enter in Results Management; teacher_id links to an existing
//   `teachers` roster row (from the Timetable module) so TAMS check-in and
//   Teacher Assignment tables resolve to this same account.
// - role='patron'/'matron'/'academic'/'admin'/'second_master': subject_ids/
//   assigned_forms/teacher_id not required.
// - If password is omitted, a random temporary one is generated and
//   returned once in the response — the Head Master shares it with them,
//   and they can then use Gmail "Forgot password" to set their own (every
//   role, including Patron/Matron, uses Gmail self-service reset now).
const createUser = async (req, res, next) => {
  try {
    const { username, full_name, role, email, subject_ids, assigned_forms, class_teacher_of, teacher_id, password, extra_roles, phone, employment_type } = req.body;
    if (!username || !full_name || !role)
      return res.status(400).json({ success: false, message: "username, full_name and role are required." });
    if (!VALID_ROLES.includes(role))
      return res.status(400).json({ success: false, message: "Invalid role." });
    if (employment_type && !VALID_EMPLOYMENT_TYPES.includes(employment_type))
      return res.status(400).json({ success: false, message: "Invalid employment type." });
    if (role === "admin")
      return res.status(400).json({ success: false, message: "There can only be one Head Master account." });
    const extraRolesClean = Array.isArray(extra_roles) ? extra_roles.filter((r) => r !== role) : [];
    for (const r of extraRolesClean) {
      if (!EXTRA_ROLES_ALLOWED.includes(r)) return res.status(400).json({ success: false, message: `Invalid extra role: ${r}.` });
    }
    if (class_teacher_of && !VALID_FORMS.includes(class_teacher_of))
      return res.status(400).json({ success: false, message: "Invalid class for Class Teacher Of." });
    // Only meaningful when the account actually holds the class_teacher role
    // (primary or extra) — otherwise there's nothing to scope, so it's
    // silently dropped rather than stored as an orphaned value.
    const isClassTeacher = role === "class_teacher" || extraRolesClean.includes("class_teacher");
    const classTeacherOfClean = isClassTeacher ? (class_teacher_of || null) : null;
    // Email is required for EVERY role now (including Patron/Matron) so
    // every account — no matter which role(s) it holds — can use Gmail
    // "Forgot password" self-service, the same as any other teacher.
    if (!email)
      return res.status(400).json({ success: false, message: "Email is required so this account can use Gmail password reset." });
    // Only the Head Master (admin) may create another Second Master.
    if ((role === "second_master" || extraRolesClean.includes("second_master")) && req.user.role !== "admin")
      return res.status(403).json({ success: false, message: "Only the Head Master can create a Second Master account." });

    if (password && passwordProblem(password)) {
      return res.status(400).json({ success: false, message: passwordProblem(password) });
    }
    const tempPassword = password ? password : randomTempPassword();
    const hashed = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

    // Trimmed + lowercased, same as username/full_name/phone right below -
    // email was the one field on this row that wasn't, so an account typed
    // in as "John.Doe@Gmail.com" (or with a stray trailing space) stored
    // exactly that way. "Forgot password" then does an exact match against
    // whatever the person types on the login screen (almost always plain
    // lowercase) - a case/whitespace mismatch meant zero rows ever matched,
    // silently, since that endpoint always replies "if that email is
    // registered..." either way (so as not to leak which emails exist).
    const result = await query(
      `INSERT INTO users (username, password, full_name, role, extra_roles, email, subject_ids, assigned_forms, class_teacher_of, phone, employment_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, username, full_name, role, extra_roles, email, subject_ids, assigned_forms, class_teacher_of, phone, employment_type, is_active`,
      [username.trim(), hashed, full_name.trim(), role, extraRolesClean, email && email.trim() ? email.trim().toLowerCase() : null,
       Array.isArray(subject_ids) ? subject_ids : [], Array.isArray(assigned_forms) ? assigned_forms : [], classTeacherOfClean,
       phone && phone.trim() ? phone.trim() : null, employment_type || "Permanent"]
    );
    const newUser = result.rows[0];
    await syncStaffContact(newUser);

    if (role === "teacher" || extraRolesClean.includes("teacher") || extraRolesClean.includes("class_teacher")) {
      if (teacher_id) {
        // Linking to a teachers roster row created before this system existed.
        await query(`UPDATE teachers SET user_id = $1 WHERE id = $2`, [newUser.id, teacher_id]);
      } else {
        // Normal path: User Accounts is the source of truth — auto-create the
        // matching `teachers` roster row (used by TAMS + Teacher Assignment
        // Tables) right now, linked via user_id, so Academic Master never has
        // to (and never can) hand-type a duplicate teacher name later.
        const subjNames = await query(
          `SELECT name FROM subjects WHERE id = ANY($1::int[]) ORDER BY name`,
          [Array.isArray(subject_ids) ? subject_ids : []]
        );
        const primarySubject = subjNames.rows[0]?.name || null;
        await query(
          `INSERT INTO teachers (short_name, full_name, subject, user_id, is_active)
           VALUES ($1,$2,$3,$4,true)`,
          [full_name.trim(), full_name.trim(), primarySubject, newUser.id]
        );
      }
    }

    res.status(201).json({
      success: true,
      data: newUser,
      temporary_password: password ? undefined : tempPassword,
      message: password
        ? "Account created."
        : `Account created. Temporary password: ${tempPassword} — share this with them once; they can change it via "Forgot password" (Gmail) afterwards.`,
    });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ success: false, message: "That username or email is already in use." });
    next(err);
  }
};

// PATCH /api/users/:id
const updateUser = async (req, res, next) => {
  try {
    const { username, full_name, email, role, subject_ids, assigned_forms, class_teacher_of, is_active, teacher_id, extra_roles, phone, employment_type } = req.body;
    if (employment_type && !VALID_EMPLOYMENT_TYPES.includes(employment_type))
      return res.status(400).json({ success: false, message: "Invalid employment type." });
    if (class_teacher_of && !VALID_FORMS.includes(class_teacher_of))
      return res.status(400).json({ success: false, message: "Invalid class for Class Teacher Of." });

    // Single lookup of the account's CURRENT role/extra_roles/class_teacher_of,
    // reused below for the primary-role guard, the extra_roles guard, and
    // resolving the final class_teacher_of value, so everything agrees on
    // the same, freshest row. Always fetched (not just when role/extra_roles
    // are being changed) because class_teacher_of's final value depends on
    // the account's CURRENT held roles whenever this request doesn't also
    // change them.
    const targetLookup = await query(`SELECT role, extra_roles, class_teacher_of FROM users WHERE id = $1`, [req.params.id]);
    if (!targetLookup.rows.length) return res.status(404).json({ success: false, message: "User not found." });
    const targetRow = targetLookup.rows[0];

    let extraRolesClean = null;
    if (Array.isArray(extra_roles)) {
      // The Head Master (admin) is a single, fixed seat — it must never
      // carry any extra roles on top of "admin", no matter who asks.
      if (targetRow.role === "admin" && extra_roles.length)
        return res.status(403).json({ success: false, message: "The Head Master account cannot be given any additional roles." });
      for (const r of extra_roles) {
        if (!EXTRA_ROLES_ALLOWED.includes(r)) return res.status(400).json({ success: false, message: `Invalid extra role: ${r}.` });
      }
      if (extra_roles.includes("second_master") && req.user.role !== "admin")
        return res.status(403).json({ success: false, message: "Only the Head Master can grant the Second Master role." });
      // Don't let the same role sit in both the primary slot and extra_roles
      // at once (whether the primary role is changing in this same request
      // or already was that role) — the union is what matters, not dupes.
      extraRolesClean = extra_roles.filter((r) => r !== (role || targetRow.role));
    }

    // Changing the primary Role — lets the Head Master (or Second Master)
    // re-assign what an account is (e.g. Teacher -> Academic Master)
    // straight from the Edit form. The Head Master's own "admin" role is a
    // fixed, singular seat and is never changed here, and only the Head
    // Master may promote someone to Second Master or touch a Second
    // Master's role.
    let roleClean = null;
    if (role) {
      if (!VALID_ROLES.includes(role))
        return res.status(400).json({ success: false, message: "Invalid role." });
      if (targetRow.role === "admin")
        return res.status(403).json({ success: false, message: "The Head Master account's role cannot be changed." });
      if (role === "admin")
        return res.status(400).json({ success: false, message: "There can only be one Head Master account." });
      if ((role === "second_master" || targetRow.role === "second_master") && req.user.role !== "admin")
        return res.status(403).json({ success: false, message: "Only the Head Master can change a Second Master's role." });
      roleClean = role;
    }

    if (username && username.trim()) {
      const clash = await query(`SELECT id FROM users WHERE username = $1 AND id != $2`, [username.trim(), req.params.id]);
      if (clash.rows.length) return res.status(409).json({ success: false, message: "That username is already taken." });
    }

    // Resolve the final class_teacher_of directly (not via COALESCE, which
    // can't distinguish "not sent" from "explicitly cleared to null") —
    // based on whether the account's FINAL held roles (after this request)
    // still include class_teacher at all.
    const finalRole = roleClean || targetRow.role;
    const finalExtraRoles = extraRolesClean !== null ? extraRolesClean : (targetRow.extra_roles || []);
    const finalIsClassTeacher = finalRole === "class_teacher" || finalExtraRoles.includes("class_teacher");
    const finalClassTeacherOf = !finalIsClassTeacher
      ? null
      : (class_teacher_of !== undefined ? (class_teacher_of || null) : targetRow.class_teacher_of);

    // Same idea for subject_ids/assigned_forms: if the account's FINAL held
    // roles are entirely patron/matron (no teaching role left at all), these
    // must be force-cleared rather than left as stale leftovers from a
    // previous role. Otherwise a Teacher demoted to Patron keeps their old
    // subject_ids forever, which (via Results Management's "is this subject
    // in my scope" check) still lets them write/lock scores for a subject
    // they no longer teach. (This is purely about teaching scope — email/
    // Gmail reset is required for every role regardless of this check.)
    const finalAllRoles = [finalRole, ...finalExtraRoles];
    const finalNeedsTeaching = !finalAllRoles.every((r) => NO_TEACHING_ROLES.includes(r));
    const subjectIdsParam = !finalNeedsTeaching ? [] : (Array.isArray(subject_ids) ? subject_ids : null);
    const assignedFormsParam = !finalNeedsTeaching ? [] : (Array.isArray(assigned_forms) ? assigned_forms : null);

    const result = await query(
      `UPDATE users SET
         username = COALESCE($1, username),
         full_name = COALESCE($2, full_name),
         email = COALESCE($3, email),
         role = COALESCE($4, role),
         subject_ids = COALESCE($5, subject_ids),
         assigned_forms = COALESCE($6, assigned_forms),
         is_active = COALESCE($7, is_active),
         extra_roles = COALESCE($8, extra_roles),
         phone = COALESCE($9, phone),
         class_teacher_of = $11,
         employment_type = COALESCE($10, employment_type),
         updated_at = NOW()
       WHERE id = $12 RETURNING id, username, full_name, role, extra_roles, email, subject_ids, assigned_forms, class_teacher_of, is_active, phone, employment_type`,
      [username && username.trim() ? username.trim() : null, full_name || null, email && email.trim() ? email.trim().toLowerCase() : null, roleClean,
       subjectIdsParam,
       assignedFormsParam,
       is_active ?? null, extraRolesClean, phone && phone.trim() ? phone.trim() : null,
       employment_type || null, finalClassTeacherOf, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "User not found." });
    const updated = result.rows[0];
    await syncStaffContact(updated);

    // Keep the linked `teachers` roster row's active state in sync whenever
    // this endpoint is the one flipping is_active (e.g. the Reactivate
    // action re-enables the account but used to leave the teacher record
    // deactivated, so the person stayed invisible in Timetable/TAMS).
    if (is_active !== undefined && is_active !== null) {
      await query(`UPDATE teachers SET is_active = $1 WHERE user_id = $2`, [!!is_active, req.params.id]);
    }

    // TAMS (and Teacher Assignment) must always show the SAME name as User
    // Accounts — keep the linked `teachers` row's name in sync whenever the
    // Head Master edits it here, instead of letting it silently go stale.
    if (full_name) {
      await query(`UPDATE teachers SET full_name = $1 WHERE user_id = $2`, [full_name.trim(), req.params.id]);
    }

    // If teacher/class_teacher was just granted as a role, or this is the
    // Admin/Second Master account (the Head Master and Second Master often
    // teach a subject too and need to Mark Attendance + appear in the
    // Timetable), and there's no linked `teachers` roster row yet, create
    // one now — same auto-provisioning as at account creation.
    const needsTeacherRow = ["teacher", "class_teacher", "admin", "second_master"].includes(updated.role)
      || (updated.extra_roles || []).some((r) => r === "teacher" || r === "class_teacher");
    if (needsTeacherRow) {
      const existing = await query(`SELECT id FROM teachers WHERE user_id = $1`, [req.params.id]);
      if (!existing.rows.length) {
        await query(
          `INSERT INTO teachers (short_name, full_name, subject, user_id, is_active) VALUES ($1,$2,NULL,$3,true)`,
          [updated.full_name, updated.full_name, req.params.id]
        );
      }
    }

    // Re-assigning a teacher to a DIFFERENT subject (e.g. next year: CIVICS
    // Form I -> HISTORY Form II) used to leave the linked Timetable roster
    // row on the OLD subject, so Teacher Assignment kept saving the old
    // subject and the new one never worked. Whenever the account's subjects
    // change, move the roster row's main subject onto one the account
    // actually teaches now (keeping it if it's still taught).
    if (Array.isArray(subjectIdsParam)) {
      const names = await query(`SELECT name FROM subjects WHERE id = ANY($1::int[]) ORDER BY name`, [subjectIdsParam]);
      const taught = names.rows.map((r) => r.name);
      if (taught.length) {
        await query(
          `UPDATE teachers SET subject = $1, updated_at = NOW()
           WHERE user_id = $2 AND (subject IS NULL OR NOT (subject = ANY($3::text[])))`,
          [taught[0], req.params.id, taught]
        );
      }
    }

    if (teacher_id) await query(`UPDATE teachers SET user_id = $1 WHERE id = $2`, [req.params.id, teacher_id]);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

// POST /api/users/:id/reset — Admin/Second Master directly sets a new
// password (for patron/matron accounts, which don't use Gmail reset; also
// usable as a manual override for any account if the school needs it).
const adminSetPassword = async (req, res, next) => {
  try {
    const { new_password } = req.body;
    { const pwErr = passwordProblem(new_password); if (pwErr) return res.status(400).json({ success: false, message: pwErr }); }

    const target = await query(`SELECT role FROM users WHERE id = $1`, [req.params.id]);
    if (!target.rows.length) return res.status(404).json({ success: false, message: "User not found." });
    // The Head Master's own password can only be reset by the Head Master
    // themselves — a Second Master must not be able to lock the Head Master
    // out of their own account.
    if (target.rows[0].role === "admin" && String(req.user.id) !== String(req.params.id))
      return res.status(403).json({ success: false, message: "Only the Head Master can reset their own password." });

    const hashed = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
    // Unlock the account and end every existing session of that user.
    await query(`UPDATE users SET password = $1, password_changed_at = NOW(), failed_logins = 0, locked_until = NULL, updated_at = NOW() WHERE id = $2`, [hashed, req.params.id]);
    res.json({ success: true, message: "Password updated." });
  } catch (err) { next(err); }
};

// DELETE /api/users/:id — soft delete (deactivate), never hard-delete an
// account since it's referenced by historical scores/attendance/etc.
// A deactivated account is locked out immediately (checked on every
// request, not just at login) — see middleware/auth.js.
// DELETE /api/users/:id/permanent — a real, permanent delete (separate from
// deactivate). Only safe for an account that has no history attached yet
// (e.g. created with a typo minutes ago) — if the database refuses because
// other tables reference this user (TAMS records, results, etc.), we tell
// the caller to Deactivate instead rather than silently orphaning data.
const deleteUser = async (req, res, next) => {
  try {
    const target = await query(`SELECT role FROM users WHERE id = $1`, [req.params.id]);
    if (!target.rows.length) return res.status(404).json({ success: false, message: "User not found." });
    if (target.rows[0].role === "admin")
      return res.status(403).json({ success: false, message: "The Head Master account cannot be deleted." });
    if (target.rows[0].role === "second_master" && req.user.role !== "admin")
      return res.status(403).json({ success: false, message: "Only the Head Master can delete a Second Master account." });

    // The linked `teachers` roster row (used by Timetable teacher assignment,
    // TAMS, etc.) is never deleted outright — other tables reference it — but
    // it must stop showing up as an active teacher anywhere in the system the
    // moment this account is gone, or the person appears "deleted" here while
    // still selectable/visible in Timetable, Teacher Assignment, etc.
    await query(`UPDATE teachers SET user_id = NULL, is_active = false WHERE user_id = $1`, [req.params.id]);
    await query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: "Account permanently deleted." });
  } catch (err) {
    if (err.code === "23503") {
      return res.status(409).json({
        success: false,
        message: "This account already has history in the system (attendance, results, etc.) and can't be permanently deleted. Use Deactivate instead.",
      });
    }
    next(err);
  }
};

const deactivateUser = async (req, res, next) => {
  try {
    const target = await query(`SELECT role FROM users WHERE id = $1`, [req.params.id]);
    if (!target.rows.length) return res.status(404).json({ success: false, message: "User not found." });

    // Only the Head Master may deactivate a Second Master (who otherwise
    // has full admin-equivalent access) — a Second Master cannot deactivate
    // another Second Master or the Head Master.
    if (target.rows[0].role === "second_master" && req.user.role !== "admin")
      return res.status(403).json({ success: false, message: "Only the Head Master can deactivate a Second Master account." });
    if (target.rows[0].role === "admin")
      return res.status(403).json({ success: false, message: "The Head Master account cannot be deactivated." });

    const result = await query(
      `UPDATE users SET is_active = false WHERE id = $1 RETURNING id, full_name, role, extra_roles, phone, is_active`,
      [req.params.id]
    );
    // Keep the linked `teachers` roster row (Timetable/TAMS) in sync — a
    // deactivated account's teacher record should also stop appearing as an
    // active teacher elsewhere, otherwise they still show up there.
    await query(`UPDATE teachers SET is_active = false WHERE user_id = $1`, [req.params.id]);
    await syncStaffContact(result.rows[0]);
    res.json({ success: true, message: "Account deactivated." });
  } catch (err) { next(err); }
};

module.exports = { listUsers, createUser, updateUser, adminSetPassword, deactivateUser, deleteUser };
