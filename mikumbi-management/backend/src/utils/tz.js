// Tanzania (East Africa Time, UTC+3, no DST) time helpers.
// Postgres TIMESTAMPTZ columns already store an absolute instant (UTC internally),
// so we only need to *format* it for Tanzania when it leaves the database.

const TZ = "Africa/Dar_es_Salaam";

// Formats a JS Date / ISO string as "YYYY-MM-DD HH:mm" in Tanzania local time.
function formatTZ(value) {
  if (!value) return null;
  const d = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(d).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

// A Postgres SQL snippet that converts a timestamptz column to Tanzania local time as text.
// Usage: query(`SELECT ${tzColumn('event_at')} AS event_at_tz FROM student_history`)
function tzColumn(column, alias) {
  return `to_char(${column} AT TIME ZONE 'Africa/Dar_es_Salaam', 'YYYY-MM-DD HH24:MI:SS')${alias ? ` AS ${alias}` : ""}`;
}

// Today's date (YYYY-MM-DD) in Tanzania local time. Use this instead of
// `new Date().toISOString().slice(0,10)` for any "default to today" date
// field — the ISOString version is UTC and rolls over to the next day
// 3 hours early (i.e. it still shows *yesterday* between 00:00-02:59 EAT).
function todayTZ() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Formats a plain DATE value (e.g. dob, admission_date, charge_date) as
// 'YYYY-MM-DD' — safely, whether it arrives as the plain string Postgres
// sends (once db.js's date type-parser override is in place) or as a
// legacy JS Date object.
//
// IMPORTANT: never do `dateColumn.toISOString().slice(0,10)`. node-postgres
// (before the type-parser override) builds a DATE column into a JS Date at
// LOCAL midnight (this process runs with TZ=Africa/Dar_es_Salaam, set at the
// top of index.js). `.toISOString()` always converts to UTC, and Tanzania
// midnight is 21:00 UTC the PREVIOUS day — so that pattern shows the wrong
// (one day earlier) date on every single read, not just near midnight.
// Using the LOCAL getters below (or the plain string, once available)
// avoids that entirely.
function dateOnly(value) {
  if (!value) return value;
  if (typeof value === "string") return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

module.exports = { TZ, formatTZ, tzColumn, todayTZ, dateOnly };
