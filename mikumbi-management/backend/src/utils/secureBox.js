// utils/secureBox.js - encryption at rest for secrets the system must be
// able to READ back (so they cannot be hashed), e.g. the Android SMS
// Gateway password the server needs in order to log in to the gateway.
//
// AES-256-GCM (authenticated encryption): a stored value can be neither
// read nor silently altered without the key. The key comes from
// DATA_ENCRYPTION_KEY (recommended: a long random string set once on
// Render) and falls back to JWT_SECRET so existing deployments keep
// working without any new setting. If the key ever changes, previously
// encrypted secrets can no longer be decrypted and simply need to be
// typed in again (e.g. the SMS gateway password in Settings).
//
// Stored format: "enc:v1:<iv b64>:<tag b64>:<ciphertext b64>". Anything
// without the prefix is treated as legacy plaintext, so old rows keep
// working until they are re-saved / migrated.
const crypto = require("crypto");

const PREFIX = "enc:v1:";

function key() {
  const secret = process.env.DATA_ENCRYPTION_KEY || process.env.JWT_SECRET || "";
  return crypto.createHash("sha256").update(`mikumbi-data-key:${secret}`).digest();
}

function encryptSecret(plain) {
  if (plain === null || plain === undefined || plain === "") return plain;
  const s = String(plain);
  if (s.startsWith(PREFIX)) return s; // already encrypted
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(s, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

function decryptSecret(stored) {
  if (stored === null || stored === undefined || stored === "") return stored;
  const s = String(stored);
  if (!s.startsWith(PREFIX)) return s; // legacy plaintext
  try {
    const [ivB64, tagB64, dataB64] = s.slice(PREFIX.length).split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null; // wrong key or tampered value - caller treats it as "not set"
  }
}

const isEncrypted = (s) => typeof s === "string" && s.startsWith(PREFIX);

module.exports = { encryptSecret, decryptSecret, isEncrypted };
