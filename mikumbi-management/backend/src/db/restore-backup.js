// db/restore-backup.js - put a backup back into the database.
//
// !! This REPLACES the data in every table contained in the backup. !!
// Use it only when data has really been lost or damaged, and ideally on a
// fresh/empty database first to check the backup.
//
// Usage (from the backend folder):
//   node src/db/restore-backup.js <file> [--yes]
// <file> is either a file downloaded from the Backup page (.json.gz) or a
// raw stored backup (.mkbk, needs the same DATA_ENCRYPTION_KEY/JWT_SECRET).
// DATABASE_URL decides WHICH database is overwritten. Without --yes it only
// shows what it would do.
require("dotenv").config();
const fs = require("fs");
const zlib = require("zlib");
const { Pool } = require("pg");
const { decrypt } = require("../utils/backup");

const quote = (n) => `"${String(n).replace(/"/g, '""')}"`;

async function main() {
  const file = process.argv[2];
  const yes = process.argv.includes("--yes");
  if (!file) { console.log("Usage: node src/db/restore-backup.js <backup file> [--yes]"); process.exit(1); }
  let buf = fs.readFileSync(file);
  if (buf.subarray(0, 5).toString() === "MKBK1") buf = zlib.gunzipSync(decrypt(buf));
  else if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const dump = JSON.parse(buf.toString("utf8"));
  if (dump.format !== "mikumbi-backup") throw new Error("This is not a Mikumbi backup file.");

  const url = process.env.DATABASE_URL || "";
  const pool = new Pool({ connectionString: url, ssl: /sslmode=require|neon\.tech|render\.com/.test(url) ? { rejectUnauthorized: false } : false });
  const db = await pool.connect();
  try {
    const { rows: existing } = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`);
    const have = new Set(existing.map((r) => r.table_name));
    const tables = Object.keys(dump.tables).filter((t) => have.has(t));
    const skipped = Object.keys(dump.tables).filter((t) => !have.has(t));
    const total = tables.reduce((n, t) => n + dump.tables[t].length, 0);
    console.log(`Backup from ${dump.created_at}: ${tables.length} tables, ${total} rows.`);
    if (skipped.length) console.log(`Tables not in this database (run migrations first): ${skipped.join(", ")}`);
    if (!yes) { console.log("\nNothing changed. Re-run with --yes to REPLACE the data in these tables."); return; }

    // Parents before children, from the foreign keys.
    const { rows: fks } = await db.query(`
      SELECT tc.table_name AS child, ccu.table_name AS parent
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`);
    const order = []; const seen = new Set();
    const visit = (t, stack = new Set()) => {
      if (seen.has(t) || stack.has(t)) return;
      stack.add(t);
      fks.filter((f) => f.child === t && f.parent !== t && tables.includes(f.parent)).forEach((f) => visit(f.parent, stack));
      seen.add(t); order.push(t);
    };
    tables.forEach((t) => visit(t));

    const { rows: cols } = await db.query(`
      SELECT table_name, column_name, data_type, is_generated FROM information_schema.columns WHERE table_schema='public'`);

    await db.query("BEGIN");
    // Empty the tables being restored (and anything that points at them).
    await db.query(`TRUNCATE ${order.map(quote).join(", ")} RESTART IDENTITY CASCADE`);
    for (const t of order) {
      const meta = cols.filter((c) => c.table_name === t && c.is_generated !== "ALWAYS");
      const names = meta.map((c) => c.column_name);
      const json = new Set(meta.filter((c) => c.data_type === "json" || c.data_type === "jsonb").map((c) => c.column_name));
      for (const row of dump.tables[t]) {
        const use = names.filter((n) => n in row);
        const vals = use.map((n) => (json.has(n) && row[n] !== null ? JSON.stringify(row[n]) : row[n]));
        await db.query(`INSERT INTO ${quote(t)} (${use.map(quote).join(", ")}) VALUES (${use.map((_, i) => `$${i + 1}`).join(", ")})`, vals);
      }
      // Keep SERIAL counters ahead of the restored ids.
      const { rows: seqs } = await db.query(`
        SELECT a.attname AS col, pg_get_serial_sequence($1, a.attname) AS seq
        FROM pg_attribute a WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped`, [quote(t)]);
      for (const s of seqs.filter((x) => x.seq)) {
        await db.query(`SELECT setval($1, COALESCE((SELECT MAX(${quote(s.col)}) FROM ${quote(t)}), 0) + 1, false)`, [s.seq]);
      }
      console.log(`  ${t}: ${dump.tables[t].length}`);
    }
    await db.query("COMMIT");
    console.log("\nRestore finished.");
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    console.error("\nRestore FAILED - nothing was changed:", e.message);
    process.exitCode = 1;
  } finally {
    db.release(); await pool.end();
  }
}
main();
