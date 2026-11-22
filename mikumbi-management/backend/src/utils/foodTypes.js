// utils/foodTypes.js - the food contribution types (MAHINDI, MCHELE ...).
// Kept in the food_types table so the Head Master / Second Master can add,
// rename, reorder and hide them; cached for a minute because every Manage
// Foods screen and PDF reads the list.
const { query } = require("../db/db");

// Used only if the table cannot be read (e.g. before the first migration).
const FALLBACK = [
  { key: "maize", label: "MAHINDI", unit: "KG" }, { key: "rice", label: "MCHELE", unit: "KG" },
  { key: "cooking_oil", label: "MAFUTA YA KUPIKIA", unit: "LITRES" }, { key: "salt", label: "CHUMVI", unit: "KG" },
  { key: "njugu", label: "NJUGU", unit: "KG" }, { key: "maharage", label: "MAHARAGE", unit: "KG" },
  { key: "mbaazi", label: "MBAAZI", unit: "KG" }, { key: "kunde", label: "KUNDE", unit: "KG" },
].map((t, i) => ({ ...t, id: null, sort_order: i + 1, is_active: true, required_qty: null }));

let cache = null;
let cacheAt = 0;

// Every type, hidden ones included (old entries still need their label).
async function allFoodTypes() {
  if (cache && Date.now() - cacheAt < 60000) return cache;
  try {
    const { rows } = await query(`SELECT id, key, label, unit, sort_order, is_active, required_qty::float AS required_qty FROM food_types ORDER BY sort_order, id`);
    cache = rows.length ? rows : FALLBACK;
  } catch (err) {
    console.error("Food types could not be read:", err.message);
    cache = FALLBACK;
  }
  cacheAt = Date.now();
  return cache;
}
// The types offered for new contributions and shown as columns.
async function activeFoodTypes() { return (await allFoodTypes()).filter((t) => t.is_active); }
const clearFoodTypesCache = () => { cache = null; };
const unitShort = (u) => (u === "LITRES" ? "L" : u === "PIECES" ? "pcs" : "kg");

module.exports = { allFoodTypes, activeFoodTypes, clearFoodTypesCache, unitShort };
