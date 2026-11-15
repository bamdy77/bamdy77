// Signed references for public QR verification links.
//
// Verification pages used to take a plain sequential id (…/verify/JI-12,
// …/id-card/verify/57), so anyone could walk the numbers and list every
// applicant's / student's name. New QR codes carry a short HMAC signature
// that only this server can produce; a page shows personal details only
// when the signature is valid. Old, unsigned codes still confirm the
// document is genuine but show a masked name only.
const crypto = require("crypto");

const secret = () => process.env.DATA_ENCRYPTION_KEY || process.env.JWT_SECRET || "";

function signRef(kind, id) {
  return crypto.createHmac("sha256", secret()).update(`${kind}:${id}`).digest("hex").slice(0, 20);
}

function verifyRef(kind, id, sig) {
  if (typeof sig !== "string" || !/^[a-f0-9]{20}$/.test(sig)) return false;
  const want = Buffer.from(signRef(kind, id));
  const got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

// "AMINA JUMA ALLY" -> "A**** J*** A***"
function maskName(fullName) {
  return String(fullName || "").split(/\s+/).filter(Boolean)
    .map((w) => w[0] + "*".repeat(Math.max(2, w.length - 1))).join(" ");
}

module.exports = { signRef, verifyRef, maskName };
