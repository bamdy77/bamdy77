const jwt = require("jsonwebtoken");
const { query } = require("../db/db");

const auth = (roles = []) => {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    let token = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.query.token) {
      // Fallback for direct-navigation downloads (e.g. window.open for a PDF)
      // where the browser can't attach a custom Authorization header.
      token = req.query.token;
    }
    if (!token) {
      return res.status(401).json({ success: false, session_expired: true, message: "Access denied. No token provided." });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // A valid JWT signature only proves the token hasn't been tampered
      // with — it says nothing about whether the account is still active
      // *right now*, or whether its roles have just been changed. Re-reading
      // both live means deactivating someone or changing their role(s) takes
      // effect on their very next request, not just at their next login.
      const result = await query(`
        SELECT u.is_active, u.role, u.extra_roles, u.subject_ids, u.assigned_forms, u.class_teacher_of, u.photo_url,
               u.phone, u.email, u.employment_type, u.password_changed_at, u.preferred_font,
               COALESCE((SELECT array_agg(s.name ORDER BY s.name) FROM subjects s WHERE s.id = ANY(u.subject_ids)), '{}') AS subject_names
        FROM users u WHERE u.id = $1
      `, [decoded.id]);
      if (!result.rows.length || !result.rows[0].is_active) {
        return res.status(401).json({ success: false, session_expired: true, message: "This account has been deactivated. Contact the Head Master." });
      }

      const liveRow = result.rows[0];
      // A token issued before the latest password change/reset is no longer
      // valid - this is what actually signs out a stolen/old session.
      if (liveRow.password_changed_at && decoded.iat &&
          decoded.iat * 1000 < new Date(liveRow.password_changed_at).getTime() - 2000) {
        return res.status(401).json({ success: false, session_expired: true, message: "Your password was changed. Please sign in again." });
      }
      const liveRoles = Array.from(new Set([liveRow.role, ...(liveRow.extra_roles || [])]));
      req.user = {
        ...decoded, role: liveRow.role, roles: liveRoles,
        subject_ids: liveRow.subject_ids || [], subject_names: liveRow.subject_names || [],
        assigned_forms: liveRow.assigned_forms || [],
        class_teacher_of: liveRow.class_teacher_of || null, photo_url: liveRow.photo_url || null,
        phone: liveRow.phone || null, email: liveRow.email || null,
        employment_type: liveRow.employment_type || "Permanent",
        preferred_font: liveRow.preferred_font || null,
      };

      if (roles.length && !liveRoles.some((r) => roles.includes(r))) {
        return res.status(403).json({ success: false, message: "Forbidden. Insufficient permissions." });
      }
      next();
    } catch (err) {
      // Only a bad/expired token means "sign in again". A database hiccup is
      // a server error and must not throw the person out of the system.
      if (err && (err.name === "TokenExpiredError" || err.name === "JsonWebTokenError" || err.name === "NotBeforeError"))
        return res.status(401).json({ success: false, session_expired: true, message: "Your session has ended. Please sign in again." });
      return next(err);
    }
  };
};

module.exports = auth;
