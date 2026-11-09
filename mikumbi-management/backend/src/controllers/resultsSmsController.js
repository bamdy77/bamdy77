// controllers/resultsSmsController.js - "Send Results to Parents (SMS)".
//
// Lets the Head Master / Second Master / Academic Master send each
// student's compiled exam result straight to their own registered parent
// number (matched via sms_parent_contacts.student_id - the SAME auto-synced
// table Communications → SMS Service already uses, so a result can never be
// sent to the wrong parent). Every parent gets a message personalized with
// THEIR OWN child's name and marks, not one shared broadcast message.
//
// Two-step flow, matching the rest of this system's "review before you
// commit" pattern (see Parent Report PDF, SMS Service itself):
//   1. previewResultsSms - builds the exact per-student message text so the
//      sender can read it before anything goes out, and flags any student
//      whose parent has no phone on file yet.
//   2. sendResultsSms    - actually sends, to "all matched parents" or a
//      specific subset the sender picked, then logs one row to the SAME
//      sms_log table/History screen used everywhere else in Communications.
const { query } = require("../db/db");
const { sendOne, sendBulkPersonalized, formatPhone } = require("../utils/nextsms");
const androidGateway = require("../utils/androidSmsGateway");

const SCHOOL_NAME = "SHULE YA SEKONDARI MIKUMBI";
const SCHOOL_NAME_SHORT = "MIKUMBI SS";

// Standard Kiswahili calendar month names ("Agosti" for August), used to
// build {month_name_sw} for the short default template below - the stored
// `month` value on academic_periods is always one of the English names.
const MONTH_NAME_SW = {
  January: "Januari", February: "Februari", March: "Machi", April: "Aprili",
  May: "Mei", June: "Juni", July: "Julai", August: "Agosti",
  September: "Septemba", October: "Oktoba", November: "Novemba", December: "Desemba",
};
function monthNameSw(monthEn) {
  return MONTH_NAME_SW[monthEn] || String(monthEn || "");
}

// Tanzanian official-document style month names ("Mwezi wa Nane" for
// August), used to build {month_sw} - the stored `month` value on
// academic_periods is always one of the English names below.
const MONTH_SW = {
  January: "MWEZI WA KWANZA", February: "MWEZI WA PILI", March: "MWEZI WA TATU",
  April: "MWEZI WA NNE", May: "MWEZI WA TANO", June: "MWEZI WA SITA",
  July: "MWEZI WA SABA", August: "MWEZI WA NANE", September: "MWEZI WA TISA",
  October: "MWEZI WA KUMI", November: "MWEZI WA KUMI NA MOJA", December: "MWEZI WA KUMI NA MBILI",
};
function monthSw(monthEn) {
  return MONTH_SW[monthEn] || String(monthEn || "").toUpperCase();
}

// Swahili translation for every option in the frontend's EXAM_TYPES list
// (ResultsManagement.jsx). Falls back to a generic "MTIHANI WA <...>" for
// any value not in this list, so a future new exam type never breaks the
// message - it just won't have a polished translation yet.
const EXAM_TYPE_SW = {
  "Monthly Test": "MTIHANI WA MWEZI",
  "Mid-Term Examination": "MTIHANI WA KATI WA MHULA",
  "Terminal Examination": "MTIHANI WA KUFUNGA MHULA",
  "Mock Examination": "MTIHANI WA MAJARIBIO",
  "District Mock Examination": "MTIHANI WA MAJARIBIO WA WILAYA",
  "Annual Examination": "MTIHANI WA MWAKA",
  "School Examination": "MTIHANI WA SHULE",
  "Fitness Examination": "MTIHANI WA UTAYARI",
  "Good Neighborliness Examination Mikumbi & Mkoma": "MTIHANI WA UJIRANI MWEMA MIKUMBI NA MKOMA",
  "Good Neighborliness Examination Mikumbi & Chihangu": "MTIHANI WA UJIRANI MWEMA MIKUMBI NA CHIHANGU",
  "Good Neighborliness Examination Mikumbi & Mnyambe": "MTIHANI WA UJIRANI MWEMA MIKUMBI NA MNYAMBE",
};
function examTypeSw(examType) {
  return EXAM_TYPE_SW[examType] || `MTIHANI WA ${String(examType || "").toUpperCase()}`;
}

// "Form III" → "Kidato III" - used only by the long Android Gateway
// template, which otherwise reads like the school's old paper report.
function formSw(form) {
  return String(form || "").replace(/^Form\b/i, "Kidato");
}

