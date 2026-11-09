// db/reset.js — DANGER: drops every table/view/function in the database and
// recreates an empty "public" schema. Use this when the database is stuck
// in a confusing half-migrated state (e.g. from earlier test runs before
// bugs were fixed) and you just want a guaranteed-clean slate to migrate
// onto. Safe to run any number of times — it's meant for development/setup,
// not for a school that already has real student data in production.
require("dotenv").config();
const { query, pool, waitForDb } = require("./db");

async function reset() {
  console.log("Checking database connection...");
  await waitForDb();
  console.log("Dropping and recreating the public schema (this deletes ALL data)...");
  await query(`DROP SCHEMA public CASCADE;`);
  await query(`CREATE SCHEMA public;`);
  await query(`GRANT ALL ON SCHEMA public TO public;`);
  console.log("Done — database is now empty. Run 'npm run db:migrate' next.");
  await pool.end();
  process.exit(0);
}

reset().catch((err) => {
  console.error("\nReset failed:", err.message);
  console.error("\nIf you just waited through several 'Not reachable yet' retries and it STILL failed,");
  console.error("this is probably not a cold-start issue anymore — please check:");
  console.error("  1. Open your Neon dashboard (neon.tech) and confirm the project shows as Active");
  console.error("     (not paused/deleted) — Neon free projects can be auto-paused after long inactivity");
  console.error("     and may need you to click to wake them up from the dashboard itself.");
  console.error("  2. Re-copy DATABASE_URL fresh from Neon's \"Connection string\" button into backend/.env —");
  console.error("     a stale or hand-typed URL (especially a password with @ # % & : / ? in it) is the");
  console.error("     most common cause of a connection that never succeeds no matter how long you wait.");
  console.error("  3. Make sure you picked the \"Pooled connection\" string, and that it ends with ?sslmode=require.");
  process.exit(1);
});
