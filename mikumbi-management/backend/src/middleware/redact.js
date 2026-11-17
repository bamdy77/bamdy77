// middleware/redact.js - last line of defence on every JSON response.
//
// 1. Never sent to anyone: password hashes and reset-token hashes (a
//    controller that accidentally returns a whole users row leaks nothing).
// 2. Sent only to the Head Master and Second Master: a student's Results
//    Login Number and its lock counters. The Login Number + the parent's
//    phone number are the full sign-in details for the parents' Results
//    website, so an ordinary staff account must not be able to collect them
//    by calling the API directly (many student queries return every column).
//
// Works on any shape (objects, arrays, nested) and leaves everything else
// untouched. Public (not signed-in) responses are handled the same way as a
// non-manager.
const ALWAYS_HIDDEN = new Set(["password", "password_hash", "reset_token_hash", "reset_token_expires"]);
const MANAGER_ONLY = new Set(["results_login_no", "results_failed_logins", "results_locked_until"]);
const MANAGERS = ["admin", "second_master"];

function scrub(value, hideManagerOnly, depth = 0) {
  if (depth > 12 || value === null || typeof value !== "object") return value;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, hideManagerOnly, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (ALWAYS_HIDDEN.has(k)) continue;
    if (hideManagerOnly && MANAGER_ONLY.has(k)) continue;
    out[k] = scrub(v, hideManagerOnly, depth + 1);
  }
  return out;
}

module.exports = function redact(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    const roles = (req.user && (req.user.roles || [req.user.role])) || [];
    const isManager = roles.some((r) => MANAGERS.includes(r));
    return json(scrub(body, !isManager));
  };
  next();
};
module.exports.scrub = scrub;