// The paper report's "JINSIA" column uses a single letter matching the
// English word already stored on the student record ("Female"→"F",
// "Male"→"M") - not a Kiswahili word, so this is intentionally NOT
// "K"/"M" for Kike/Kiume.
function genderLetter(gender) {
  return String(gender || "").trim().toLowerCase().startsWith("f") ? "F" : "M";
}

const GRADE_COMMENT_SW = { A: "Vizuri sana", B: "Vizuri", C: "Wastani", D: "Dhaifu", F: "Mbaya sana" };
function gradeCommentSw(grade) {
  return GRADE_COMMENT_SW[grade] || "-";
}

// Placeholder tokens the frontend offers as "insert" buttons, and that
// renderTemplate() below actually substitutes. Keeping this list and the
// substitution in one place means the preview and the real send can never
// drift apart from each other.
const PLACEHOLDER_DEFS = [
  { token: "{school_name}", label: "School Name" },
  { token: "{school_short}", label: "School Name (Short)" },
  { token: "{student_name}", label: "Student Name" },
  { token: "{parent_name}", label: "Parent / Guardian Name" },
  { token: "{reg_no}", label: "Registration Number" },
  { token: "{form}", label: "Form / Class" },
  { token: "{exam_type}", label: "Exam Type" },
  { token: "{exam_type_sw}", label: "Exam Type (Kiswahili)" },
  { token: "{month}", label: "Month" },
  { token: "{month_sw}", label: "Month (Kiswahili - Mwezi wa...)" },
  { token: "{month_name_sw}", label: "Month (Kiswahili - Agosti)" },
  { token: "{year}", label: "Year" },
  { token: "{subjects_breakdown}", label: "Subjects & Marks" },
  { token: "{total_marks}", label: "Total Marks" },
  { token: "{subjects_sat}", label: "Subjects Sat" },
  { token: "{average}", label: "Average (Wastani)" },
  { token: "{division}", label: "Division" },
  { token: "{avg_grade}", label: "Average Grade" },
  { token: "{points}", label: "Points" },
  { token: "{position}", label: "Position" },
  { token: "{total_students}", label: "Out Of (Total Students)" },
  { token: "{form_sw}", label: "Form (Kiswahili - Kidato...)" },
  { token: "{gender_letter}", label: "Gender Letter (F/M)" },
  { token: "{subjects_breakdown_long}", label: "Subjects, Marks, Grade & Comment (full report style)" },
];

// Short, single-SMS-part (≤160 char, for most names) results message -
// used when the Provider is NextSMS (billed per SMS segment, so brevity
// matters). "MHULA WA II" and the reopening date are literal text, not
// placeholders - the system has no field for "which term number" or
// "reopening date", so whoever sends results edits those two bits by hand
// each term before hitting Preview (same as the closing/opening dates used
// to work in the paper report). Everything else fills in automatically.
const DEFAULT_TEMPLATE =
  "{school_short}: {student_name} - MHULA WA II ({month_name_sw} {year}). " +
  "Jumla {total_marks}, Wastani {average}, Daraja {avg_grade}, Nafasi {position}/{total_students}, " +
  "Point {points}, Div {division}. Shule Itafunguliwa: [tarehe]";

// Long, full paper-report-style message - used when the Provider is the
// Android SMS Gateway (sent from the school's own phone/SIM, so per-segment
// cost isn't a concern the way it is with NextSMS). Mirrors the school's
// old printed report layout exactly, per spec.
const DEFAULT_TEMPLATE_ANDROID =
  "SHULE YA SEKONDARI MIKUMBI\n" +
  "RIPOTI YA MAENDELEO YA MWANAFUNZI KATIKA {exam_type_sw} {month_sw} MWAKA {year}\n" +
  "KWA MZAZI/MLEZI WA: {student_name}\n" +
  "JINSIA KIDATO NAMBA YA USAJILI\n" +
  "{gender_letter} {form_sw} {reg_no}\n" +
  "A: TAARIFA YA MAENDELEO YA KITAALUMA\n" +
  "SOMO ALAMA ZA MTIHANI DARAJA MAONI\n" +
  "{subjects_breakdown_long}\n" +
  "JUMLA YA ALAMA: {total_marks}\n" +
  "WASTANI: {average} DARAJA: {avg_grade}\n" +
  "AMEKUWA MWANAFUNZI WA {position} KATI YA {total_students} WALIOFANYA MTIHANI\n" +
  "AMEPATA POINT {points} SAWA NA DIVISION {division}\n" +
  "Shule Imefungwa leo tarehe [tarehe], na Itafunguliwa tarehe [tarehe]";

