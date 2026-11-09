// Same rule the server enforces (backend/src/utils/passwordPolicy.js) -
// checked here first so staff see the problem before submitting.
export function passwordProblem(pw) {
  const s = String(pw || "");
  if (s.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return "Password must contain both letters and numbers.";
  return null;
}
export const PASSWORD_HINT = "At least 8 characters, with both letters and numbers.";
