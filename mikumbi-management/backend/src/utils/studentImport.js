// utils/studentImport.js — Bulk Student Registration (CSV / Excel upload).
//
// Two-step flow, deliberately: a preview (parse + validate, nothing saved)
// followed by a separate commit (only rows the Head Master/Second Master
// actually approved get inserted). This file holds the shared parsing and
// validation logic both steps use, so the rules can never drift apart
// between "what the preview showed" and "what actually gets saved".
//
// Only .csv, .xlsx, and .xls are supported. PDF is deliberately NOT
// supported here — a PDF has no reliable, structured "this cell is the
// student's Gender" information the way a spreadsheet does, so parsing one
// would mean guessing column positions from plain text, which is exactly
// the kind of silent data-corruption risk this feature exists to avoid on
// a system that's already live. Head Master/Second Master should export or
// re-save any PDF roster as CSV/Excel first (every spreadsheet app and
// most PDF table tools can do this) — that keeps every row bulletproof.
const ExcelJS = require("exceljs");
const { Readable } = require("stream");

const FORM_VALUES = ["Form I", "Form II", "Form III", "Form IV"];
const STATUS_VALUES = ["Active", "Inactive", "Transferred", "Completed", "Graduated"];

// A row in the uploaded file can spell each column heading in several
// reasonable ways — normalized (lowercase, punctuation stripped, extra
// spaces collapsed) before matching against this table.
const HEADER_ALIASES = {
  "prem no": "prem_no", "premno": "prem_no", "prem number": "prem_no",
  "reg no": "reg_no", "regno": "reg_no", "reg number": "reg_no", "registration number": "reg_no", "registration no": "reg_no",
  "first name": "first_name", "firstname": "first_name", "given name": "first_name", "jina la kwanza": "first_name",
  "middle name": "middle_name", "middlename": "middle_name", "jina la kati": "middle_name",
  "last name": "last_name", "lastname": "last_name", "surname": "last_name", "jina la ukoo": "last_name", "jina la mwisho": "last_name",
  "gender": "gender", "sex": "gender", "jinsia": "gender",
  "dob": "dob", "date of birth": "dob", "birth date": "dob", "birthdate": "dob", "tarehe ya kuzaliwa": "dob",
  "form": "form", "class": "form", "darasa": "form",
  "district": "district", "wilaya": "district",
  "admission date": "admission_date", "date of admission": "admission_date", "admissiondate": "admission_date", "tarehe ya kujiunga": "admission_date",
  "status": "status", "hali": "status",
  "parent name": "parent_name", "guardian name": "parent_name", "parent/guardian name": "parent_name", "jina la mzazi": "parent_name", "jina la mzazi/mlezi": "parent_name",
  "parent phone": "parent_phone", "guardian phone": "parent_phone", "phone": "parent_phone", "phone number": "parent_phone", "namba ya simu ya mzazi": "parent_phone",
  "village": "village", "kijiji": "village",
  "ward": "ward", "kata": "ward",
};

const FORM_ALIASES = {
  "form i": "Form I", "form 1": "Form I", "1": "Form I", "i": "Form I",
  "form ii": "Form II", "form 2": "Form II", "2": "Form II", "ii": "Form II",
  "form iii": "Form III", "form 3": "Form III", "3": "Form III", "iii": "Form III",
  "form iv": "Form IV", "form 4": "Form IV", "4": "Form IV", "iv": "Form IV",
};

const GENDER_ALIASES = { m: "Male", male: "Male", f: "Female", female: "Female" };

const STATUS_ALIASES = STATUS_VALUES.reduce((acc, s) => { acc[s.toLowerCase()] = s; return acc; }, {});

// Hard ceiling on rows per upload — protects the server from an
// accidental (or malicious) enormous file, and keeps the preview response
// small enough to render comfortably in the browser.
const MAX_IMPORT_ROWS = 1000;

const normHeader = (h) => String(h ?? "").trim().toLowerCase().replace(/[.]/g, "").replace(/\s+/g, " ");