// GSM-7 SMS is 160 chars for a single message, 153 per part once it has to
// be split into multiple concatenated parts - shown to the sender so a
// school with hundreds of parents can see the likely SMS-credit cost before
// committing, not just a character count with no meaning attached.
function countSegments(text) {
  const len = text.length;
  if (len <= 160) return 1;
  return Math.ceil(len / 153);
}

function renderTemplate(template, vars) {
  let out = String(template);
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(value);
  }
  return out;
}

function buildVars(sheet, student, totalStudents, subjectScores) {
  const scores = subjectScores || [];
  // JUMLA/WASTANI are derived from the same per-subject rows the breakdown
  // lists, exactly like the Parent Report PDF does (resultsController.js),
  // so the SMS a parent gets always matches the numbers on the printed
  // report for the same student/period.
  const totalMarks = scores.length
    ? scores.reduce((sum, s) => sum + (Number(s.marks) || 0), 0)
    : (student.total_marks != null ? Math.round(student.total_marks) : 0);
  const average = scores.length ? Math.round(totalMarks / scores.length) : 0;
  const subjectsBreakdown = scores.length
    ? scores.map((s) => `${s.subject_name} - ${s.marks} '${s.grade || "-"}'`).join("\n")
    : "-";
  const subjectsBreakdownLong = scores.length
    ? scores.map((s) => `${s.subject_name} ${s.marks} ${s.grade || "-"} ${gradeCommentSw(s.grade)}`).join("\n")
    : "-";
  return {
    school_name: SCHOOL_NAME,
    school_short: SCHOOL_NAME_SHORT,
    student_name: student.full_name,
    parent_name: student.parent_name || "Mzazi/Mlezi",
    reg_no: student.reg_no || student.entry_no || "-",
    form: student.form,
    form_sw: formSw(student.form),
    gender_letter: genderLetter(student.gender),
    exam_type: sheet.exam_type,
    exam_type_sw: examTypeSw(sheet.exam_type),
    month: sheet.month,
    month_sw: monthSw(sheet.month),
    month_name_sw: monthNameSw(sheet.month),
    year: String(sheet.year),
    subjects_breakdown: subjectsBreakdown,
    subjects_breakdown_long: subjectsBreakdownLong,
    total_marks: String(totalMarks),
    subjects_sat: String(student.subjects_sat ?? scores.length ?? 0),
    average: String(average),
    division: student.division === "INC" ? "Haijakamilika" : (student.division || "N/A"),
    avg_grade: student.avg_grade || "N/A",
    points: student.points != null ? String(student.points) : "N/A",
    position: student.position != null ? String(student.position) : "N/A",
    total_students: String(totalStudents),
  };
}

// Shared loader for both preview and send - one compiled result row per
// student (student_results, same view every other Results screen reads
// from) LEFT JOINed to that student's own auto-synced parent contact, so a
// student with results but no usable parent phone still shows up (as
// "unmatched"/skipped) instead of silently vanishing from the list. Also
// loads each student's own per-subject marks/grades (same source as the
// Parent Report PDF's subject table) so the SMS can list them the way a
// parent would recognise from the printed report.
async function loadResultsSmsContext(sheet_id) {
  const sheetRes = await query(
    `SELECT ss.*, ap.exam_type, ap.month, ap.year FROM score_sheets ss JOIN academic_periods ap ON ap.id = ss.period_id WHERE ss.id = $1`,
    [sheet_id]
  );
  const sheet = sheetRes.rows[0];
  if (!sheet) return null;

  const studentsRes = await query(
    `SELECT sr.*, spc.phone AS parent_phone, spc.parent_name AS parent_name
     FROM student_results sr
     LEFT JOIN sms_parent_contacts spc ON spc.student_id = sr.student_id AND spc.is_active = TRUE
     WHERE sr.sheet_id = $1
     ORDER BY sr.gender ASC, sr.reg_no ASC NULLS LAST, sr.student_id ASC`,
    [sheet_id]
  );

  const scoresRes = await query(
    `SELECT sc.student_id, sub.name AS subject_name, ROUND(sc.marks)::INT AS marks, sc.grade
     FROM included_scores sc JOIN subjects sub ON sc.subject_id = sub.id
     WHERE sc.sheet_id = $1 AND sc.marks IS NOT NULL
     ORDER BY sub.sort_order ASC, sub.code ASC`,
    [sheet_id]
  );
  const scoresByStudent = {};
  scoresRes.rows.forEach((r) => {
    (scoresByStudent[r.student_id] ||= []).push({ subject_name: r.subject_name, marks: r.marks, grade: r.grade });
  });

  return { sheet, students: studentsRes.rows, scoresByStudent };
}

