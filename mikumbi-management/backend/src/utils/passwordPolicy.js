// utils/passwordPolicy.js - one rule for every staff password (change,
// reset by email, set by the Head Master, chosen at account creation).
//
// At least 8 characters, containing both letters and numbers, not just the
// username, and not one of the passwords people try first. bcrypt work
// factor 12 for every newly stored password (existing hashes keep working
// and are simply re-hashed at 12 the next time the password changes).
const BCRYPT_ROUNDS = 12;

const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890",
  "qwerty123", "11111111", "00000000", "abcd1234", "admin123", "mikumbi123",
  "mikumbi2025", "mikumbi2026", "teacher123", "school123", "newala123",
]);

function passwordProblem(pw, user = null) {
  const s = String(pw || "");
  if (s.length < 8) return "Password must be at least 8 characters.";
  if (s.length > 128) return "Password is too long (maximum 128 characters).";
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return "Password must contain both letters and numbers.";
  if (COMMON.has(s.toLowerCase())) return "This password is too common. Please choose another one.";
  if (user && user.username && s.toLowerCase().includes(String(user.username).toLowerCase())) {
    return "Password must not contain the username.";
  }
  return null;
}

module.exports = { passwordProblem, BCRYPT_ROUNDS };
