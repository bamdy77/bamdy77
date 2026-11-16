// Display-only translation of values stored in the database as identifiers
// (roles, forms, gender, months). The stored value is never changed: filters,
// comparisons and API calls keep using "Form II", "second_master", "Male" ...
// Only what the person sees changes. Unknown values are shown as they are.
import { translate, STRINGS } from "./index";

const via = (prefix) => (lang, value) => {
  if (value == null || value === "") return "";
  const key = `${prefix}.${value}`;
  return STRINGS[key] ? translate(lang, key) : String(value);
};
export const roleLabel = via("role");
export const formLabel = via("form");
export const formShort = via("form.short");
export const genderLabel = via("gender");
export const genderLong = via("gender.long");
export const employmentLabel = via("employment");

export const monthName = (lang, monthIndex0) => translate(lang, `month.${monthIndex0 + 1}`);
export const dayName = (lang, dayIndex0) => translate(lang, `day.${dayIndex0}`);

// "12 November 2026" / "12 Novemba 2026" in the school's time zone.
export function formatDate(lang, value, { withTime = false, withDay = false } = {}) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Dar_es_Salaam", year: "numeric", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d).map((p) => [p.type, p.value]));
  const dayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  let s = `${Number(parts.day)} ${monthName(lang, Number(parts.month) - 1)} ${parts.year}`;
  if (withDay) s = `${dayName(lang, dayIdx)}, ${s}`;
  if (withTime) s += `, ${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
  return s;
}