// Loads the two bits of school_settings this controller cares about:
// which provider is selected by default, and (only if actually needed)
// the Android Gateway's connection details.
async function loadSmsProviderConfig() {
  const { rows } = await query(
    `SELECT sms_provider, android_sms_gateway_url, android_sms_gateway_username, android_sms_gateway_password FROM school_settings WHERE id = 1`
  );
  const row = rows[0] || {};
  return {
    defaultProvider: row.sms_provider || "nextsms",
    androidConfig: { url: row.android_sms_gateway_url, username: row.android_sms_gateway_username, password: row.android_sms_gateway_password },
  };
}

// POST /api/results-mgmt/results-sms/preview  { sheet_id, template?, provider? }
const previewResultsSms = async (req, res, next) => {
  try {
    const { sheet_id, template } = req.body;
    if (!sheet_id) return res.status(400).json({ success: false, message: "sheet_id is required." });

    const { defaultProvider } = await loadSmsProviderConfig();
    const provider = req.body.provider === "android_gateway" || req.body.provider === "nextsms" ? req.body.provider : defaultProvider;
    const defaultForProvider = provider === "android_gateway" ? DEFAULT_TEMPLATE_ANDROID : DEFAULT_TEMPLATE;
    const tpl = (template && template.trim()) ? template : defaultForProvider;

    const ctx = await loadResultsSmsContext(sheet_id);
    if (!ctx) return res.status(404).json({ success: false, message: "Exam period / score sheet not found." });
    if (!ctx.students.length) return res.status(404).json({ success: false, message: "No compiled results found for this sheet yet." });

    const totalStudents = ctx.students.length;
    const matched = [];
    const unmatched = [];

    ctx.students.forEach((s) => {
      const message = renderTemplate(tpl, buildVars(ctx.sheet, s, totalStudents, ctx.scoresByStudent[s.student_id]));
      const phone = (s.parent_phone || "").toString().trim();
      const row = {
        student_id: s.student_id, full_name: s.full_name, reg_no: s.reg_no || null, form: s.form,
        parent_name: s.parent_name || null, phone: phone || null,
        message, char_count: message.length, sms_segments: countSegments(message),
      };
      if (phone) matched.push(row);
      else unmatched.push({ ...row, reason: "No parent phone number on file (Student Management → Parent/Guardian Phone)." });
    });

    res.json({
      success: true,
      sheet: { id: ctx.sheet.id, form: ctx.sheet.form, exam_type: ctx.sheet.exam_type, month: ctx.sheet.month, year: ctx.sheet.year },
      template: tpl,
      provider,
      placeholders: PLACEHOLDER_DEFS,
      default_template: DEFAULT_TEMPLATE,
      default_template_android: DEFAULT_TEMPLATE_ANDROID,
      total_students: totalStudents,
      matched, unmatched,
    });
  } catch (err) { next(err); }
};

// Sends in fixed-size batches instead of one single request no matter how
// large the class/school is - keeps every individual request to the SMS
// gateway a reasonable size, and means one slow/rejected batch doesn't cost
// the sends that already succeeded in earlier batches.
const SEND_CHUNK_SIZE = 50;

