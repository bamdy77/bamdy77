// utils/backup.js - automatic and on-demand database backups.
//
// A backup is every table of the database exported as JSON, gzip-compressed
// and encrypted (AES-256-GCM, key from DATA_ENCRYPTION_KEY / JWT_SECRET),
// then stored OUTSIDE the database as a private Cloudinary file. The last
// KEEP backups are kept; older ones are deleted automatically.
//
// When does it run? Render's free plan puts the server to sleep when nobody
// uses it, so a fixed "2 AM" timer cannot be relied on. Instead the server
// checks every hour (and right after it wakes up) and makes a backup
// whenever the newest one is older than 24 hours.
//
// Restoring is deliberately NOT a button: see backend/scripts/restore-backup.js.
const crypto = require("crypto");
const zlib = require("zlib");
const { promisify } = require("util");
const { query } = require("../db/db");

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const KEEP = 14;
const MAGIC = Buffer.from("MKBK1"); // file signature + format version

function key() {
  const secret = process.env.DATA_ENCRYPTION_KEY || process.env.JWT_SECRET || "";
  return crypto.createHash("sha256").update(`mikumbi-backup-key:${secret}`).digest();
}

function encrypt(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), enc]);
}

function decrypt(file) {
  if (!file.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Not a Mikumbi backup file.");
  const iv = file.subarray(5, 17), tag = file.subarray(17, 33), data = file.subarray(33);
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]);
}

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS db_backups (
      id SERIAL PRIMARY KEY,
      storage VARCHAR(20) NOT NULL,
      public_id TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      table_count INTEGER NOT NULL,
      row_count INTEGER NOT NULL,
      trigger VARCHAR(20) NOT NULL,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
}

// ── Storage: Cloudinary (private) or, for local testing only, a folder ──
function storage() {
  if (process.env.BACKUP_LOCAL_DIR) return "local";
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  return CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET ? "cloudinary" : null;
}

async function putFile(name, buf) {
  const kind = storage();
  if (kind === "local") {
    const fs = require("fs"), path = require("path");
    fs.mkdirSync(process.env.BACKUP_LOCAL_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.BACKUP_LOCAL_DIR, name), buf);
    return { storage: "local", public_id: name };
  }
  if (kind === "cloudinary") {
    const { uploadBufferToCloudinary } = require("../middleware/upload");
    const up = await uploadBufferToCloudinary(buf, { folder: "mikumbi/backups", resource_type: "raw", type: "authenticated", public_id: name });
    return { storage: "cloudinary", public_id: up.public_id };
  }
  throw new Error("Backup storage is not configured (Cloudinary settings are missing).");
}

async function getFile(row) {
  if (row.storage === "local") {
    return require("fs").readFileSync(require("path").join(process.env.BACKUP_LOCAL_DIR, row.public_id));
  }
  const cloudinary = require("cloudinary").v2;
  const url = cloudinary.utils.private_download_url(row.public_id, "", { resource_type: "raw", type: "authenticated", expires_at: Math.floor(Date.now() / 1000) + 300 });
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Backup file could not be fetched from storage (HTTP ${r.status}).`);
  return Buffer.from(await r.arrayBuffer());
}

async function deleteFile(row) {
  if (row.storage === "local") {
    try { require("fs").unlinkSync(require("path").join(process.env.BACKUP_LOCAL_DIR, row.public_id)); } catch { /* already gone */ }
    return;
  }
  await require("../middleware/upload").deleteCloudinaryAsset(row.public_id, "raw");
}

// ── Export ────────────────────────────────────────────────────────────
async function exportDatabase() {
  const { rows: tables } = await query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
  const data = {};
  let rowCount = 0;
  const { rows: cols } = await query(
    `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`);
  const q = (n) => `"${String(n).replace(/"/g, '""')}"`;
  for (const { table_name: t } of tables) {
    // DATE columns are exported as plain 'YYYY-MM-DD' text: as JS Dates they
    // would shift a day back (local midnight in UTC+3 is the previous day in UTC).
    const list = cols.filter((c) => c.table_name === t)
      .map((c) => (c.data_type === "date" ? `to_char(${q(c.column_name)}, 'YYYY-MM-DD') AS ${q(c.column_name)}`
        // Timestamps as exact text (JS Dates would drop microseconds).
        : /^(timestamp|time)/.test(c.data_type) ? `${q(c.column_name)}::text AS ${q(c.column_name)}`
        : q(c.column_name)));
    const { rows } = await query(`SELECT ${list.join(", ")} FROM ${q(t)}`);
    data[t] = rows;
    rowCount += rows.length;
  }
  return { format: "mikumbi-backup", version: 1, created_at: new Date().toISOString(), tables: data, tableCount: tables.length, rowCount };
}

let running = null;
async function createBackup({ trigger = "auto", userId = null } = {}) {
  if (running) return running; // never two at once
  running = (async () => {
    await ensureTable();
    const dump = await exportDatabase();
    const { tableCount, rowCount } = dump;
    delete dump.tableCount; delete dump.rowCount;
    const file = encrypt(await gzip(Buffer.from(JSON.stringify(dump))));
    const stamp = dump.created_at.replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
    const stored = await putFile(`backup-${stamp}.mkbk`, file);
    const { rows } = await query(
      `INSERT INTO db_backups (storage, public_id, file_size, table_count, row_count, trigger, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [stored.storage, stored.public_id, file.length, tableCount, rowCount, trigger, userId]);
    await pruneOld();
    console.log(`[BACKUP] ${trigger} backup saved: ${tableCount} tables, ${rowCount} rows, ${file.length} bytes.`);
    return rows[0];
  })();
  try { return await running; } finally { running = null; }
}

async function pruneOld() {
  const { rows } = await query(`SELECT * FROM db_backups ORDER BY created_at DESC OFFSET $1`, [KEEP]);
  for (const r of rows) {
    await deleteFile(r).catch(() => {});
    await query(`DELETE FROM db_backups WHERE id = $1`, [r.id]);
  }
}

async function listBackups() {
  await ensureTable();
  const { rows } = await query(`SELECT id, file_size, table_count, row_count, trigger, created_at FROM db_backups ORDER BY created_at DESC`);
  return rows;
}

// Decrypted + decompressed JSON (what the Head Master downloads).
async function readBackup(id) {
  await ensureTable();
  const { rows } = await query(`SELECT * FROM db_backups WHERE id = $1`, [id]);
  if (!rows.length) return null;
  const json = await gunzip(decrypt(await getFile(rows[0])));
  return { row: rows[0], json };
}

// Hourly check (and once shortly after start-up): back up if the newest
// backup is older than 24 hours.
function startAutoBackups() {
  if (!storage()) {
    console.log("[BACKUP] automatic backups are OFF - Cloudinary settings are missing.");
    return;
  }
  const check = async () => {
    try {
      await ensureTable();
      const { rows } = await query(`SELECT MAX(created_at) AS last FROM db_backups`);
      const last = rows[0].last ? new Date(rows[0].last).getTime() : 0;
      if (Date.now() - last > 24 * 60 * 60 * 1000) await createBackup({ trigger: "auto" });
    } catch (e) {
      console.error("[BACKUP] automatic backup failed:", e.message);
    }
  };
  setTimeout(check, 60 * 1000);
  setInterval(check, 60 * 60 * 1000).unref();
}

module.exports = { createBackup, listBackups, readBackup, startAutoBackups, decrypt, KEEP };