// Reads an uploaded CSV or XLSX/XLS buffer into raw row objects keyed by
// OUR internal field names — columns whose heading doesn't match anything
// in HEADER_ALIASES are simply ignored (not an error — a roster export
// often carries extra columns we don't use, e.g. "Age").
const parseRosterFile = async (buffer, originalname) => {
  const ext = (originalname || "").split(".").pop().toLowerCase();
  const workbook = new ExcelJS.Workbook();
  try {
    if (ext === "csv") {
      // Disable ExcelJS's default CSV type-coercion (it silently turns any
      // numeric-looking cell into a JS Number) — that would strip the
      // leading zero off a phone number ("0712345678" -> 712345678) or a
      // numeric-looking Reg./Prem. No.. Every value comes through as its
      // original text instead; normalizeStudentRow() below handles
      // whatever specific parsing each field actually needs.
      await workbook.csv.read(Readable.from(buffer), { map: (datum) => (datum === "" ? null : datum) });
    } else {
      await workbook.xlsx.load(buffer);
    }
  } catch (e) {
    throw new Error("Could not read this file — it may be corrupted, password-protected, or not a real CSV/Excel file.");
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 1) throw new Error("The uploaded file appears to be empty.");

  const headerRow = sheet.getRow(1);
  const colMap = {}; // column index -> our field key
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = HEADER_ALIASES[normHeader(cell.value)];
    if (key) colMap[colNumber] = key;
  });
  if (!Object.keys(colMap).length) {
    throw new Error("Could not recognize any column headers on the first row. Expected headers like First Name, Last Name, Gender, and Form.");
  }
  if (!Object.values(colMap).includes("first_name") || !Object.values(colMap).includes("last_name")) {
    throw new Error("The file must have at least a \"First Name\" and \"Last Name\" column.");
  }

  const rows = [];
  const totalRows = sheet.rowCount;
  for (let r = 2; r <= totalRows; r++) {
    const row = sheet.getRow(r);
    if (!row || row.cellCount === 0) continue;
    const raw = {};
    let hasAny = false;
    for (const [colNumber, key] of Object.entries(colMap)) {
      const cell = row.getCell(Number(colNumber));
      let val = cell.value;
      if (val && typeof val === "object" && "text" in val) val = val.text; // rich-text cell
      if (val && typeof val === "object" && "result" in val) val = val.result; // formula cell
      if (val instanceof Date) val = val.toISOString().slice(0, 10); // Excel date serial -> YYYY-MM-DD
      val = val == null ? "" : String(val).trim();
      if (val) hasAny = true;
      raw[key] = val;
    }
    if (!hasAny) continue; // fully blank row (common at the end of a sheet) — skip silently
    rows.push({ rowNumber: r, raw });
  }
  return rows;
};

const normalizeGender = (v) => {
  if (!v) return { value: null, error: null };
  const hit = GENDER_ALIASES[String(v).trim().toLowerCase()];
  return hit ? { value: hit, error: null } : { value: null, error: `Unrecognized gender "${v}" — use Male or Female.` };
};

const normalizeForm = (v) => {
  if (!v) return { value: null, error: null };
  const hit = FORM_ALIASES[String(v).trim().toLowerCase().replace(/\s+/g, " ")];
  return hit ? { value: hit, error: null } : { value: null, error: `Unrecognized form "${v}" — use Form I, Form II, Form III, or Form IV.` };
};

const normalizeStatus = (v) => {
  if (!v) return { value: null, error: null };
  const hit = STATUS_ALIASES[String(v).trim().toLowerCase()];
  return hit ? { value: hit, error: null } : { value: null, error: `Unrecognized status "${v}".` };
};

// Turns one raw row (strings straight off the sheet) into the exact shape
// createStudent's INSERT expects, plus a list of any validation errors.
// Same required fields, same rules as adding a student one at a time —
// bulk import never gets a looser bar than the manual form does.
const normalizeStudentRow = (raw = {}) => {
  const errors = [];
  const first_name = (raw.first_name || "").trim();
  const middle_name = (raw.middle_name || "").trim();
  const last_name = (raw.last_name || "").trim();

  const genderRes = normalizeGender(raw.gender);
  if (genderRes.error) errors.push(genderRes.error);
  const formRes = normalizeForm(raw.form);
  if (formRes.error) errors.push(formRes.error);
  const statusRes = normalizeStatus(raw.status);
  if (statusRes.error) errors.push(statusRes.error);

  if (!first_name) errors.push("First name is required.");
  if (!last_name) errors.push("Last name is required.");
  if (!genderRes.value) errors.push("Gender is required.");
  if (!formRes.value) errors.push("Form is required.");

  const parsed = {
    prem_no: (raw.prem_no || "").trim() || null,
    reg_no: (raw.reg_no || "").trim() || null,
    first_name, middle_name: middle_name || null, last_name,
    gender: genderRes.value,
    dob: (raw.dob || "").trim() || null,
    form: formRes.value,
    district: (raw.district || "").trim() || null,
    admission_date: (raw.admission_date || "").trim() || null,
    status: statusRes.value || "Active",
    parent_name: (raw.parent_name || "").trim() || null,
    parent_phone: (raw.parent_phone || "").trim() || null,
    village: (raw.village || "").trim() || null,
    ward: (raw.ward || "").trim() || null,
  };

  return { parsed, errors };
};

// Same "same form, same full name" key used everywhere else in this app's
// duplicate-student check (studentController.createStudent) — kept in sync
// on purpose so bulk import can never accept something the one-at-a-time
// form would reject, or vice versa.
const fullNameKey = (s) =>
  [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ").trim().toLowerCase().replace(/\s+/g, " ");

module.exports = {
  FORM_VALUES, STATUS_VALUES, MAX_IMPORT_ROWS,
  parseRosterFile, normalizeStudentRow, fullNameKey,
};