// POST /api/results-mgmt/results-sms/send  { sheet_id, template?, student_ids, provider? }
// student_ids is ALWAYS explicit - "send to all" is the frontend passing
// every matched student's id, exactly like "select all" elsewhere in this
// system (see Communications → SMS Service ContactPicker), so this endpoint
// never has to guess who "everyone" means.
const sendResultsSms = async (req, res, next) => {
  try {
    const { sheet_id, template, student_ids } = req.body;
    if (!sheet_id) return res.status(400).json({ success: false, message: "sheet_id is required." });
    if (!Array.isArray(student_ids) || !student_ids.length)
      return res.status(400).json({ success: false, message: "Select at least one student to send results for." });

    const { defaultProvider, androidConfig } = await loadSmsProviderConfig();
    const provider = req.body.provider === "android_gateway" || req.body.provider === "nextsms" ? req.body.provider : defaultProvider;
    const defaultForProvider = provider === "android_gateway" ? DEFAULT_TEMPLATE_ANDROID : DEFAULT_TEMPLATE;
    const tpl = (template && template.trim()) ? template : defaultForProvider;

    const ctx = await loadResultsSmsContext(sheet_id);
    if (!ctx) return res.status(404).json({ success: false, message: "Exam period / score sheet not found." });

    const totalStudents = ctx.students.length;
    const wanted = new Set(student_ids.map(String));
    const items = []; // { phone, text, student_name }
    const skipped = []; // selected but no usable parent phone

    ctx.students.forEach((s) => {
      if (!wanted.has(String(s.student_id))) return;
      const phone = (s.parent_phone || "").toString().trim();
      if (!phone) { skipped.push(s.full_name); return; }
      items.push({ phone, text: renderTemplate(tpl, buildVars(ctx.sheet, s, totalStudents, ctx.scoresByStudent[s.student_id])), student_name: s.full_name });
    });

    if (!items.length) {
      return res.status(400).json({
        success: false,
        message: "None of the selected students have a saved parent phone number.",
        skipped,
      });
    }

    // NextSMS is billed per segment and needs `formatPhone`'s bare-255
    // format; the Android Gateway is a free phone-owned SIM and needs the
    // "+255" format instead - both differences are already handled inside
    // each provider module, this controller just picks which one to call.
    const sendOneFn = provider === "android_gateway" ? (phone, text) => androidGateway.sendOne(phone, text, androidConfig) : sendOne;
    const sendBulkFn = provider === "android_gateway" ? (chunk) => androidGateway.sendBulkPersonalized(chunk, androidConfig) : sendBulkPersonalized;
    const formatPhoneFn = provider === "android_gateway" ? androidGateway.formatPhone : formatPhone;

    let sentCount = 0;
    const failures = [];
    try {
      for (let i = 0; i < items.length; i += SEND_CHUNK_SIZE) {
        const chunk = items.slice(i, i + SEND_CHUNK_SIZE);
        const result = chunk.length === 1 ? await sendOneFn(chunk[0].phone, chunk[0].text) : await sendBulkFn(chunk);
        if (result.success) sentCount += chunk.length;
        else chunk.forEach((it) => failures.push({ student_name: it.student_name, phone: it.phone, error: result.error }));
      }
    } catch (gatewayErr) {
      // Android Gateway throws (rather than resolving {success:false}) when
      // it isn't configured yet at all - surface that clearly instead of a
      // generic 500.
      return res.status(400).json({ success: false, message: gatewayErr.message || "SMS Gateway error." });
    }

    const status = failures.length === 0 ? "sent" : (sentCount > 0 ? "partial" : "failed");
    const formattedNumbers = items.map((it) => formatPhoneFn(it.phone));
    const recipientsDesc = `Exam Results - ${ctx.sheet.form} ${ctx.sheet.exam_type} ${ctx.sheet.month} ${ctx.sheet.year} (${items.length} parent${items.length === 1 ? "" : "s"})`;
    const notesParts = [`Provider: ${provider === "android_gateway" ? "Android SMS Gateway" : "NextSMS"}`];
    if (failures.length) notesParts.push(`Failed: ${JSON.stringify(failures)}`);
    if (skipped.length) notesParts.push(`Skipped (no parent phone): ${skipped.join(", ")}`);

    await query(
      `INSERT INTO sms_log (category, recipients, message, recipient_count, status, sender_id, notes, sent_by, recipient_numbers)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        "results", recipientsDesc, tpl, items.length, status,
        provider === "android_gateway" ? "Android Gateway" : (process.env.NEXTSMS_SENDER_ID || "Millanzi"),
        notesParts.join(" | "),
        req.user.id, formattedNumbers.join(", "),
      ]
    );

    if (status === "failed") {
      return res.status(500).json({
        success: false,
        message: provider === "android_gateway"
          ? "Failed to send results SMS. Check the Android SMS Gateway phone is online and the URL/credentials in Settings → SMS Gateway."
          : "Failed to send results SMS. Check NextSMS API credentials.",
        failures, skipped,
      });
    }

    res.json({
      success: true,
      message: status === "partial"
        ? `Results sent to ${sentCount} of ${items.length} parent(s). ${failures.length} failed.`
        : `Results sent to ${sentCount} parent(s).`,
      status, sent: sentCount, total: items.length, failures, skipped,
    });
  } catch (err) { next(err); }
};

module.exports = { previewResultsSms, sendResultsSms, DEFAULT_TEMPLATE, PLACEHOLDER_DEFS };
