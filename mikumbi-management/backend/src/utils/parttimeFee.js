// utils/parttimeFee.js - the Part-Time Teachers monthly amount.
//
// The amount is no longer fixed in the code: the Head Master / Second
// Master set it in Contributions Management. Every change is kept as a
// rate that starts in a given month (parttime_fee_rates), so months before
// the change keep the amount that applied then, and receipts/history stay
// correct.
const { query } = require("../db/db");

const DEFAULT_FEE = 2000;
const MIN_FEE = 100;
const MAX_FEE = 1000000;

let cache = null; // [{ amount, effective_year, effective_month }] newest first
let cacheAt = 0;

async function rates() {
  if (cache && Date.now() - cacheAt < 60000) return cache;
  try {
    const { rows } = await query(
      `SELECT id, amount, effective_year, effective_month, created_at, created_by_name
       FROM parttime_fee_rates ORDER BY effective_year DESC, effective_month DESC, id DESC`);
    cache = rows.map((r) => ({ ...r, amount: Number(r.amount) }));
  } catch (err) {
    console.error("Part-time fee rates could not be read:", err.message);
    cache = [];
  }
  cacheAt = Date.now();
  return cache;
}
const clearCache = () => { cache = null; };

// Amount due for one (year, month).
function feeFromRates(list, year, month) {
  const key = Number(year) * 100 + Number(month);
  const r = list.find((x) => x.effective_year * 100 + x.effective_month <= key);
  return r ? r.amount : DEFAULT_FEE;
}
async function feeFor(year, month) { return feeFromRates(await rates(), year, month); }

// The current year/month in Tanzania (the server may run in another zone).
function nowYearMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam", year: "numeric", month: "numeric" }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { year: get("year"), month: get("month") };
}

module.exports = { DEFAULT_FEE, MIN_FEE, MAX_FEE, rates, feeFor, feeFromRates, clearCache, nowYearMonth };
