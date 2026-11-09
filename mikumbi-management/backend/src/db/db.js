// Force IPv4-first DNS resolution. Without this, Node tries the IPv6
// address first; on networks without IPv6 connectivity that attempt hangs
// until it fails (ENETUNREACH), THEN falls back to IPv4 — which is slow
// enough to blow past connection timeouts. This single line is what was
// causing "npm run db:migrate" to hang/fail, and also intermittent
// "Internal Server Error" on API calls made after the first one (each new
// pooled connection was hitting the same slow IPv6-first lookup).
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try {
  // Node 18.3+: without this, a single connection attempt can fan out to
  // EVERY address DNS returns (IPv6 AND several IPv4s, since Neon rotates
  // through multiple IPs) in parallel/sequence per RFC 8305 "Happy
  // Eyeballs" — each failed candidate still has to time out on its own,
  // which is why a fully-blocked network can take a long time to fail
  // instead of failing fast on the first attempt.
  require("net").setDefaultAutoSelectFamily(false);
} catch { /* older Node without this API — dns ordering above still helps */ }

const { Pool, types } = require("pg");
require("dotenv").config();

// By default node-postgres parses DATE columns (dob, admission_date,
// charge_date, admitted_date, incident_date, etc.) into a JS Date object.
// That Date is built at LOCAL midnight (this process runs with
// TZ=Africa/Dar_es_Salaam, set at the top of index.js) — which is exactly
// right until something calls `.toISOString()` or `JSON.stringify()`
// (which calls toISOString internally) on it: both always convert to UTC,
// and Tanzania midnight is 21:00 UTC the PREVIOUS day. That silently turns
// every admission_date / dob / charge_date sent to the frontend (or into a
// PDF) into the day before it should be — every time, not just near
// midnight. Returning the raw 'YYYY-MM-DD' string instead (oid 1082 =
// Postgres's "date" type) sidesteps the whole problem at the source.
types.setTypeParser(1082, (value) => value);

// Fail fast with a clear message instead of the cryptic
// "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string"
// error that node-postgres throws when DATABASE_URL is missing/empty or
// its password segment contains characters that broke URL parsing.
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.trim()) {
  console.error("\n[CONFIG ERROR] DATABASE_URL is missing or empty in backend/.env");
  console.error("Check that backend/.env exists (copied from .env.example) and has a line like:");
  console.error("  DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=require");
  console.error("If your Neon password contains special characters (@ # % & : / ? +), they must be");
  console.error("URL-encoded — easiest fix: copy the connection string directly from the Neon");
  console.error("dashboard (\"Connection string\" button) rather than typing it by hand.\n");
  process.exit(1);
}

let parsedUrl;
try {
  parsedUrl = new URL(process.env.DATABASE_URL);
} catch {
  console.error("\n[CONFIG ERROR] DATABASE_URL in backend/.env is not a valid URL.");
  console.error("It should look like: postgresql://user:password@host.neon.tech/dbname?sslmode=require");
  console.error("Copy it fresh from the Neon dashboard's \"Connection string\" button.\n");
  process.exit(1);
}
if (!parsedUrl.password) {
  console.error("\n[CONFIG ERROR] DATABASE_URL in backend/.env has no password segment.");
  console.error("Copy the connection string fresh from the Neon dashboard — if you typed it by hand");
  console.error("and the password contains characters like @ # % & : / ?, those need URL-encoding.\n");
  process.exit(1);
}

// Neon (and most managed Postgres hosts) require SSL always — not just in
// production. Detect this from the connection string so local development
// against Neon works too, while still allowing a plain local Postgres
// (no SSL) to work if that's what NODE_ENV=development points at.
const needsSsl =
  process.env.NODE_ENV === "production" ||
  /sslmode=require|neon\.tech|render\.com|railway\.app|supabase\.co/.test(process.env.DATABASE_URL || "");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("Unexpected database error:", err);
});

const COLD_START_ERROR_CODES = new Set(["ECONNREFUSED", "ETIMEDOUT", "57P01", "08006", "08001"]);

const query = async (text, params, _retrying = false) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === "development") {
      console.log(`[DB] ${duration}ms — ${text.slice(0, 80)}`);
    }
    return res;
  } catch (err) {
    // Free-tier Postgres (Neon) suspends its compute after a few minutes of
    // no traffic. The first query after that wake-up can fail with a
    // connection-refused/timeout style error even though the DB is fine a
    // second later. One bounded retry absorbs that cold start instead of
    // surfacing it to the user as "Internal Server Error" on an otherwise
    // completely normal request.
    if (!_retrying && COLD_START_ERROR_CODES.has(err.code)) {
      console.error(`[DB] cold-start-style error (${err.code}) — retrying once in 1.5s...`);
      await new Promise((r) => setTimeout(r, 1500));
      return query(text, params, true);
    }
    console.error("[DB ERROR]", err.message);
    throw err;
  }
};

// Neon's free tier suspends its compute endpoint when idle — including the
// few seconds right after the previous script (e.g. migrate) disconnected.
// The very next connection attempt can hit a "waking up" endpoint and time
// out. This retries a few times with a growing delay before giving up, so
// running "migrate" then "seed" back-to-back doesn't require a manual retry.
const waitForDb = async (attempts = 12, initialDelayMs = 4000) => {
  let delayMs = initialDelayMs;
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`[DB] Not reachable yet (attempt ${i}/${attempts}) — waiting ${Math.round(delayMs / 1000)}s for it to wake up...`);
      await new Promise((r) => setTimeout(r, delayMs));
      delayMs = Math.min(delayMs * 1.3, 10000); // back off gradually, cap at 10s per wait
    }
  }
};

module.exports = { pool, query, waitForDb };
