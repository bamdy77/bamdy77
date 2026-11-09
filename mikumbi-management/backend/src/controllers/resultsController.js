// controllers/resultsController.js - RESULTS MANAGEMENT
// Ported from the standalone mikumbi-results project. All grading/Best-7
// Division logic, the "Include in Results" gate, and the bug-fix behaviors
// documented in the original comments are preserved unchanged. Only the
// identity layer changed: students/subjects/users are now the SAME rows
// used by the rest of the unified system (no separate copies).
const { query, pool } = require("../db/db");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { recordAudit } = require("../utils/auditLogger");
const { notifyUser, notifyRoles } = require("../utils/notifier");

const VALID_FORMS = ["Form I", "Form II", "Form III", "Form IV"];
const sexLabel = (gender) => (gender === "Female" ? "F" : gender === "Male" ? "M" : (gender || "-"));

// TEACHER / SUBJECT PERFORMANCE shows just First + Last name (middle
// name(s) dropped) - e.g. "AMOSI MWANDOLE MWELA" → "AMOSI MWELA". A name
// with only one or two words is left as-is. teacher_name can be a
// ", "-joined list (STRING_AGG of more than one teacher for the same
// subject/sheet), so each name in the list is shortened independently.
const shortTeacherName = (name) => {
  if (!name) return name;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length <= 2 ? name.trim() : `${parts[0]} ${parts[parts.length - 1]}`;
};
const shortenTeacherNameList = (nameList) =>
  nameList ? nameList.split(",").map((n) => shortTeacherName(n.trim())).join(", ") : nameList;

// Mirrors frontend/src/styles/theme.js COMPETENCY_COLORS - kept in sync by
// hand since the PDF/Excel exports render outside the browser and can't
// import the frontend's CSS tokens directly.
const COMPETENCY_COLOR = {
  A: { bg: "#0A3D1B", text: "#FFFFFF" },
  B: { bg: "#2ED92E", text: "#FFFFFF" },
  C: { bg: "#e9ff70", text: "#1A2E05" },
  D: { bg: "#fb8b24", text: "#3A2100" },
  F: { bg: "#c1121f", text: "#FFFFFF" },
};
const competencyGrade = (label) => (label ? label.replace(/^Grade\s+/i, "").charAt(0).toUpperCase() : null);

// Fixed accent colors for the A-C / A-D combined-range columns on the
// Teachers Evaluation sheet - NOT data-driven (unlike COMPETENCY_COLOR
// above, which is picked per-row from a computed GPA band). A-C and A-D
// aren't single letter grades, so they don't have a color of their own in
// COMPETENCY_COLOR; these two are just fixed accents so the two combined
// columns stay visually distinct from the plain PASS/GPA/POS columns.
const RANGE_COLOR = {
  AC: { bg: "#0EA5E9", text: "#FFFFFF" }, // sky blue
  AD: { bg: "#7C3AED", text: "#FFFFFF" }, // indigo
  PASS: { bg: "#0D9488", text: "#FFFFFF" }, // teal - TEACHER/SUBJECT PERFORMANCE PASS column
};

// NECTA-style report look for the compiled Results PDF (Division
// Performance Summary, the main CNO/NAME/DETAILS SUBJECTS table, Subject
// Performance, and Top/Bottom 10) - Arial-style sans-serif font, cream cell
// fill, navy text, and a full grid (every cell bordered on all sides),
// matching the printed exam-board report format (necta.go.tz itself renders
// its results tables in Arial, not a serif font). "Helvetica"/"Helvetica-Bold"
// are PDFKit's built-in standard fonts and are metric-compatible with
// Arial/Arial-Bold, so no extra font files are needed.
const NECTA_FONT = "Helvetica";
const NECTA_FONT_BOLD = "Helvetica-Bold";
const NECTA_TEXT = "#0A1F5C";
const NECTA_BG = "#FFFEEA";
const NECTA_HEAD_BG = "#FCF3C0";
const NECTA_BORDER = "#7C93B8";
// The light-blue box NECTA's own printed report wraps the DIVISION
// PERFORMANCE SUMMARY heading/table in - matches necta.go.tz exactly, and
// mirrors NECTA_SUMMARY_BG in frontend/src/pages/ResultsManagement.jsx.
const NECTA_SUMMARY_BG = "#ADD8E6";

// Groove (embossed/3D) grid-line colors - a lighter tint and a darker shade
// of NECTA_BORDER, used ONLY for the DIVISION PERFORMANCE SUMMARY and main
// Reg.No/CAND NAME/.../DETAILS SUBJECTS table in exportResultsPdf, mirroring
// the `border: 2px groove ${NECTA_BORDER}` variant added on the frontend
// (nectaThGroove/nectaTdGroove in ResultsManagement.jsx) for those exact
// same two tables. PDFKit has no native "groove" border style, so it's
// faked here by drawing two adjacent hairlines per grid line - a dark one
// then a light one - which reads as a carved-in 3D line, same as the CSS
// version. Every other exported table (School Examination Subject
// Performance, Top/Bottom Performers) keeps using the original flat
// drawVLines/flushHLines with NECTA_BORDER, untouched.
const NECTA_BORDER_LIGHT = "#E7ECF6";
const NECTA_BORDER_DARK = "#5A6E93";

// Per-subject, per-teacher breakdown for one score sheet: teacher's full
// name, subject, SAT/A/B/C/D/F/A-C/A-D/PASS/GPA - every count computed in
// SQL (never in the browser), reusing the SAME already-aggregated
// subject_performance view that powers "SCHOOL EXAMINATION SUBJECT
// PERFORMANCE" (identical numbers, just with the responsible teacher
// attached). The first LATERAL join finds the teacher whose submission was
// actually included_in_results for that (sheet, subject) - the same gate
// the included_scores view itself requires, so a match is always found in
// practice; STRING_AGG guards against the rare case of more than one.
// The second LATERAL join adds the Female/Male split for every grade band
// (A/B/C/D/F/A-C/A-D) - the on-screen table and PDF show these as F/M/T/%
// per band, matching the school's paper mark sheet format.
const getTeacherSubjectPerformance = async (sheet_id, subject_ids = null) => {
  const result = await query(
    `SELECT
     sp.subject_id, sp.subject_code, sp.subject_name, sp.sort_order,
     sp.total_sat, sp.grade_a, sp.grade_b, sp.grade_c, sp.grade_d, sp.grade_f,
     sp.pct_a, sp.pct_b, sp.pct_c, sp.pct_d, sp.pct_f,
     sp.a_to_c_count, sp.a_to_c_pct, sp.a_to_d_count, sp.a_to_d_pct,
     sp.pass_count, sp.pass_pct, sp.gpa, sp.subject_rank AS pos,
     ts.teacher_name,
     COALESCE(g.grade_a_f,0) AS grade_a_f, COALESCE(g.grade_a_m,0) AS grade_a_m,
     COALESCE(g.grade_b_f,0) AS grade_b_f, COALESCE(g.grade_b_m,0) AS grade_b_m,
     COALESCE(g.grade_c_f,0) AS grade_c_f, COALESCE(g.grade_c_m,0) AS grade_c_m,
     COALESCE(g.grade_d_f,0) AS grade_d_f, COALESCE(g.grade_d_m,0) AS grade_d_m,
     COALESCE(g.grade_f_f,0) AS grade_f_f, COALESCE(g.grade_f_m,0) AS grade_f_m,
     COALESCE(g.a_to_c_f,0) AS a_to_c_f, COALESCE(g.a_to_c_m,0) AS a_to_c_m,
     COALESCE(g.a_to_d_f,0) AS a_to_d_f, COALESCE(g.a_to_d_m,0) AS a_to_d_m,
     COALESCE(g.a_to_d_f,0) AS pass_f, COALESCE(g.a_to_d_m,0) AS pass_m
   FROM subject_performance sp
   LEFT JOIN LATERAL (
     SELECT STRING_AGG(DISTINCT u.full_name, ', ') AS teacher_name
     FROM teacher_sheet_status tss
     JOIN users u ON u.id = tss.teacher_id
     WHERE tss.sheet_id = sp.sheet_id AND tss.subject_id = sp.subject_id AND tss.included_in_results = TRUE
   ) ts ON TRUE
   LEFT JOIN LATERAL (
     SELECT
       COUNT(CASE WHEN sc.grade='A' AND st.gender='Female' THEN 1 END) AS grade_a_f,
       COUNT(CASE WHEN sc.grade='A' AND st.gender='Male'   THEN 1 END) AS grade_a_m,
       COUNT(CASE WHEN sc.grade='B' AND st.gender='Female' THEN 1 END) AS grade_b_f,
       COUNT(CASE WHEN sc.grade='B' AND st.gender='Male'   THEN 1 END) AS grade_b_m,
       COUNT(CASE WHEN sc.grade='C' AND st.gender='Female' THEN 1 END) AS grade_c_f,
       COUNT(CASE WHEN sc.grade='C' AND st.gender='Male'   THEN 1 END) AS grade_c_m,
       COUNT(CASE WHEN sc.grade='D' AND st.gender='Female' THEN 1 END) AS grade_d_f,
       COUNT(CASE WHEN sc.grade='D' AND st.gender='Male'   THEN 1 END) AS grade_d_m,
       COUNT(CASE WHEN sc.grade='F' AND st.gender='Female' THEN 1 END) AS grade_f_f,
       COUNT(CASE WHEN sc.grade='F' AND st.gender='Male'   THEN 1 END) AS grade_f_m,
       COUNT(CASE WHEN sc.grade IN ('A','B','C') AND st.gender='Female' THEN 1 END) AS a_to_c_f,
       COUNT(CASE WHEN sc.grade IN ('A','B','C') AND st.gender='Male'   THEN 1 END) AS a_to_c_m,
       COUNT(CASE WHEN sc.grade IN ('A','B','C','D') AND st.gender='Female' THEN 1 END) AS a_to_d_f,
       COUNT(CASE WHEN sc.grade IN ('A','B','C','D') AND st.gender='Male'   THEN 1 END) AS a_to_d_m
     FROM included_scores sc
     JOIN students st ON st.id = sc.student_id
     WHERE sc.sheet_id = sp.sheet_id AND sc.subject_id = sp.subject_id AND sc.marks IS NOT NULL
   ) g ON TRUE
   WHERE sp.sheet_id = $1 AND ($2::int[] IS NULL OR sp.subject_id = ANY($2::int[]))
   ORDER BY sp.sort_order ASC, sp.subject_code ASC`,
    [sheet_id, subject_ids]
  );
  // First + Last name only, for the TEACHER / SUBJECT PERFORMANCE column -
  // applied once here so the on-screen table AND the exported PDF (both
  // consume this same function's rows) always match.
  result.rows = result.rows.map((r) => ({ ...r, teacher_name: shortenTeacherNameList(r.teacher_name) }));
  return result;
};

// ══════════════════ ACADEMIC PERIODS ══════════════════
const getPeriods = async (_req, res, next) => {
  try {
    const { rows } = await query(`SELECT * FROM academic_periods ORDER BY year DESC, created_at DESC`);
    res.json(rows);
  } catch (err) { next(err); }
};

// POST /api/results-mgmt/periods - find-or-create (idempotent), so teachers
// and admin always point at the same period row for the same exam.
const createOrFindPeriod = async (req, res, next) => {
  const { form, exam_type, month, year } = req.body;
  if (!form || !exam_type || !month || !year)
    return res.status(400).json({ error: "form, exam_type, month, year required." });
  try {
    const existing = await query(
      `SELECT * FROM academic_periods WHERE form=$1 AND exam_type=$2 AND month=$3 AND year=$4`,
      [form, exam_type, month, year]
    );
    if (existing.rows.length) return res.json(existing.rows[0]);
    const { rows } = await query(
      `INSERT INTO academic_periods (form,exam_type,month,year,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [form, exam_type, month, year, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
};

// ══════════════════ SCORE SHEETS ══════════════════
const getSheet = async (req, res, next) => {
  const { period_id, form } = req.query;
  if (!period_id || !form) return res.status(400).json({ error: "period_id and form required." });
  try {
    const { rows } = await query(`SELECT * FROM score_sheets WHERE period_id=$1 AND form=$2`, [period_id, form]);
    const sheet = rows[0] || null;
    if (!sheet) return res.json(null);

    // Anyone who enters/locks scores for their OWN subject (teacher, patron,
    // matron, class_teacher, food_teacher - every non-admin/academic role
    // that can call lockTeacher) needs an accurate lock flag here, not just
    // the primary role "teacher" - and combined roles (role + extra_roles)
    // must be checked, not just the single primary role column.
    const myRoles = req.user.roles && req.user.roles.length ? req.user.roles : [req.user.role];
    const isAdminOrAcademic = myRoles.some((r) => ["admin", "second_master", "academic"].includes(r));
    let teacherLocked = false;
    if (!isAdminOrAcademic) {
      const subjectId = req.query.subject_id ? Number(req.query.subject_id) : (req.user.subject_ids || [])[0];
      if (subjectId) {
        const lock = await query(`SELECT is_locked FROM teacher_sheet_status WHERE sheet_id=$1 AND teacher_id=$2 AND subject_id=$3`, [sheet.id, req.user.id, subjectId]);
        teacherLocked = lock.rows[0]?.is_locked === true;
      }
    }
    res.json({ ...sheet, teacherLocked });
  } catch (err) { next(err); }
};

const createSheet = async (req, res, next) => {
  const { period_id, form } = req.body;
  if (!period_id || !form) return res.status(400).json({ error: "period_id and form required." });
  try {
    const { rows } = await query(
      `INSERT INTO score_sheets (period_id,form) VALUES($1,$2)
       ON CONFLICT (period_id,form) DO UPDATE SET period_id=EXCLUDED.period_id RETURNING *`,
      [period_id, form]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
};

// ══════════════════ SAVE SCORES ══════════════════
// A teacher may only ever write scores for their OWN assigned subject -
// enforced server-side, not just in the UI. Once a teacher has submitted
// (locked) a subject on this sheet, further saves to that subject are
// blocked server-side too - until Academic Master/Admin unlocks it again -
// so a locked/already-included submission can never be silently altered
// just because the request still reaches this endpoint (e.g. a stale tab,
// or a direct API call) after the "Submit" button disabled itself.
const saveScores = async (req, res, next) => {
  const { sheet_id, scores } = req.body;
  if (!sheet_id || !Array.isArray(scores))
    return res.status(400).json({ error: "sheet_id and scores[] required." });

  // Combined role list (primary + extra_roles) - same rule as everywhere
  // else in the app: an Academic Master holding that as an extra role, not
  // just a primary one, must still get full admin/academic save rights.
  const myRoles = req.user.roles && req.user.roles.length ? req.user.roles : [req.user.role];
  const isAdminOrAcademic = myRoles.some((r) => ["admin", "second_master", "academic"].includes(r));
  const myScopedSubjectIds = req.user.subject_ids || [];

  const client = await pool.connect();
  let released = false;
  try {
    await client.query("BEGIN");

    // Which of THIS teacher's own subjects are already locked on this sheet
    // - checked once up front, only for non-admin/academic requesters, since
    // isAdminOrAcademic may always correct a locked submission.
    let lockedSubjectIds = [];
    if (!isAdminOrAcademic && myScopedSubjectIds.length) {
      const lockRes = await client.query(
        `SELECT subject_id FROM teacher_sheet_status
         WHERE sheet_id = $1 AND teacher_id = $2 AND subject_id = ANY($3::int[]) AND is_locked = TRUE`,
        [sheet_id, req.user.id, myScopedSubjectIds]
      );
      lockedSubjectIds = lockRes.rows.map((r) => r.subject_id);
    }

    // Admin/Academic Master ARE allowed to correct a subject after it has
    // been locked (submitted) - but doing so is exactly the kind of action
    // that must leave a trail: "who changed a student's mark, on which
    // subject, after it was already locked, and when". Figure out which
    // subjects in THIS payload are currently locked (by ANY teacher on this
    // sheet) so we know which edits below need to be captured for the
    // Audit Log - checked only for admin/academic, since a non-admin's
    // save on a locked subject is already blocked above and never reaches
    // the database at all.
    let adminLockedSubjectIds = [];
    if (isAdminOrAcademic) {
      const requestedSubjectIds = Array.from(new Set(scores.map((r) => r.subject_id).filter(Boolean)));
      if (requestedSubjectIds.length) {
        const lockRes = await client.query(
          `SELECT DISTINCT subject_id FROM teacher_sheet_status
           WHERE sheet_id = $1 AND subject_id = ANY($2::int[]) AND is_locked = TRUE`,
          [sheet_id, requestedSubjectIds]
        );
        adminLockedSubjectIds = lockRes.rows.map((r) => r.subject_id);
      }
    }

    const rows = [];
    let blockedByLock = false;
    for (const row of scores) {
      const { student_id, subject_id, marks } = row;
      if (!student_id || !subject_id) continue;
      if (!isAdminOrAcademic && !myScopedSubjectIds.includes(subject_id)) continue;
      if (!isAdminOrAcademic && lockedSubjectIds.includes(subject_id)) { blockedByLock = true; continue; }
      const val = (marks === "" || marks === null || marks === undefined) ? null : Number(marks);
      // Marks must be a real number from 0–100 - reject the whole save with
      // a short, immediate message rather than silently clamping or storing
      // an out-of-range value.
      if (val !== null && (!Number.isFinite(val) || val < 0 || val > 100)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Marks must be 0–100." });
      }
      rows.push([sheet_id, student_id, subject_id, val]);
    }

    // Nothing was saved AND it's specifically because of a lock - tell the
    // teacher clearly instead of silently reporting success with 0 changes.
    if (!rows.length && blockedByLock) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Your submission for this subject is locked - ask the Academic Master or Head Master to unlock it before making changes." });
    }

    // Snapshot the BEFORE values for any row that touches an already-locked
    // subject, so the audit entry below can show exactly what changed -
    // captured before the UPDATE overwrites them, in the same transaction.
    let beforeMap = new Map(); // "studentId:subjectId" -> old marks (or undefined = no prior row)
    const lockedRowsInThisSave = rows.filter(([, , subject_id]) => adminLockedSubjectIds.includes(subject_id));
    if (lockedRowsInThisSave.length) {
      const studentIds = Array.from(new Set(lockedRowsInThisSave.map((r) => r[1])));
      const before = await client.query(
        `SELECT student_id, subject_id, marks FROM scores
         WHERE sheet_id = $1 AND subject_id = ANY($2::int[]) AND student_id = ANY($3::int[])`,
        [sheet_id, adminLockedSubjectIds, studentIds]
      );
      beforeMap = new Map(before.rows.map((r) => [`${r.student_id}:${r.subject_id}`, r.marks]));
    }

    if (rows.length) {
      const valuesSql = rows.map((_, i) => `($${i * 4 + 1},$${i * 4 + 2},$${i * 4 + 3},$${i * 4 + 4})`).join(",");
      await client.query(
        `INSERT INTO scores (sheet_id,student_id,subject_id,marks) VALUES ${valuesSql}
         ON CONFLICT(sheet_id,student_id,subject_id) DO UPDATE SET marks=EXCLUDED.marks, updated_at=NOW()`,
        rows.flat()
      );
    }
    await client.query("COMMIT");
    client.release(); // done with the transaction connection - release it before the (non-transactional) audit lookups below
    released = true;
    res.json({
      message: blockedByLock ? "Scores saved. Now this subject is locked - if you need to make changes, ask the Academic Master to unlock first." : "Scores saved.",
      count: rows.length,
    });

    // ── Audit trail (best-effort, after the response - never blocks the save) ──
    if (lockedRowsInThisSave.length) {
      try {
        const bySubject = new Map();
        for (const [, student_id, subject_id, marks] of lockedRowsInThisSave) {
          const oldVal = beforeMap.get(`${student_id}:${subject_id}`);
          if (oldVal !== undefined && Number(oldVal) === (marks === null ? NaN : Number(marks))) continue; // unchanged value - nothing to log
          if (!bySubject.has(subject_id)) bySubject.set(subject_id, []);
          bySubject.get(subject_id).push({ student_id, old_marks: oldVal ?? null, new_marks: marks });
        }
        if (bySubject.size) {
          const subjIds = Array.from(bySubject.keys());
          const [subjRes, sheetRes] = await Promise.all([
            query(`SELECT id, name, code FROM subjects WHERE id = ANY($1::int[])`, [subjIds]),
            query(
              `SELECT ss.id, ss.form, ap.exam_type, ap.month, ap.year FROM score_sheets ss
               JOIN academic_periods ap ON ap.id = ss.period_id WHERE ss.id = $1`,
              [sheet_id]
            ),
          ]);
          const subjectById = new Map(subjRes.rows.map((s) => [s.id, s]));
          const sheetInfo = sheetRes.rows[0];
          const periodLabel = sheetInfo ? `${sheetInfo.form} - ${sheetInfo.exam_type}, ${sheetInfo.month} ${sheetInfo.year}` : `sheet #${sheet_id}`;
          for (const [subject_id, changes] of bySubject.entries()) {
            const subj = subjectById.get(subject_id);
            const subjName = subj ? `${subj.name} (${subj.code})` : `subject #${subject_id}`;
            await recordAudit({
              actor: req.user,
              action: "score.edit_after_lock",
              entityType: "score_sheet",
              entityId: Number(sheet_id),
              description: `${req.user.full_name || req.user.username} edited ${changes.length} mark(s) in ${subjName} for ${periodLabel} AFTER that subject had already been locked/submitted.`,
              metadata: { sheet_id: Number(sheet_id), subject_id, changes: changes.slice(0, 100) },
              req,
            });
          }
        }
      } catch (auditErr) {
        console.error("Audit trail for saveScores (post-lock edit) failed:", auditErr.message);
      }
    }
  } catch (err) {
    if (!released) { await client.query("ROLLBACK").catch(() => {}); }
    next(err);
  } finally { if (!released) client.release(); }
};

// Admin/Academic deletes ONE teacher's submitted scores for a sheet and
// auto-unlocks them to re-enter. No confirm prompt on the frontend for this.
const deleteTeacherResults = async (req, res, next) => {
  const { sheet_id, teacher_id, subject_id } = req.body;
  if (!sheet_id || !teacher_id) return res.status(400).json({ error: "sheet_id and teacher_id required." });
  try {
    const teacherRes = await query(`SELECT subject_ids, full_name FROM users WHERE id = $1 AND role NOT IN ('patron','matron')`, [teacher_id]);
    if (!teacherRes.rows.length) return res.status(404).json({ error: "Teacher not found." });
    const { subject_ids, full_name } = teacherRes.rows[0];
    if (!subject_ids || !subject_ids.length) return res.status(400).json({ error: "This teacher has no assigned subject." });

    // Scoped to ONE subject when given - the normal case now that a teacher's
    // subjects lock independently. Falls back to every subject this teacher
    // has for this sheet only if subject_id was omitted.
    const scopeSubjectIds = subject_id ? [Number(subject_id)] : subject_ids;

    const del = await query(`DELETE FROM scores WHERE sheet_id = $1 AND subject_id = ANY($2::int[])`, [sheet_id, scopeSubjectIds]);
    await query(
      `UPDATE teacher_sheet_status SET is_locked = FALSE, included_in_results = FALSE, unlocked_at = NOW()
       WHERE sheet_id = $1 AND teacher_id = $2 AND subject_id = ANY($3::int[])`,
      [sheet_id, teacher_id, scopeSubjectIds]
    );
    res.json({ message: `Deleted ${del.rowCount} score(s) submitted by ${full_name}. They have been unlocked.`, deleted: del.rowCount });
    recordAudit({
      actor: req.user,
      action: "teacher_results.delete",
      entityType: "score_sheet",
      entityId: Number(sheet_id),
      description: `${req.user.full_name || req.user.username} deleted ${del.rowCount} score(s) submitted by ${full_name} on sheet #${sheet_id}${subject_id ? ` (subject #${subject_id})` : ""} and unlocked the submission.`,
      metadata: { sheet_id: Number(sheet_id), teacher_id: Number(teacher_id), subject_id: subject_id ? Number(subject_id) : null, deleted: del.rowCount },
      req,
    });
  } catch (err) { next(err); }
};

// Unlock ONE (teacher, subject), or ONE teacher's every subject (no
// subject_id), or EVERY teacher on that sheet (no teacher_id).
// IMPORTANT: unlocking only re-opens the sheet for editing - it must NEVER
// touch included_in_results. Whether a subject's results show on the
// Results page is controlled ONLY by the explicit Include/Exclude toggle
// (toggleInclude below). Previously this also forced included_in_results
// to FALSE, which silently made a teacher's already-published results
// disappear the moment the Academic Master unlocked them for a correction.
const unlockTeacher = async (req, res, next) => {
  const { sheet_id, teacher_id, subject_id } = req.body;
  if (!sheet_id) return res.status(400).json({ error: "sheet_id required." });
  try {
    if (teacher_id && subject_id) {
      await query(
        `INSERT INTO teacher_sheet_status (sheet_id, teacher_id, subject_id, is_locked)
         VALUES ($1, $2, $3, FALSE)
         ON CONFLICT (sheet_id, teacher_id, subject_id) DO UPDATE SET is_locked=FALSE, unlocked_at=NOW()`,
        [sheet_id, teacher_id, subject_id]
      );
      res.json({ message: "Teacher's submission unlocked for re-editing." });
      recordAudit({
        actor: req.user, action: "sheet.unlock", entityType: "score_sheet", entityId: Number(sheet_id),
        description: `${req.user.full_name || req.user.username} unlocked teacher #${teacher_id}'s submission for subject #${subject_id} on sheet #${sheet_id}.`,
        metadata: { sheet_id: Number(sheet_id), teacher_id: Number(teacher_id), subject_id: Number(subject_id) }, req,
      });
      resolveUnlockRequestsAndNotify({ req, sheet_id, teacherIds: [Number(teacher_id)], subject_id: Number(subject_id) })
        .catch((e) => console.error("unlockTeacher notify failed:", e.message));
    } else if (teacher_id) {
      const result = await query(
        `UPDATE teacher_sheet_status SET is_locked = FALSE, unlocked_at = NOW()
         WHERE sheet_id = $1 AND teacher_id = $2 AND is_locked = TRUE`,
        [sheet_id, teacher_id]
      );
      res.json({ message: `Unlocked ${result.rowCount} subject submission(s) for this teacher.` });
      recordAudit({
        actor: req.user, action: "sheet.unlock", entityType: "score_sheet", entityId: Number(sheet_id),
        description: `${req.user.full_name || req.user.username} unlocked ${result.rowCount} subject submission(s) for teacher #${teacher_id} on sheet #${sheet_id}.`,
        metadata: { sheet_id: Number(sheet_id), teacher_id: Number(teacher_id), count: result.rowCount }, req,
      });
      resolveUnlockRequestsAndNotify({ req, sheet_id, teacherIds: [Number(teacher_id)], subject_id: null })
        .catch((e) => console.error("unlockTeacher notify failed:", e.message));
    } else {
      const result = await query(
        `UPDATE teacher_sheet_status SET is_locked = FALSE, unlocked_at = NOW()
         WHERE sheet_id = $1 AND is_locked = TRUE
         RETURNING teacher_id`,
        [sheet_id]
      );
      res.json({ message: `Unlocked ${result.rowCount} teacher(s) for this sheet.` });
      recordAudit({
        actor: req.user, action: "sheet.unlock_all", entityType: "score_sheet", entityId: Number(sheet_id),
        description: `${req.user.full_name || req.user.username} unlocked ALL teachers (${result.rowCount} submission(s)) on sheet #${sheet_id}.`,
        metadata: { sheet_id: Number(sheet_id), count: result.rowCount }, req,
      });
      const teacherIds = Array.from(new Set(result.rows.map((r) => r.teacher_id)));
      resolveUnlockRequestsAndNotify({ req, sheet_id, teacherIds, subject_id: null })
        .catch((e) => console.error("unlockTeacher notify failed:", e.message));
    }
  } catch (err) { next(err); }
};

// Shared by unlockTeacher - marks any matching pending unlock_requests as
// resolved, then notifies each affected teacher that their request has been
// handled and they can edit again. subject_id === null means "every subject
// for this teacher on this sheet" (or every teacher, when teacherIds spans
// more than one id).
async function resolveUnlockRequestsAndNotify({ req, sheet_id, teacherIds, subject_id }) {
  if (!teacherIds.length) return;
  await query(
    `UPDATE unlock_requests SET status = 'resolved', resolved_at = NOW(), resolved_by = $1
     WHERE sheet_id = $2 AND teacher_id = ANY($3::int[]) AND status = 'pending'
       AND ($4::int IS NULL OR subject_id = $4)`,
    [req.user.id, sheet_id, teacherIds, subject_id]
  );

  let subjectName = null;
  if (subject_id) {
    const { rows } = await query(`SELECT name FROM subjects WHERE id = $1`, [subject_id]);
    subjectName = rows[0]?.name || null;
  }

  await Promise.all(teacherIds.map((tid) =>
    notifyUser({
      userId: tid,
      type: "unlock_resolved",
      title: "Ombi Lako Limefanyiwa Kazi",
      message: subjectName
        ? `Ombi lako la kufunguliwa (Unlock) limefanyiwa kazi - alama za ${subjectName} zimefunguliwa, unaweza kuhariri tena.`
        : `Ombi lako la kufunguliwa (Unlock) limefanyiwa kazi - alama zako zimefunguliwa, unaweza kuhariri tena.`,
      metadata: { sheet_id: Number(sheet_id), subject_id: subject_id || null },
    })
  ));
}

// Admin/Academic "Include in Results" / "Exclude" toggle.
const toggleInclude = async (req, res, next) => {
  const { sheet_id, teacher_id, subject_id } = req.body;
  if (!sheet_id || !teacher_id || !subject_id) return res.status(400).json({ error: "sheet_id, teacher_id and subject_id are required." });
  try {
    const existing = await query(`SELECT is_locked, included_in_results FROM teacher_sheet_status WHERE sheet_id=$1 AND teacher_id=$2 AND subject_id=$3`, [sheet_id, teacher_id, subject_id]);
    if (!existing.rows.length || !existing.rows[0].is_locked)
      return res.status(400).json({ error: "This teacher hasn't submitted their scores yet - nothing to include." });
    const newValue = !existing.rows[0].included_in_results;
    const { rows } = await query(`UPDATE teacher_sheet_status SET included_in_results = $4 WHERE sheet_id = $1 AND teacher_id = $2 AND subject_id = $3 RETURNING *`, [sheet_id, teacher_id, subject_id, newValue]);
    res.json({
      message: newValue
        ? "Subject included in results. It will now appear in compiled reports for this class/exam."
        : "Subject excluded from results. It will no longer appear anywhere in compiled reports for this class/exam.",
      included_in_results: rows[0].included_in_results,
    });
    recordAudit({
      actor: req.user, action: newValue ? "sheet.include" : "sheet.exclude", entityType: "score_sheet", entityId: Number(sheet_id),
      description: `${req.user.full_name || req.user.username} ${newValue ? "included" : "excluded"} subject #${subject_id} (teacher #${teacher_id}) ${newValue ? "in" : "from"} compiled results on sheet #${sheet_id}.`,
      metadata: { sheet_id: Number(sheet_id), teacher_id: Number(teacher_id), subject_id: Number(subject_id), included_in_results: newValue }, req,
    });
  } catch (err) { next(err); }
};

// Teacher locks (submits) ONE subject's scores for a sheet - locking one
// subject never affects any other subject that teacher also teaches.
const lockTeacher = async (req, res, next) => {
  const { sheet_id, subject_id } = req.body;
  if (!sheet_id) return res.status(400).json({ error: "sheet_id required." });
  const mySubjectIds = req.user.subject_ids || [];
  const subjectId = subject_id ? Number(subject_id) : mySubjectIds[0];
  if (!subjectId || !mySubjectIds.includes(subjectId))
    return res.status(403).json({ error: "Not your subject." });
  try {
    await query(
      `INSERT INTO teacher_sheet_status (sheet_id, teacher_id, subject_id, is_locked, submitted_at) VALUES ($1, $2, $3, TRUE, NOW())
       ON CONFLICT (sheet_id, teacher_id, subject_id) DO UPDATE SET is_locked=TRUE, submitted_at=NOW()`,
      [sheet_id, req.user.id, subjectId]
    );
    res.json({ message: "Scores submitted and locked." });

    // Notify Academic Master (and Head Master / Second Master) that a score
    // sheet has just been received - best-effort, after the response, so a
    // notification hiccup never blocks the teacher's actual submission.
    notifySheetReceived({ req, sheet_id, subjectId }).catch((e) =>
      console.error("lockTeacher notify failed:", e.message)
    );
  } catch (err) { next(err); }
};

// Shared by lockTeacher - looks up subject/period context for a readable
// confirmation, then notifies the SAME teacher who just submitted (every
// teacher gets their own "Your Score Sheet Has Been Received" confirmation -
// this does not go to the Academic Master).
async function notifySheetReceived({ req, sheet_id, subjectId }) {
  const { rows } = await query(
    `SELECT sh.form, ap.exam_type, ap.month, ap.year, s.name AS subject_name
     FROM score_sheets sh JOIN academic_periods ap ON ap.id = sh.period_id, subjects s
     WHERE sh.id = $1 AND s.id = $2`,
    [sheet_id, subjectId]
  );
  const ctx = rows[0];
  const where = ctx ? `${ctx.subject_name} - ${ctx.form}, ${ctx.exam_type} (${ctx.month} ${ctx.year})` : "your subject";
  await notifyUser({
    userId: req.user.id,
    type: "score_submitted",
    title: "Your Score Sheet Has Been Received",
    message: `Your score sheet for ${where} has been received and locked. If you need to edit it again, send an unlock request to the Academic Master.`,
    metadata: { sheet_id: Number(sheet_id), teacher_id: req.user.id, subject_id: subjectId },
  });
}

const getTeacherLock = async (req, res, next) => {
  const { sheet_id, teacher_id, subject_id } = req.query;
  if (!sheet_id || !teacher_id || !subject_id) return res.status(400).json({ error: "sheet_id, teacher_id and subject_id are required." });
  try {
    const { rows } = await query(`SELECT is_locked, submitted_at FROM teacher_sheet_status WHERE sheet_id=$1 AND teacher_id=$2 AND subject_id=$3`, [sheet_id, teacher_id, subject_id]);
    res.json(rows[0] || { is_locked: false, submitted_at: null });
  } catch (err) { next(err); }
};

// Teacher taps "Request Unlock" - a single button, no
// free-text reason. This does NOT unlock anything by itself: it raises a
// request the Academic Master must act on via the existing /unlock
// endpoint (which resolves this request and notifies the teacher back -
// see resolveUnlockRequestsAndNotify above).
const requestUnlock = async (req, res, next) => {
  const { sheet_id, subject_id } = req.body;
  if (!sheet_id) return res.status(400).json({ error: "sheet_id required." });
  const mySubjectIds = req.user.subject_ids || [];
  const subjectId = subject_id ? Number(subject_id) : mySubjectIds[0];
  if (!subjectId || !mySubjectIds.includes(subjectId))
    return res.status(403).json({ error: "Not your subject." });
  try {
    const lockRes = await query(
      `SELECT is_locked FROM teacher_sheet_status WHERE sheet_id=$1 AND teacher_id=$2 AND subject_id=$3`,
      [sheet_id, req.user.id, subjectId]
    );
    if (!lockRes.rows.length || !lockRes.rows[0].is_locked)
      return res.status(400).json({ error: "You have no locked scores for this subject - there is nothing to request unlocking for." });

    await query(
      `INSERT INTO unlock_requests (sheet_id, teacher_id, subject_id, status, requested_at)
       VALUES ($1, $2, $3, 'pending', NOW())
       ON CONFLICT (sheet_id, teacher_id, subject_id) DO UPDATE SET status='pending', requested_at=NOW(), resolved_at=NULL, resolved_by=NULL`,
      [sheet_id, req.user.id, subjectId]
    );
    res.json({ message: "Your unlock request has been sent to the Academic Master." });

    const { rows } = await query(
      `SELECT sh.form, ap.exam_type, ap.month, ap.year, s.name AS subject_name
       FROM score_sheets sh JOIN academic_periods ap ON ap.id = sh.period_id, subjects s
       WHERE sh.id = $1 AND s.id = $2`,
      [sheet_id, subjectId]
    );
    const ctx = rows[0];
    const where = ctx ? `${ctx.subject_name} - ${ctx.form}, ${ctx.exam_type} (${ctx.month} ${ctx.year})` : "somo lake";
    // Shown to the Academic Master, so it must read as a person's name, not
    // an account handle - display ONLY the requesting teacher's full name
    // (falling back to their username only in the rare case a full name
    // was never recorded for the account), never "Name (@username)". This
    // particular message (to the Academic Master) stays in Swahili per
    // request - every other notification in the app is in English.
    const requesterName = req.user.full_name || req.user.username;
    notifyRoles({
      roles: ["academic"],
      type: "unlock_request",
      title: "Ombi la Kufunguliwa",
      message: `${requesterName} ameomba kufunguliwa (Unlock) kwa alama za ${where}.`,
      metadata: { sheet_id: Number(sheet_id), teacher_id: req.user.id, subject_id: subjectId, requested_by_username: req.user.username },
    }).catch((e) => console.error("requestUnlock notify failed:", e.message));
  } catch (err) { next(err); }
};

// ══════════════════ VIEW RESULTS ══════════════════
// A teacher's own raw scores (bypasses the "Include" filter - they must
// always see/edit their own entered marks regardless of admin approval).
const getMyScores = async (req, res, next) => {
  const { sheet_id } = req.query;
  if (!sheet_id) return res.status(400).json({ error: "sheet_id required." });
  const mySubjectIds = req.user.subject_ids || [];
  if (!mySubjectIds.length) return res.json({});
  const subjectId = req.query.subject_id ? Number(req.query.subject_id) : mySubjectIds[0];
  if (!mySubjectIds.includes(subjectId)) return res.status(403).json({ error: "Not your subject." });
  try {
    const { rows } = await query(`SELECT student_id, ROUND(marks)::INT AS marks, grade FROM scores WHERE sheet_id = $1 AND subject_id = $2`, [sheet_id, subjectId]);
    const map = {};
    rows.forEach((r) => { map[r.student_id] = { marks: r.marks, grade: r.grade }; });
    res.json(map);
  } catch (err) { next(err); }
};

const getResults = async (req, res, next) => {
  const { sheet_id } = req.query;
  if (!sheet_id) return res.status(400).json({ error: "sheet_id required." });
  try {
    const studentsRes = await query(
      `SELECT * FROM student_results WHERE sheet_id = $1 ORDER BY gender ASC, reg_no ASC NULLS LAST, student_id ASC, first_name ASC, middle_name ASC, last_name ASC`,
      [sheet_id]
    );
    const scoresRes = await query(
      `SELECT sc.student_id, sub.code AS subject_code, ROUND(sc.marks)::INT AS marks, sc.grade
       FROM included_scores sc JOIN subjects sub ON sc.subject_id = sub.id
       WHERE sc.sheet_id = $1 AND sc.marks IS NOT NULL`,
      [sheet_id]
    );
    const scoreMap = {};
    scoresRes.rows.forEach((r) => {
      if (!scoreMap[r.student_id]) scoreMap[r.student_id] = {};
      scoreMap[r.student_id][r.subject_code] = { marks: r.marks, grade: r.grade };
    });
    const subjPerfRes = await query(`SELECT * FROM subject_performance WHERE sheet_id = $1 ORDER BY sort_order ASC, subject_code ASC`, [sheet_id]);
    const teacherSubjPerfRes = await getTeacherSubjectPerformance(sheet_id);
    const divSummaryRes = await query(`SELECT gender, division, count FROM division_summary WHERE sheet_id = $1 ORDER BY gender ASC, division ASC`, [sheet_id]);
    const overallRes = await query(`SELECT * FROM school_overall_performance WHERE sheet_id = $1`, [sheet_id]);

    res.json({
      students: studentsRes.rows.map((s) => ({ ...s, scores: scoreMap[s.student_id] || {} })),
      subject_performance: subjPerfRes.rows,
      teacher_subject_performance: teacherSubjPerfRes.rows,
      division_summary: divSummaryRes.rows,
      school_overall: overallRes.rows[0] || null,
    });
  } catch (err) { next(err); }
};

const getSubmittedSheets = async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ss.id, ss.form, ss.period_id, ap.exam_type, ap.month, ap.year,
              ss.published_online, ss.published_online_at,
              COUNT(DISTINCT req_t.id) AS total_teachers,
              COUNT(DISTINCT tss.teacher_id) FILTER (WHERE tss.is_locked) AS submitted_teachers,
              MAX(tss.submitted_at) FILTER (WHERE tss.is_locked) AS submitted_at
       FROM score_sheets ss
       JOIN academic_periods ap ON ss.period_id = ap.id
       LEFT JOIN users req_t ON ss.form = ANY(req_t.assigned_forms) AND req_t.role NOT IN ('patron','matron') AND req_t.is_active = TRUE
       LEFT JOIN teacher_sheet_status tss ON tss.sheet_id = ss.id
       GROUP BY ss.id, ss.form, ss.period_id, ap.exam_type, ap.month, ap.year, ss.published_online, ss.published_online_at
       HAVING COUNT(DISTINCT tss.teacher_id) FILTER (WHERE tss.is_locked) > 0
       ORDER BY MAX(tss.submitted_at) FILTER (WHERE tss.is_locked) DESC NULLS LAST`
    );
    res.json(rows);
  } catch (err) { next(err); }
};

// PATCH /api/results-mgmt/online-publish/:sheet_id - Admin/Second Master/
// Academic Master only. Flips whether this one compiled sheet is visible on
// the public Results portal (Publications → "Results", Reg No + parent
// phone login). Nothing about the sheet's internal compilation/lock state
// changes - this only controls PARENT/STUDENT visibility.
const toggleSheetOnlinePublish = async (req, res, next) => {
  const { sheet_id } = req.params;
  const published = !!(req.body && req.body.published);
  try {
    const { rows } = await query(
      `UPDATE score_sheets
       SET published_online = $2,
           published_online_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
           published_online_by = CASE WHEN $2 THEN $3 ELSE NULL END
       WHERE id = $1
       RETURNING id, published_online, published_online_at`,
      [sheet_id, published, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Sheet not found." });
    recordAudit({
      actor: req.user, req,
      action: published ? "results.publish_online" : "results.unpublish_online",
      entityType: "score_sheet", entityId: Number(sheet_id),
      description: `Sheet #${sheet_id} ${published ? "published to" : "removed from"} the public Results portal.`,
    }).catch(() => {});
    res.json(rows[0]);
  } catch (err) { next(err); }
};

// ══════════════════════ PUBLIC RESULTS PORTAL ══════════════════════════════
// Publications → "Results" on the landing page. A parent/student logs in
// with:
//   Username: the student's permanent Admission Number, e.g.
//             S4005/0001/2025 (assigned once, at creation - see
//             assignAdmissionNo() in studentController.js).
//   Password: the parent's phone number on file (sms_parent_contacts/
//             students.parent_phone).
// IMPORTANT: this deliberately does NOT use reg_no. reg_no is form-scoped
// (two different students, in two different forms, can both be
// "S4005/0001") AND gets silently renumbered whenever that form's roster
// changes - so a login built from reg_no could quietly start showing a
// DIFFERENT student's results later. admission_no is assigned once and
// never touched again, so it's safe to hand out as a permanent credential.
// No account is ever created here - this only issues a short-lived,
// read-only token scoped to exactly one student_id. Results are VIEW ONLY
// (no download endpoint is exposed publicly), and only periods an Admin/
// Second Master/Academic Master has explicitly marked published_online
// are ever returned.
const normalizePhoneDigits = (p) => String(p || "").replace(/\D/g, "").slice(-9);

// Accepts "S4005/0001/2025" or "0001/2025" (prefix optional).
const parsePublicResultsUsername = (raw) => {
  const s = String(raw || "").trim();
  const m = s.match(/^(?:S4005\/)?(\d{3,6})\/(\d{4})$/);
  if (!m) return null;
  return { admissionNo: `S4005/${m[1]}/${m[2]}` };
};

// POST /api/public/results/check-username - lets the frontend validate the
// Admission Number BEFORE ever showing the password field, per spec.
const publicResultsCheckUsername = async (req, res, next) => {
  try {
    const parsed = parsePublicResultsUsername(req.body && req.body.username);
    if (!parsed) {
      return res.json({ valid: false, message: "Umeandika Namba ya Usajili isiyo sahihi. Tumia mfumo: S4005/0001/2025." });
    }
    const { rows } = await query(`SELECT id FROM students WHERE admission_no = $1`, [parsed.admissionNo]);
    if (!rows.length) {
      return res.json({ valid: false, message: "Umeingiza Namba ya Usajili ambayo haijasajiliwa." });
    }
    res.json({ valid: true });
  } catch (err) { next(err); }
};

// POST /api/public/results/login - { username, password }
const publicResultsLogin = async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const parsed = parsePublicResultsUsername(username);
    if (!parsed) {
      return res.status(400).json({ message: "Namba ya Usajili si sahihi. Tumia mfumo: S4005/0001/2025." });
    }
    const { rows } = await query(
      `SELECT id, first_name, middle_name, last_name, gender, form, parent_phone
       FROM students WHERE admission_no = $1`,
      [parsed.admissionNo]
    );
    if (!rows.length) {
      return res.status(404).json({ message: "Umeingiza Namba ya Usajili ambayo haijasajiliwa." });
    }
    const student = rows[0];
    if (!password || !student.parent_phone || normalizePhoneDigits(password) !== normalizePhoneDigits(student.parent_phone)) {
      return res.status(401).json({ message: "Namba ya simu na Namba ya Usajili hazilingani." });
    }
    const token = jwt.sign({ type: "public_result", student_id: student.id }, process.env.JWT_SECRET, { expiresIn: "45m" });
    res.json({
      token,
      student: {
        full_name: [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" "),
        form: student.form,
        gender: student.gender,
      },
    });
  } catch (err) { next(err); }
};

// Verifies the short-lived public-portal token (separate from the staff
// auth() middleware - this token can NEVER pass a role check since it has
// no `role`/`extra_roles` and doesn't correspond to a users.id).
const requirePublicResultToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : (req.query.token || null);
  if (!token) return res.status(401).json({ message: "Umeondoka kwenye mfumo. Tafadhali ingia tena." });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== "public_result" || !decoded.student_id) throw new Error("wrong token type");
    req.publicStudentId = decoded.student_id;
    next();
  } catch {
    return res.status(401).json({ message: "Muda wa kuingia umeisha. Tafadhali ingia tena." });
  }
};

// GET /api/public/results/me - every published_online period for the
// logged-in student, newest first. VIEW ONLY - no PDF/export route exists
// for this token type on purpose.
const publicResultsMe = async (req, res, next) => {
  try {
    const studentId = req.publicStudentId;
    const studentRes = await query(
      `SELECT id, first_name, middle_name, last_name, gender, form, reg_no FROM students WHERE id = $1`,
      [studentId]
    );
    if (!studentRes.rows.length) return res.status(404).json({ message: "Mwanafunzi hakupatikana." });
    const student = studentRes.rows[0];

    const periodsRes = await query(
      `SELECT ss.id AS sheet_id, ap.form, ap.exam_type, ap.month, ap.year
       FROM score_sheets ss JOIN academic_periods ap ON ap.id = ss.period_id
       WHERE ss.published_online = true
         AND EXISTS (SELECT 1 FROM student_results sr WHERE sr.sheet_id = ss.id AND sr.student_id = $1)
       ORDER BY ap.year DESC, ss.id DESC`,
      [studentId]
    );

    const results = [];
    for (const p of periodsRes.rows) {
      const srRes = await query(`SELECT * FROM student_results WHERE sheet_id = $1 AND student_id = $2`, [p.sheet_id, studentId]);
      if (!srRes.rows.length) continue;
      const totalRes = await query(`SELECT COUNT(*)::int AS total FROM student_results WHERE sheet_id = $1`, [p.sheet_id]);
      const scoresRes = await query(
        `SELECT sub.name AS subject_name, ROUND(sc.marks)::INT AS marks, sc.grade
         FROM included_scores sc JOIN subjects sub ON sc.subject_id = sub.id
         WHERE sc.sheet_id = $1 AND sc.student_id = $2 AND sc.marks IS NOT NULL
         ORDER BY sub.sort_order ASC, sub.code ASC`,
        [p.sheet_id, studentId]
      );
      results.push({
        sheet_id: p.sheet_id, form: p.form, exam_type: p.exam_type, month: p.month, year: p.year,
        student: { ...srRes.rows[0], total_students: totalRes.rows[0]?.total ?? null },
        scores: scoresRes.rows,
      });
    }

    res.json({
      student: {
        full_name: [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" "),
        form: student.form, gender: student.gender, reg_no: student.reg_no,
      },
      results,
    });
  } catch (err) { next(err); }
};

// GET /api/results-mgmt/my-scores/export-pdf?sheet_id=&subject_id=
// A teacher's own entered scores for one subject, as a PDF, with a POS
// (Position) column added - rank within that subject/sheet, by marks desc.
const PDFDocument = require("pdfkit");
const { drawLetterhead, drawFooter } = require("../utils/pdfHeader");
const { formatTZ } = require("../utils/tz");

// Draws vertical grid lines at every x-position in `xs` (column left edges
// plus the table's right edge), spanning from yTop to yBottom. Every table
// in every exported PDF - including the main "MATOKEO YA JUMLA" results
// table in exportResultsPdf (Reg.No / CAND NAME / SEX / AGGT / DIV / POS /
// DETAILS SUBJECTS) - uses this to get a full NECTA-style bordered grid on
// every cell (both horizontal and vertical lines), matching the on-screen
// version and the official NECTA report layout.
const drawVLines = (doc, xs, yTop, yBottom, color = "#CBD5E1") => {
  doc.strokeColor(color).lineWidth(0.5);
  xs.forEach((x) => { doc.moveTo(x, yTop).lineTo(x, yBottom).stroke(); });
  // BUG FIX: lineWidth is part of PDFKit's shared graphics state - it stays
  // at 0.5 for every stroke() called afterward until something changes it
  // again. Every horizontal row/header line elsewhere in these PDFs draws
  // with `.strokeColor(...).stroke()` and never sets its own lineWidth, so
  // it was silently inheriting whatever drawVLines left behind - making
  // horizontal lines thinner (and the whole document look less crisp) from
  // the first vertical-line call onward. Reset to the standard 1pt here so
  // every horizontal line stays exactly as thick as it was meant to be.
  doc.lineWidth(1);
};

// BUG FIX: every zebra/tinted row in these report tables fills its
// background a couple of points ABOVE its own text baseline (for a little
// breathing room). That's exactly enough for row N+1's fill to paint over
// the horizontal grid line that was drawn right under row N - so every
// other row separator (and the header's own bottom border) was silently
// vanishing the moment the next row was filled in. This was invisible on
// screen (the on-screen HTML table draws real <table> borders, which don't
// have this problem) but made the exported PDF look like it had no
// horizontal lines at all.
// Fix: never stroke a horizontal line the moment a row is drawn. Instead,
// collect its Y position here and draw every collected line in one final
// pass, AFTER every row fill on that page is already down - guaranteeing
// the line is the very last thing painted at that Y and can never be
// covered again. (Same pattern already used by exportTeacherEvaluationPdf's
// rowLineYs - this just makes it reusable for every table below.)
const flushHLines = (doc, ys, x1, x2, color) => {
  ys.forEach((ly) => { doc.moveTo(x1, ly).lineTo(x2, ly).strokeColor(color).stroke(); });
  ys.length = 0;
};

// ── Groove (3D/embossed) grid-line variants of drawVLines/flushHLines ──
// Used ONLY by the DIVISION PERFORMANCE SUMMARY and main results table in
// exportResultsPdf (see NECTA_BORDER_LIGHT/DARK above for why). Each grid
// line is drawn as two adjacent 0.5pt hairlines instead of one 0.5pt line:
// a dark one first, then a light one offset by ~0.4pt, so the pair reads as
// a single carved-in ("grooved") line rather than a flat one - the vector
// equivalent of CSS's `border-style: groove`.
const drawVLinesGroove = (doc, xs, yTop, yBottom) => {
  doc.lineWidth(0.5);
  xs.forEach((x) => {
    doc.strokeColor(NECTA_BORDER_DARK).moveTo(x - 0.4, yTop).lineTo(x - 0.4, yBottom).stroke();
    doc.strokeColor(NECTA_BORDER_LIGHT).moveTo(x + 0.4, yTop).lineTo(x + 0.4, yBottom).stroke();
  });
  doc.lineWidth(1);
};
const flushHLinesGroove = (doc, ys, x1, x2) => {
  doc.lineWidth(0.5);
  ys.forEach((ly) => {
    doc.strokeColor(NECTA_BORDER_DARK).moveTo(x1, ly - 0.4).lineTo(x2, ly - 0.4).stroke();
    doc.strokeColor(NECTA_BORDER_LIGHT).moveTo(x1, ly + 0.4).lineTo(x2, ly + 0.4).stroke();
  });
  ys.length = 0;
  doc.lineWidth(1);
};

const exportMyScoresPdf = async (req, res, next) => {
  const { sheet_id, subject_id } = req.query;
  if (!sheet_id || !subject_id) return res.status(400).json({ error: "sheet_id and subject_id required." });
  const mySubjectIds = req.user.subject_ids || [];
  if (!mySubjectIds.includes(Number(subject_id)))
    return res.status(403).json({ error: "Not your subject." });
  try {
    const sheetRes = await query(
      `SELECT ss.*, ap.exam_type, ap.month, ap.year FROM score_sheets ss JOIN academic_periods ap ON ap.id = ss.period_id WHERE ss.id = $1`,
      [sheet_id]
    );
    const sheet = sheetRes.rows[0];
    if (!sheet) return res.status(404).json({ error: "Sheet not found." });
    const subjRes = await query(`SELECT name FROM subjects WHERE id = $1`, [subject_id]);
    const subjectName = subjRes.rows[0]?.name || "Subject";

    // POS is still ranked by marks (desc; NULL marks rank last), but the
    // printed/saved list itself always stays in ascending Registration
    // Number order - POS is just a value in its own column, it never
    // reorders the names.
    const { rows } = await query(
      `SELECT st.id, st.first_name, st.middle_name, st.last_name, st.reg_no, st.gender,
              ROUND(sc.marks)::INT AS marks, sc.grade,
              RANK() OVER (ORDER BY sc.marks DESC NULLS LAST) AS pos
       FROM students st
       LEFT JOIN scores sc ON sc.student_id = st.id AND sc.sheet_id = $1 AND sc.subject_id = $2
       WHERE st.form = $3 AND st.status = 'Active'
       ORDER BY st.reg_no ASC NULLS LAST, st.id ASC, st.first_name ASC`,
      [sheet_id, subject_id, sheet.form]
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${subjectName}-${sheet.form}-scores.pdf"`);
    const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
    doc.pipe(res);
    // Title reads as two lines: "FORM III MONTHLY TEST - AUGUST 2026" then
    // "SUBJECT: GEOGRAPHY" - kept as one string with drawLetterhead so the
    // continuation page (below) can reuse the exact same two lines.
    const scoreSheetTitle = `${sheet.form} ${sheet.exam_type} - ${sheet.month} ${sheet.year}`.toUpperCase();
    const scoreSheetSubjectLine = `SUBJECT: ${subjectName.toUpperCase()}`;
    drawLetterhead(doc, `${scoreSheetTitle}\n${scoreSheetSubjectLine}`);

    const colX = [40, 130, 340, 380, 450, 500];
    const tableRight = 552;
    const headers = ["Reg.No", "Name", "Sex", "Score", "Grade", "POS"];
    const tableTop = doc.y;
    doc.rect(40, tableTop - 4, 512, 18).fill("#F1F5F9");
    doc.fillColor("#334155").fontSize(9).font("Helvetica-Bold");
    headers.forEach((h, idx) => doc.text(h, colX[idx] + 4, tableTop, { width: (colX[idx + 1] || 552) - colX[idx] - 6 }));
    let y = tableTop + 18;
    doc.moveTo(40, y).lineTo(552, y).strokeColor("#94A3B8").stroke();
    drawVLines(doc, [...colX, tableRight], tableTop - 4, y, "#94A3B8");

    doc.font("Helvetica").fillColor("#0F172A");
    rows.forEach((r, idx) => {
      if (y > 760) { doc.addPage({ margin: 40, size: "A4" }); drawLetterhead(doc, `${scoreSheetTitle}\n${scoreSheetSubjectLine} (CONT.)`); y = doc.y + 10; doc.moveTo(40, y).lineTo(552, y).strokeColor("#94A3B8").stroke(); }
      const rowTop = y;
      if (idx % 2 === 0) doc.rect(40, y - 3, 512, 16).fill("#F8FAFC").fillColor("#0F172A");
      const name = [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ");
      const vals = [r.reg_no || r.id || "-", name, sexLabel(r.gender), r.marks ?? "-", r.grade || "-", r.marks == null ? "-" : r.pos];
      vals.forEach((v, i2) => doc.fontSize(8.5).fillColor("#0F172A").text(String(v), colX[i2] + 4, y, { width: (colX[i2 + 1] || 552) - colX[i2] - 6 }));
      y += 16;
      // Every row gets its own bottom border line, so the table reads as a
      // proper grid instead of text floating with no visible row ends.
      doc.moveTo(40, y - 1).lineTo(552, y - 1).strokeColor("#E2E8F0").stroke();
      drawVLines(doc, [...colX, tableRight], rowTop - 3, y - 1, "#E2E8F0");
    });
    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

// ══════════════════ ONE STUDENT'S RESULTS (Students Management "Search
// Results" for Admin/Second Master, and Results Management "Search Student
// Results" for the Academic Master) ══════════════════
// GET /api/results-mgmt/student-periods?student_id= - every exam period
// (any form/year - a student may have moved forms) where this student has
// a computed/included result, so the Form/Exam Type/Month/Year pickers on
// the frontend only ever offer choices that actually have data.
const getStudentPeriods = async (req, res, next) => {
  const { student_id } = req.query;
  if (!student_id) return res.status(400).json({ error: "student_id required." });
  try {
    const { rows } = await query(
      `SELECT DISTINCT ss.id AS sheet_id, ap.id AS period_id, ap.form, ap.exam_type, ap.month, ap.year
       FROM score_sheets ss
       JOIN academic_periods ap ON ap.id = ss.period_id
       WHERE EXISTS (SELECT 1 FROM student_results sr WHERE sr.sheet_id = ss.id AND sr.student_id = $1)
       ORDER BY ap.year DESC, ap.form ASC, ap.exam_type ASC, ap.month ASC`,
      [student_id]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

// GET /api/results-mgmt/student-result?sheet_id=&student_id= - one
// student's compiled result for one period: their student_results row plus
// every included, marked subject (same "Include in Results" gate as the
// full class view - never bypassed).
const getStudentResult = async (req, res, next) => {
  const { sheet_id, student_id } = req.query;
  if (!sheet_id || !student_id) return res.status(400).json({ error: "sheet_id and student_id required." });
  try {
    const sheetRes = await query(
      `SELECT ss.*, ap.exam_type, ap.month, ap.year FROM score_sheets ss JOIN academic_periods ap ON ap.id = ss.period_id WHERE ss.id = $1`,
      [sheet_id]
    );
    const sheet = sheetRes.rows[0];
    if (!sheet) return res.status(404).json({ error: "Period not found." });

    const studentRes = await query(`SELECT * FROM student_results WHERE sheet_id = $1 AND student_id = $2`, [sheet_id, student_id]);
    if (!studentRes.rows.length) return res.status(404).json({ error: "No results found for this student in the selected period." });

    // Class size for the "X out of Y" position display - same population
    // `position` itself was RANK()'d over in the student_results view, so
    // the two always agree.
    const totalRes = await query(`SELECT COUNT(*)::int AS total FROM student_results WHERE sheet_id = $1`, [sheet_id]);
    const totalStudents = totalRes.rows[0]?.total ?? null;

    const scoresRes = await query(
      `SELECT sub.code AS subject_code, sub.name AS subject_name, ROUND(sc.marks)::INT AS marks, sc.grade
       FROM included_scores sc JOIN subjects sub ON sc.subject_id = sub.id
       WHERE sc.sheet_id = $1 AND sc.student_id = $2 AND sc.marks IS NOT NULL
       ORDER BY sub.sort_order ASC, sub.code ASC`,
      [sheet_id, student_id]
    );

    res.json({ sheet, student: { ...studentRes.rows[0], total_students: totalStudents, scores: scoresRes.rows } });
  } catch (err) { next(err); }
};

// ══════════════════ ONE STUDENT'S TREND - ANALYTICS DASHBOARD ══════════════════
// GET /api/results-mgmt/student-trend?student_id=&subject_id=
// Restricted to admin/second_master/academic (same three roles that can see
// the Analytics Dashboard's per-student panel) - a Class Teacher, for
// instance, does not get this even though they DO get getStudentPeriods/
// getStudentResult elsewhere for their own class's report cards.
//
// Unlike getStudentPeriods (which only lists periods, for a picker), this
// returns the FULL GPA history across every period the student has an
// included result in - any form/year, since a student may have moved forms -
// plus, optionally, one subject's mark history for the same periods.
//
// Also returns a simple trend-based PROJECTION of next period's GPA (linear
// extrapolation over the existing points - NOT a machine-learning model).
// This is deliberate: with only a handful of exam periods per student, a
// "real" predictive model would be trained on almost no data and could
// easily look more confident than it deserves. A transparent trend-line
// projection is honest about being a rough guide, not a verdict - the
// frontend must label it as a "kadirio" (estimate), never a certainty, and
// this endpoint refuses to project at all (reason: "insufficient_data")
// below MIN_POINTS_FOR_PROJECTION periods, rather than guessing from noise.
const MIN_POINTS_FOR_PROJECTION = 3;

// Ordinary least-squares slope/intercept over (index, gpa) pairs, then
// evaluated one step past the last known point. GPA here is 1=best (Grade
// A) .. 5=worst (Grade F) - see grade_to_points/points_to_avg_grade - so a
// NEGATIVE slope means grades are IMPROVING, not declining.
const projectNextGpa = (series) => {
  const vals = series.map((s) => s.gpa).filter((v) => v != null);
  if (vals.length < MIN_POINTS_FOR_PROJECTION) {
    return { predicted_gpa: null, slope: null, reason: "insufficient_data" };
  }
  const n = vals.length;
  const xs = vals.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = vals.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * vals[i], 0);
  const sumX2 = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { predicted_gpa: null, slope: null, reason: "insufficient_data" };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  // GPA scale is bounded 1.0–5.0 (see gpa_to_competency) - a raw trend-line
  // extension has no such ceiling/floor, so it's clamped to stay meaningful.
  const raw = slope * n + intercept;
  const predicted_gpa = Math.round(Math.min(5, Math.max(1, raw)) * 100) / 100;
  return { predicted_gpa, slope: Math.round(slope * 1000) / 1000, reason: null };
};

// Same "compare average of first half vs second half of the series" logic
// as getResultsAnalytics's trendDirection - kept as a local copy (rather
// than exported/shared) since the two independently evolved slightly
// different callers; duplicating ~10 lines here is simpler than coupling
// them for a helper this small.
const studentTrendDirection = (series, key, lowerIsBetter = false) => {
  const vals = series.map((s) => s[key]).filter((v) => v != null);
  if (vals.length < 2) return "insufficient_data";
  const mid = Math.ceil(vals.length / 2);
  const firstAvg = vals.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
  const secondAvg = vals.slice(mid).reduce((a, b) => a + b, 0) / (vals.length - mid);
  const diff = secondAvg - firstAvg;
  const threshold = 0.05;
  if (Math.abs(diff) < threshold) return "stable";
  const improving = lowerIsBetter ? diff < 0 : diff > 0;
  return improving ? "improving" : "declining";
};

// Division is categorical ("I".."IV", "0"), not numeric, but the trend
// direction and chart both need an order - I is best, 0 is worst, same
// "lower is better" shape as GPA.
const DIVISION_RANK = { I: 1, II: 2, III: 3, IV: 4, "0": 5 };
const divisionToRank = (d) => (d != null && DIVISION_RANK[d] != null ? DIVISION_RANK[d] : null);

const getStudentTrend = async (req, res, next) => {
  const { student_id, subject_id } = req.query;
  if (!student_id) return res.status(400).json({ error: "student_id required." });
  // A Teacher may only drill down into subjects they teach (per their
  // subject_ids in User Accounts) - not every subject the student has.
  const isTeacher = req.user.role === "teacher";
  const myScopedSubjectIds = (req.user.subject_ids || []).map(Number);
  if (isTeacher && subject_id && !myScopedSubjectIds.includes(Number(subject_id))) {
    return res.status(403).json({ error: "You can only view subjects you teach." });
  }
  try {
    const studentRes = await query(
      `SELECT id, first_name, middle_name, last_name, reg_no, gender, form,
              CONCAT_WS(' ', first_name, middle_name, last_name) AS full_name
       FROM students WHERE id = $1`,
      [student_id]
    );
    if (!studentRes.rows.length) return res.status(404).json({ error: "Student not found." });

    const overallRes = await query(
      `SELECT sr.sheet_id, ap.id AS period_id, ap.form, ap.exam_type, ap.month, ap.year,
              sr.gpa, sr.division, sr.position,
              (SELECT COUNT(*) FROM student_results sr2 WHERE sr2.sheet_id = sr.sheet_id) AS total_students
       FROM student_results sr
       JOIN score_sheets ss ON ss.id = sr.sheet_id
       JOIN academic_periods ap ON ap.id = ss.period_id
       WHERE sr.student_id = $1
       ORDER BY ap.year ASC, ap.id ASC`,
      [student_id]
    );
    const overallTrend = overallRes.rows.map((r) => ({
      sheet_id: r.sheet_id, period_id: r.period_id, form: r.form,
      exam_type: r.exam_type, month: r.month, year: r.year,
      label: `${r.exam_type}, ${r.month} ${r.year}`,
      gpa: r.gpa != null ? Number(r.gpa) : null,
      division: r.division,
      division_rank: divisionToRank(r.division),
      position: r.position != null ? Number(r.position) : null,
      total_students: Number(r.total_students) || null,
    }));

    // Every subject this student has at least one included, marked score
    // for, across ALL periods - powers the subject picker for drill-down.
    // A Teacher only ever sees the subjects they themselves teach.
    const subjectsRes = await query(
      `SELECT DISTINCT sub.id, sub.name, sub.code, sub.sort_order
       FROM included_scores sc
       JOIN subjects sub ON sub.id = sc.subject_id
       WHERE sc.student_id = $1 AND sc.marks IS NOT NULL
       ${isTeacher ? "AND sub.id = ANY($2)" : ""}
       ORDER BY sub.sort_order ASC, sub.name ASC`,
      isTeacher ? [student_id, myScopedSubjectIds] : [student_id]
    );

    let subjectTrend = [];
    let subjectMeta = null;
    if (subject_id) {
      const subjRes = await query(
        `SELECT ap.id AS period_id, ap.form, ap.exam_type, ap.month, ap.year, sc.marks, sc.grade
         FROM included_scores sc
         JOIN score_sheets ss ON ss.id = sc.sheet_id
         JOIN academic_periods ap ON ap.id = ss.period_id
         WHERE sc.student_id = $1 AND sc.subject_id = $2 AND sc.marks IS NOT NULL
         ORDER BY ap.year ASC, ap.id ASC`,
        [student_id, subject_id]
      );
      subjectTrend = subjRes.rows.map((r) => ({
        period_id: r.period_id, form: r.form, exam_type: r.exam_type, month: r.month, year: r.year,
        label: `${r.exam_type}, ${r.month} ${r.year}`,
        marks: r.marks != null ? Number(r.marks) : null,
        grade: r.grade,
      }));
      const found = subjectsRes.rows.find((s) => Number(s.id) === Number(subject_id));
      subjectMeta = found ? { id: found.id, name: found.name, code: found.code } : null;
    }

    res.json({
      student: studentRes.rows[0],
      subjects: subjectsRes.rows,
      overallTrend,
      overallTrendDirection: studentTrendDirection(overallTrend, "gpa", true),
      divisionTrendDirection: studentTrendDirection(overallTrend, "division_rank", true),
      projection: projectNextGpa(overallTrend),
      subjectMeta,
      subjectTrend,
      subjectTrendDirection: subject_id ? studentTrendDirection(subjectTrend, "marks", false) : null,
    });
  } catch (err) { next(err); }
};

// Renders one student's report-card style PDF into a Buffer (shared by the
// export endpoint below - the exact same bytes are streamed to the browser
// AND uploaded to Cloudinary, so the two never drift apart).
const renderStudentResultPdfBuffer = (sheet, student) =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
      const buffers = [];
      doc.on("data", (d) => buffers.push(d));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      // Whole-page light-blue backdrop - same NECTA_SUMMARY_BG fill used by
      // exportResultsPdf and the Parent Report, drawn first (and again on
      // any continuation page below) so every page of this export gets the
      // full-bleed blue background instead of plain white, with the
      // cream/yellow subject table sitting on top of it.
      const paintPageBg = () => { doc.rect(0, 0, doc.page.width, doc.page.height).fill(NECTA_SUMMARY_BG); };
      paintPageBg();

      // Heading - ALL CAPS, in the exact "STUDENT RESULTS : FORM III
      // -MONTHLY TEST (AUGUST - 2026)" layout requested, built from the
      // period's own form/exam_type/month/year so it stays correct for
      // every exam type/month/year, not just this one.
      drawLetterhead(doc, `STUDENT RESULTS : ${String(sheet.form).toUpperCase()} -${String(sheet.exam_type).toUpperCase()} (${String(sheet.month).toUpperCase()} - ${sheet.year})`);

      // ── Student identity block - NAME on its own line, then a bordered
      // 2-row table (header: Reg./Adm. No | Sex | CLASS) matching the
      // school's own handwritten admission-slip format, instead of the
      // previous plain "Reg./Adm. No: ... | Sex: ... | Form: ..." text line.
      let y = doc.y + 4;
      doc.fontSize(10.5).font("Helvetica-Bold").fillColor(NECTA_TEXT);
      doc.text(`NAME: ${student.full_name}`, 40, y);
      y += 20;

      const idHeaders = ["Reg./Adm. No", "Sex", "CLASS"];
      const idColWidths = [150, 70, 130];
      const idColX = [40, 40 + idColWidths[0], 40 + idColWidths[0] + idColWidths[1]];
      const idTableRight = idColX[2] + idColWidths[2];
      const idValues = [student.reg_no || student.student_id || "-", sexLabel(student.gender), student.form];
      const idRowH = 18;
      const idTop = y;

      // NECTA-style cream/yellow identity table - header band in
      // NECTA_HEAD_BG, value row in NECTA_BG, same navy text/borders the
      // Parent Report uses, instead of the previous plain white/navy box.
      doc.rect(40, idTop, idTableRight - 40, idRowH).fillColor(NECTA_HEAD_BG).fill();
      doc.fontSize(9).font("Helvetica-Bold").fillColor(NECTA_TEXT);
      idHeaders.forEach((h, i) => doc.text(h, idColX[i] + 6, y + 4, { width: idColWidths[i] - 10 }));
      y += idRowH;
      const idMid = y;
      doc.rect(40, idMid, idTableRight - 40, idRowH).fillColor(NECTA_BG).fill();
      doc.fontSize(9.5).font("Helvetica").fillColor(NECTA_TEXT);
      idValues.forEach((v, i) => doc.text(String(v), idColX[i] + 6, y + 4, { width: idColWidths[i] - 10 }));
      y += idRowH;
      const idBottom = y;

      // Outer box + column dividers + the header/value row divider.
      doc.strokeColor(NECTA_BORDER).lineWidth(1);
      doc.rect(40, idTop, idTableRight - 40, idBottom - idTop).stroke();
      doc.moveTo(40, idMid).lineTo(idTableRight, idMid).stroke();
      idColX.slice(1).forEach((x) => { doc.moveTo(x, idTop).lineTo(x, idBottom).stroke(); });
      y += 14;

      // ── Subjects table - same NECTA cream/yellow header + alternating
      // cream row fill, navy text, blue-gray grid as the Parent Report,
      // instead of the previous navy header/white text look. ──
      const colX = [40, 300, 400, 470];
      const tableRight = 512;
      const headers = ["SUBJECT", "MARKS", "GRADE"];
      const headerTop = y;
      doc.rect(40, y - 4, 472, 18).fillColor(NECTA_HEAD_BG).fill();
      doc.fillColor(NECTA_TEXT).fontSize(9.5).font("Helvetica-Bold");
      doc.text(headers[0], colX[0] + 6, y, { width: colX[1] - colX[0] - 8 });
      doc.text(headers[1], colX[1] + 6, y, { width: colX[2] - colX[1] - 8 });
      doc.text(headers[2], colX[2] + 6, y, { width: colX[3] - colX[2] - 8 });
      y += 18;
      doc.moveTo(40, y).lineTo(512, y).strokeColor(NECTA_BORDER).stroke();
      drawVLines(doc, [...colX, tableRight], headerTop - 4, y, NECTA_BORDER);

      doc.font("Helvetica").fillColor(NECTA_TEXT);
      (student.scores || []).forEach((sc, idx) => {
        if (y > 740) { doc.addPage({ margin: 40, size: "A4" }); paintPageBg(); drawLetterhead(doc, `${student.full_name} - Result (cont.)`); y = doc.y; doc.moveTo(40, y).lineTo(512, y).strokeColor(NECTA_BORDER).stroke(); }
        const rowTop = y;
        doc.rect(40, y - 3, 472, 16).fillColor(idx % 2 === 0 ? NECTA_HEAD_BG : NECTA_BG).fill();
        doc.fillColor(NECTA_TEXT);
        doc.fontSize(9).text(sc.subject_name, colX[0] + 6, y, { width: colX[1] - colX[0] - 8 });
        doc.text(sc.marks == null ? "-" : String(sc.marks), colX[1] + 6, y, { width: colX[2] - colX[1] - 8 });
        doc.text(sc.grade || "-", colX[2] + 6, y, { width: colX[3] - colX[2] - 8 });
        y += 16;
        // Every subject row gets its own bottom line - no more floating text.
        doc.moveTo(40, y - 1).lineTo(512, y - 1).strokeColor(NECTA_BORDER).stroke();
        drawVLines(doc, [...colX, tableRight], rowTop - 3, y - 1, NECTA_BORDER);
      });
      y += 16;

      // ── Summary block ──
      doc.font("Helvetica-Bold").fontSize(10).fillColor(NECTA_TEXT).text("SUMMARY", 40, y);
      y += 16;
      doc.font("Helvetica").fontSize(9.5).fillColor(NECTA_TEXT);
      const summaryLines = [
        `Division: ${student.division ?? "-"}`,
        `Points: ${student.points ?? "-"}`,
        `Position: ${student.position != null && student.total_students != null ? `${student.position} out of ${student.total_students}` : (student.position ?? "-")}`,
        `Average Grade: ${student.avg_grade ?? "-"}`,
        `GPA: ${student.gpa ?? "-"}`,
        `Subjects Sat: ${student.subjects_sat ?? "-"}`,
      ];
      summaryLines.forEach((line) => { doc.text(line, 40, y); y += 15; });

      drawFooter(doc, formatTZ);
      doc.end();
    } catch (err) { reject(err); }
  });

// GET /api/results-mgmt/student-result/export-pdf?sheet_id=&student_id= -
// generates the PDF, uploads the SAME bytes to Cloudinary under a
// deterministic public_id (so re-exporting overwrites rather than piling
// up), records/updates the row in student_result_pdfs, then streams the
// PDF back to the browser. Uploading is best-effort - if Cloudinary is
// unreachable the person still gets their PDF; it just won't have been
// archived that time.
const exportStudentResultPdf = async (req, res, next) => {
  const { sheet_id, student_id } = req.query;
  if (!sheet_id || !student_id) return res.status(400).json({ error: "sheet_id and student_id required." });
  try {
    const sheetRes = await query(
      `SELECT ss.*, ap.exam_type, ap.month, ap.year FROM score_sheets ss JOIN academic_periods ap ON ap.id = ss.period_id WHERE ss.id = $1`,
      [sheet_id]
    );
    const sheet = sheetRes.rows[0];
    if (!sheet) return res.status(404).json({ error: "Period not found." });

    const studentRes = await query(`SELECT * FROM student_results WHERE sheet_id = $1 AND student_id = $2`, [sheet_id, student_id]);
    if (!studentRes.rows.length) return res.status(404).json({ error: "No results found for this student in the selected period." });

    const totalRes = await query(`SELECT COUNT(*)::int AS total FROM student_results WHERE sheet_id = $1`, [sheet_id]);
    const totalStudents = totalRes.rows[0]?.total ?? null;

    const scoresRes = await query(
      `SELECT sub.code AS subject_code, sub.name AS subject_name, ROUND(sc.marks)::INT AS marks, sc.grade
       FROM included_scores sc JOIN subjects sub ON sc.subject_id = sub.id
       WHERE sc.sheet_id = $1 AND sc.student_id = $2 AND sc.marks IS NOT NULL
       ORDER BY sub.sort_order ASC, sub.code ASC`,
      [sheet_id, student_id]
    );
    const student = { ...studentRes.rows[0], total_students: totalStudents, scores: scoresRes.rows };
    const pdfBuffer = await renderStudentResultPdfBuffer(sheet, student);

    try {
      const { uploadBufferToCloudinary } = require("../middleware/upload");
      const uploaded = await uploadBufferToCloudinary(pdfBuffer, {
        folder: "mikumbi/student-results",
        resource_type: "raw",
        // See the .pdf note in publishResult() below - raw uploads need
        // the extension in public_id or the delivered file won't open.
        public_id: `student-${student_id}-sheet-${sheet_id}.pdf`,
      });
      await query(
        `INSERT INTO student_result_pdfs (student_id, sheet_id, form, exam_type, month, year, pdf_url, public_id, file_size, generated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (student_id, sheet_id) DO UPDATE SET
           pdf_url = EXCLUDED.pdf_url, public_id = EXCLUDED.public_id, file_size = EXCLUDED.file_size,
           generated_by = EXCLUDED.generated_by, created_at = NOW()`,
        [student_id, sheet_id, sheet.form, sheet.exam_type, sheet.month, sheet.year, uploaded.secure_url, uploaded.public_id, pdfBuffer.length, req.user.id]
      );
    } catch (cloudErr) {
      console.error("Cloudinary archive of student result PDF failed (PDF still returned to the browser):", cloudErr.message);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${(student.full_name || "student").replace(/\s+/g, "-")}-${sheet.form}-${sheet.exam_type}-result.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
};

const getTeacherStatus = async (req, res, next) => {
  const { form, exam_type, month, year } = req.query;
  try {
    const { rows } = await query(
      `SELECT u.id, u.full_name, u.assigned_forms, s.id AS subject_id, s.code AS subject_code, s.name AS subject_name, s.sort_order,
              ss.id AS sheet_id, COALESCE(tss.is_locked, FALSE) AS submitted,
              COALESCE(tss.included_in_results, FALSE) AS included_in_results, tss.submitted_at AS submitted_at,
              COALESCE(ur.status = 'pending', FALSE) AS pending_unlock_request
       FROM users u
       JOIN subjects s ON s.id = ANY(u.subject_ids)
       LEFT JOIN academic_periods ap ON ap.form = ANY(u.assigned_forms)
         AND ($2::text IS NULL OR ap.exam_type = $2) AND ($3::text IS NULL OR ap.month = $3) AND ($4::text IS NULL OR ap.year::text = $4)
       LEFT JOIN score_sheets ss ON ss.period_id = ap.id AND ss.form = ap.form
       LEFT JOIN teacher_sheet_status tss ON tss.sheet_id = ss.id AND tss.teacher_id = u.id AND tss.subject_id = s.id
       LEFT JOIN unlock_requests ur ON ur.sheet_id = ss.id AND ur.teacher_id = u.id AND ur.subject_id = s.id AND ur.status = 'pending'
       WHERE u.is_active = TRUE AND ($1::text IS NULL OR $1 = ANY(u.assigned_forms))
       ORDER BY s.sort_order ASC, u.full_name ASC`,
      [form || null, exam_type || null, month || null, year || null]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

// ══════════════════ TEACHERS EVALUATION (Admin only) ══════════════════
// A per-teacher, per-exam appraisal sheet: Admin picks Form/Exam
// Type/Month/Year, then a teacher - every subject THAT teacher is assigned
// (usually one, sometimes two) shows its full grade breakdown for that
// class/exam, reusing the exact same already-aggregated subject_performance
// view as the rest of Results Management (never recomputed by hand), with
// subject_performance.subject_rank exposed as POS - the subject's own
// ranking against every other subject sat in that same exam.

// GET /api/results-mgmt/teacher-evaluation/teachers?form= - teachers
// eligible for the picker: anyone assigned to that class with at least one
// subject (patrons/matrons have no subject, so they never appear here).
const getTeacherEvaluationTeachers = async (req, res, next) => {
  const { form } = req.query;
  if (!form) return res.status(400).json({ error: "form required." });
  try {
    const { rows } = await query(
      `SELECT DISTINCT u.id, u.full_name
       FROM users u
       WHERE u.is_active = TRUE AND $1 = ANY(u.assigned_forms)
         AND u.subject_ids IS NOT NULL AND array_length(u.subject_ids, 1) > 0
         AND u.role NOT IN ('patron','matron')
       ORDER BY u.full_name ASC`,
      [form]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

// Finds the most recent OTHER exam period for this Form that happened
// strictly before the given one, and that actually has a score sheet on
// record. Ordered by (year, calendar-month) first, but when TWO exams
// fall in the SAME month (e.g. a Monthly Test and a Mid-Term both in
// August) that alone can't tell them apart - there's no "day of exam"
// field - so created_at (the order the periods were set up in the system,
// which tracks the order the exams actually happened in) breaks the tie.
// Used to build the "ufaulu umeongezeka/umepungua" comparison below.
async function findPreviousPeriodWithSheet(form, currentPeriodId, currentYear, currentMonth) {
  const currentRes = await query(`SELECT created_at FROM academic_periods WHERE id = $1`, [currentPeriodId]);
  const currentCreatedAt = currentRes.rows[0]?.created_at ? new Date(currentRes.rows[0].created_at) : null;

  const { rows } = await query(
    `SELECT ap.id, ap.exam_type, ap.month, ap.year, ap.created_at, ss.id AS sheet_id
     FROM academic_periods ap
     JOIN score_sheets ss ON ss.period_id = ap.id AND ss.form = ap.form
     WHERE ap.form = $1 AND ap.id != $2`,
    [form, currentPeriodId]
  );
  const currentMonthIdx = EN_MONTHS.indexOf(currentMonth);
  const candidates = rows
    .map((r) => ({ ...r, monthIdx: EN_MONTHS.indexOf(r.month), createdAt: new Date(r.created_at) }))
    .filter((r) => {
      if (r.year !== currentYear) return r.year < currentYear;
      if (r.monthIdx !== currentMonthIdx) return r.monthIdx < currentMonthIdx;
      // Same year, same month - only "before" if it was actually set up
      // earlier than the currently-selected period.
      return currentCreatedAt ? r.createdAt < currentCreatedAt : false;
    })
    .sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      if (b.monthIdx !== a.monthIdx) return b.monthIdx - a.monthIdx;
      return b.createdAt - a.createdAt;
    });
  return candidates[0] || null;
}

// Builds the Kiswahili "ULINGANISHO WA UFAULU" comparison shown under the
// Teacher Assessment table - one line per subject the teacher is being
// assessed on, comparing THIS period's overall PASS % against the same
// subject's PASS % in the most recent prior exam period for the same
// Form (whatever Exam Type that was - the comparison is against "the
// previous exam", not specifically the same Exam Type). Both
// getTeacherEvaluation (on-screen preview) and exportTeacherEvaluationPdf
// render these same lines, so the PDF never disagrees with the preview.
async function buildPerformanceComparison(form, currentPeriodId, currentYear, currentMonth, subjects) {
  const prev = await findPreviousPeriodWithSheet(form, currentPeriodId, currentYear, currentMonth);
  if (!prev) {
    return { previousPeriod: null, lines: [`Hakuna Mtihani uliopita wa ${form} wenye matokeo, kwa hiyo ulinganisho wa ufaulu haupatikani bado.`] };
  }
  const subjectIds = subjects.map((s) => s.subject_id);
  const prevPerf = subjectIds.length ? await getTeacherSubjectPerformance(prev.sheet_id, subjectIds) : { rows: [] };
  const prevBySubject = {};
  prevPerf.rows.forEach((r) => { prevBySubject[r.subject_id] = r; });

  const prevLabel = `${prev.exam_type} ${prev.month} ${prev.year}`;
  const lines = subjects.map((sp) => {
    const prevRow = prevBySubject[sp.subject_id];
    if (!prevRow || prevRow.pass_pct == null) {
      return `${sp.subject_name}: Hakuna taarifa ya kulinganisha - somo hili halikuwa na matokeo kwenye ${prevLabel}.`;
    }
    const cur = Number(sp.pass_pct) || 0;
    const prevPct = Number(prevRow.pass_pct) || 0;
    const delta = Math.round((cur - prevPct) * 10) / 10;
    if (delta > 0) {
      return `${sp.subject_name}: Ufaulu umeongezeka kwa asilimia ${delta.toFixed(1)} (kutoka ${prevPct.toFixed(1)}% hadi ${cur.toFixed(1)}%) ukilinganisha na ${prevLabel}.`;
    }
    if (delta < 0) {
      return `${sp.subject_name}: Ufaulu umepungua kwa asilimia ${Math.abs(delta).toFixed(1)} (kutoka ${prevPct.toFixed(1)}% hadi ${cur.toFixed(1)}%) ukilinganisha na ${prevLabel}.`;
    }
    return `${sp.subject_name}: Ufaulu haujabadilika (bado ni asilimia ${cur.toFixed(1)}%) ukilinganisha na ${prevLabel}.`;
  });
  return { previousPeriod: prev, lines: lines.length ? lines : ["Hakuna somo la kulinganisha kwa mwalimu huyu kwa sasa."] };
}

// Shared by the on-screen preview (getTeacherEvaluation) and the PDF export
// below - the exact same rows feed both, so the download never looks
// different from what was previewed on screen first.
const gatherTeacherEvaluationData = async (form, exam_type, month, year, teacher_id) => {
  const periodRes = await query(
    `SELECT * FROM academic_periods WHERE form=$1 AND exam_type=$2 AND month=$3 AND year=$4`,
    [form, exam_type, month, Number(year)]
  );
  if (!periodRes.rows.length) return { error: "No exam period found for this Form, Exam Type, Month and Year yet." };
  const period = periodRes.rows[0];

  const sheetRes = await query(`SELECT id FROM score_sheets WHERE period_id=$1 AND form=$2`, [period.id, form]);
  if (!sheetRes.rows.length) return { error: "No score sheet found for this exam period yet." };
  const sheet_id = sheetRes.rows[0].id;

  const teacherRes = await query(`SELECT id, full_name, subject_ids FROM users WHERE id = $1 AND is_active = TRUE`, [teacher_id]);
  if (!teacherRes.rows.length) return { error: "Teacher not found." };
  const teacher = teacherRes.rows[0];
  const subjectIds = teacher.subject_ids || [];

  // BUG FIX (critical): a teacher can be ASSIGNED to a subject on this
  // Darasa without ever having filled in / submitted (locked) their marks
  // to the Academic Master for THIS specific exam period. Previously this
  // function pulled every subject the teacher is merely assigned to and
  // joined it straight onto subject_performance - which is aggregated per
  // (sheet, subject), NOT per teacher. So when two different teachers are
  // both assigned the same subject on the same class (e.g. two Kiswahili
  // teachers on Form III), and only ONE of them had actually submitted
  // marks for this period, BOTH teachers' evaluations showed the exact
  // same numbers - including the one who had submitted nothing at all.
  //
  // Fix: only ever show a subject on this teacher's evaluation if THIS
  // teacher's own teacher_sheet_status row for (sheet_id, teacher_id,
  // subject_id) has included_in_results = TRUE - the exact same gate
  // getTeacherSubjectPerformance() above already uses to decide whose name
  // is attached to a subject's results, and the same gate the
  // included_scores view itself requires before a mark counts at all. A
  // teacher who teaches the subject but hasn't submitted/been included
  // gets NOTHING for that subject here - never a borrowed aggregate.
  let subjects = [];
  if (subjectIds.length) {
    const eligibleRes = await query(
      `SELECT subject_id FROM teacher_sheet_status
       WHERE sheet_id = $1 AND teacher_id = $2 AND subject_id = ANY($3::int[]) AND included_in_results = TRUE`,
      [sheet_id, teacher_id, subjectIds]
    );
    const eligibleSubjectIds = eligibleRes.rows.map((r) => r.subject_id);

    if (eligibleSubjectIds.length) {
      const subjRes = await getTeacherSubjectPerformance(sheet_id, eligibleSubjectIds);
      subjects = subjRes.rows;
    }
  }

  return {
    period: { id: period.id, form, exam_type, month, year: Number(year) },
    sheet_id,
    teacher: { id: teacher.id, full_name: teacher.full_name },
    subjects,
    comparison: await buildPerformanceComparison(form, period.id, Number(year), month, subjects),
  };
};

// GET /api/results-mgmt/teacher-evaluation?form=&exam_type=&month=&year=&teacher_id=
const getTeacherEvaluation = async (req, res, next) => {
  const { form, exam_type, month, year, teacher_id } = req.query;
  if (!form || !exam_type || !month || !year || !teacher_id)
    return res.status(400).json({ error: "form, exam_type, month, year and teacher_id are required." });
  try {
    const d = await gatherTeacherEvaluationData(form, exam_type, month, year, teacher_id);
    if (d.error) return res.status(404).json({ error: d.error });
    res.json(d);
  } catch (err) { next(err); }
};

// GET /api/results-mgmt/teacher-evaluation/export-pdf?form=&exam_type=&month=&year=&teacher_id=
// Renders the printable appraisal sheet: letterhead, the Kiswahili title
// block, the teacher's bolded full name, the colored grade-breakdown table
// (A/B/C/D/F/A-C/A-D/PASS/GPA/POS), then the subject-teacher comment block
// and head-of-school comment/signature/stamp block.
const exportTeacherEvaluationPdf = async (req, res, next) => {
  const { form, exam_type, month, year, teacher_id } = req.query;
  if (!form || !exam_type || !month || !year || !teacher_id)
    return res.status(400).json({ error: "form, exam_type, month, year and teacher_id are required." });
  try {
    const d = await gatherTeacherEvaluationData(form, exam_type, month, year, teacher_id);
    if (d.error) return res.status(404).json({ error: d.error });
    const { teacher, subjects, comparison } = d;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Teacher-Assessment-${teacher.full_name.replace(/\s+/g, "-")}-${form}-${exam_type}.pdf"`.replace(/\s+/g, "-"));
    const doc = new PDFDocument({ margin: 30, size: "A4", layout: "landscape", bufferPages: true });
    doc.pipe(res);
    drawLetterhead(doc, "TEACHERS ASSESSMENT");

    let y = doc.y + 4;
    // "TATHMINI YA MATOKEO YA MTIHANI WA <EXAM TYPE - bold> <MONTH>, <YEAR> - <FORM>"
    // e.g. TATHMINI YA MATOKEO YA MTIHANI WA MONTHLY TEST AUGUST, 2026 - FORM III
    // - the whole line centered, with only the Exam Type segment bolded.
    const titlePrefix = "TATHMINI YA MATOKEO YA MTIHANI WA ";
    const titleExamType = `${exam_type.toUpperCase()} `;
    const titleSuffix = `${month.toUpperCase()}, ${year} - ${form.toUpperCase()}`;
    doc.fontSize(11.5).fillColor("#0F172A");
    const fullTitleWidth =
      doc.font("Helvetica").widthOfString(titlePrefix) +
      doc.font("Helvetica-Bold").widthOfString(titleExamType) +
      doc.font("Helvetica").widthOfString(titleSuffix);
    let titleX = 30 + (781 - fullTitleWidth) / 2;
    doc.font("Helvetica").text(titlePrefix, titleX, y, { continued: true, lineBreak: false });
    doc.font("Helvetica-Bold").text(titleExamType, { continued: true, lineBreak: false });
    doc.font("Helvetica").text(titleSuffix, { lineBreak: false });
    y = doc.y + 14;
    doc.fontSize(10.5).font("Helvetica").fillColor("#334155").text("JINA LA MWALIMU: ", 30, y, { continued: true });
    doc.font("Helvetica-Bold").fillColor("#0F172A").text(teacher.full_name.toUpperCase());
    y = doc.y + 16;

    // ── GRADE BREAKDOWN TABLE (grouped A/B/C/D/F/A-C/A-D/PASS headers,
    //    each with its own F (girls) / M (boys) / T (total) / % sub-columns,
    //    fixed-colored so the columns read as a color legend down the whole
    //    sheet - SUBJECT/GPA/POS are the only plain columns left, and stay
    //    neutral gray) ──
    const groups = [
      { key: "A", label: "A", color: COMPETENCY_COLOR.A, fKey: "grade_a_f", mKey: "grade_a_m", totalKey: "grade_a", pctKey: "pct_a" },
      { key: "B", label: "B", color: COMPETENCY_COLOR.B, fKey: "grade_b_f", mKey: "grade_b_m", totalKey: "grade_b", pctKey: "pct_b" },
      { key: "C", label: "C", color: COMPETENCY_COLOR.C, fKey: "grade_c_f", mKey: "grade_c_m", totalKey: "grade_c", pctKey: "pct_c" },
      { key: "D", label: "D", color: COMPETENCY_COLOR.D, fKey: "grade_d_f", mKey: "grade_d_m", totalKey: "grade_d", pctKey: "pct_d" },
      { key: "F", label: "F", color: COMPETENCY_COLOR.F, fKey: "grade_f_f", mKey: "grade_f_m", totalKey: "grade_f", pctKey: "pct_f" },
      { key: "AC", label: "A-C", color: RANGE_COLOR.AC, fKey: "a_to_c_f", mKey: "a_to_c_m", totalKey: "a_to_c_count", pctKey: "a_to_c_pct" },
      { key: "AD", label: "A-D", color: RANGE_COLOR.AD, fKey: "a_to_d_f", mKey: "a_to_d_m", totalKey: "a_to_d_count", pctKey: "a_to_d_pct" },
      { key: "PASS", label: "PASS", color: RANGE_COLOR.PASS, fKey: "pass_f", mKey: "pass_m", totalKey: "pass_count", pctKey: "pass_pct" },
    ];
    const GRAY = { bg: "#64748B", text: "#FFFFFF" };
    const subjectW = 110, groupW = 72, subW = groupW / 4, gpaW = 36, posW = 36;
    let x = 30;
    const subjectX = x; x += subjectW;
    const groupX = groups.map((g) => { const gx = x; x += groupW; return gx; });
    const gpaX = x; x += gpaW;
    const posX = x; x += posW;
    const tableRight = x;

    // Row 1 - group labels (SUBJECT/GPA/POS span both header rows, gray).
    doc.rect(subjectX, y - 3, subjectW, 28).fill(GRAY.bg);
    doc.rect(gpaX, y - 3, gpaW, 28).fill(GRAY.bg);
    doc.rect(posX, y - 3, posW, 28).fill(GRAY.bg);
    doc.fillColor(GRAY.text).fontSize(8.5).font("Helvetica-Bold");
    doc.text("SUBJECT", subjectX + 4, y + 4, { width: subjectW - 8 });
    doc.text("GPA", gpaX + 2, y + 4, { width: gpaW - 4, align: "center" });
    doc.text("POS", posX + 2, y + 4, { width: posW - 4, align: "center" });
    groups.forEach((g, i) => {
      const gx = groupX[i];
      doc.rect(gx, y - 3, groupW, 13).fill(g.color.bg);
      doc.fillColor(g.color.text).fontSize(8.5).font("Helvetica-Bold").text(g.label, gx, y, { width: groupW, align: "center" });
    });
    let y2 = y + 13;
    const subLabels = ["F", "M", "T", "%"];
    groups.forEach((g, i) => {
      const gx = groupX[i];
      subLabels.forEach((lab, j) => {
        doc.rect(gx + j * subW, y2 - 3, subW, 15).fill(g.color.bg);
      });
      doc.fillColor(g.color.text).fontSize(6.5).font("Helvetica-Bold");
      subLabels.forEach((lab, j) => {
        doc.text(lab, gx + j * subW, y2, { width: subW, align: "center" });
      });
    });
    y = y2 + 15;
    // BUG FIX: this line used to be drawn immediately - but every filled
    // (zebra-striped) row's background rect starts 2pt ABOVE its own text
    // baseline (for a little breathing room), which is exactly enough to
    // paint over a horizontal line drawn right above it. Since subject row
    // 0 is always filled, the header's own bottom border was being erased
    // the moment the first row was drawn. Collect this line's position and
    // draw it (along with every row separator below) only after ALL rows
    // are filled, so nothing can ever paint over it again.
    const headerBottomY = y - 1;
    // which put one of them exactly under the centered "A"/"B"/... group
    // letter (groupW/2 == 2×subW) - visually slicing the letter in half.
    // Outer boundaries (table edges, SUBJECT/GPA/POS, and each group's own
    // left edge) are safe to run the full header height since they never
    // cross a centered label - only those get the tall line.
    const outerHeaderX = [subjectX, ...groupX, gpaX, posX, tableRight];
    drawVLines(doc, outerHeaderX, y - 1 - 28, y - 1, "#94A3B8");
    // A clean line between the "A" row and the "F | M | T | %" row under it,
    // so the two read as distinct header rows instead of running together.
    // Translucent black (not white) so it stays visible against every group
    // color, including the pale yellow "C" group where white would vanish.
    doc.strokeOpacity(0.25);
    groups.forEach((g, i) => {
      const gx = groupX[i];
      doc.moveTo(gx, y2 - 3).lineTo(gx + groupW, y2 - 3).strokeColor("#000000").lineWidth(0.75).stroke();
    });
    doc.strokeOpacity(1);
    // The inner F|M|T|% dividers belong ONLY to the sub-header row - never
    // the group-label row above it. Each group draws its own dividers in
    // its own text color (translucent) so they stay visible on light
    // backgrounds too - a single hardcoded white was invisible on the pale
    // yellow "C" group.
    doc.strokeOpacity(0.35);
    groups.forEach((g, i) => {
      const gx = groupX[i];
      [gx + subW, gx + 2 * subW, gx + 3 * subW].forEach((dx) => {
        doc.moveTo(dx, y2 - 3).lineTo(dx, y - 1).strokeColor(g.color.text).lineWidth(0.5).stroke();
      });
    });
    doc.strokeOpacity(1).lineWidth(1);

    doc.font("Helvetica").fillColor("#0F172A");
    if (!subjects.length) {
      doc.fontSize(9.5).fillColor("#64748B").text("No subject results found for this teacher in this exam period.", subjectX, y + 6);
      y += 24;
    }
    const rowLineYs = [headerBottomY];
    subjects.forEach((sp, idx) => {
      const rowH = 15;
      if (idx % 2 === 0) { doc.rect(subjectX, y - 3, tableRight - subjectX, rowH).fill("#F8FAFC"); }
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#0F172A").text(sp.subject_name, subjectX + 4, y, { width: subjectW - 8 });
      groups.forEach((g, i) => {
        const gx = groupX[i];
        subLabels.forEach((lab, j) => { doc.rect(gx + j * subW, y - 3, subW, rowH).fill(g.color.bg); });
        const fVal = sp[g.fKey], mVal = sp[g.mKey], totalVal = sp[g.totalKey], pctVal = sp[g.pctKey];
        doc.fontSize(6.5).font("Helvetica-Bold").fillColor(g.color.text);
        doc.text(fVal == null ? "-" : String(fVal), gx, y, { width: subW, align: "center" });
        doc.text(mVal == null ? "-" : String(mVal), gx + subW, y, { width: subW, align: "center" });
        doc.text(totalVal == null ? "-" : String(totalVal), gx + subW * 2, y, { width: subW, align: "center" });
        doc.text(pctVal == null ? "-" : Number(pctVal).toFixed(1), gx + subW * 3, y, { width: subW, align: "center" });
      });
      doc.font("Helvetica").fontSize(8).fillColor("#0F172A");
      doc.text(sp.gpa == null ? "-" : String(sp.gpa), gpaX, y, { width: gpaW, align: "center" });
      doc.font("Helvetica-Bold").text(sp.pos == null ? "-" : String(sp.pos), posX, y, { width: posW, align: "center" });
      doc.font("Helvetica");
      // Vertical grid lines down every column, including inside the
      // colored groups (F|M|T|%). Outer column edges use a neutral gray;
      // each group's own inner F|M|T|% dividers use that group's own text
      // color (translucent) so they stay visible on light backgrounds too -
      // a single hardcoded white was invisible against the pale yellow "C"
      // group.
      drawVLines(doc, [subjectX, gpaX, posX, tableRight, ...groupX], y - 3, y - 3 + rowH, "#E2E8F0");
      doc.strokeOpacity(0.35);
      groups.forEach((g, i) => {
        const gx = groupX[i];
        [gx + subW, gx + 2 * subW, gx + 3 * subW].forEach((dx) => {
          doc.moveTo(dx, y - 3).lineTo(dx, y - 3 + rowH).strokeColor(g.color.text).lineWidth(0.5).stroke();
        });
      });
      doc.strokeOpacity(1).lineWidth(1);
      y += rowH;
      // Row-separator line - deferred (see rowLineYs below) so a later
      // row's own zebra-stripe fill can never paint over an earlier line.
      rowLineYs.push(y - 1);
    });
    // Draw every collected horizontal line now, guaranteed on top of every
    // fill in this table - this is what actually makes each "section" (the
    // header split, and every row below it) show a full horizontal line,
    // instead of every other one silently vanishing under the next row's
    // background tint.
    rowLineYs.forEach((ly) => {
      doc.moveTo(subjectX, ly).lineTo(tableRight, ly).strokeColor(ly === headerBottomY ? "#94A3B8" : "#CBD5E1").stroke();
    });
    y += 26;

    // ── ULINGANISHO WA UFAULU - Kiswahili comparison of this exam's PASS %
    //    against the same subject's PASS % in the most recent prior exam
    //    for this Form, per subject the teacher is being assessed on. ──
    if (comparison && comparison.lines.length) {
      if (y > 500) { doc.addPage({ margin: 30, size: "A4", layout: "landscape" }); y = doc.page.margins.top; }
      doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#0F172A").text("ULINGANISHO WA UFAULU NA MTIHANI ULIOPITA:", subjectX, y);
      y += 14;
      doc.fontSize(8.5).font("Helvetica").fillColor("#334155");
      comparison.lines.forEach((line) => {
        doc.text(`\u2022 ${line}`, subjectX, y, { width: tableRight - subjectX });
        y = doc.y + 3;
      });
      y += 10;
    }

    // ── Comment / signature blocks - same Kiswahili wording and layout
    //    used on the school's paper evaluation form, so a printed copy
    //    needs no manual re-typing. ──
    const blockRight = tableRight;
    const commentBlock = (label, lineCount) => {
      // Raised from 470 - with 2-line comment blocks (down from 3) and the
      // tighter 13pt line spacing below, the whole sheet (including the new
      // MATARAJIO YA MTIHANI UJAO block added below) now fits on a single
      // page for the normal subject count. This check is now only a safety
      // net for an unusually long subject list that would otherwise run
      // the signature blocks off the bottom of the page.
      if (y > 545) { doc.addPage({ margin: 30, size: "A4", layout: "landscape" }); y = doc.page.margins.top; }
      doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#0F172A").text(label, subjectX, y);
      y += 16;
      doc.strokeColor("#94A3B8").lineWidth(0.7);
      for (let i = 0; i < lineCount; i++) {
        doc.moveTo(subjectX, y).lineTo(blockRight, y).stroke();
        y += 13;
      }
    };

    commentBlock("MAONI YA MWALIMU WA SOMO:", 2);
    y += 4;
    commentBlock("MATARAJIO YA MTIHANI UJAO:", 2);
    y += 4;
    doc.fontSize(9.5).font("Helvetica").fillColor("#0F172A");
    doc.text("JINA: ", subjectX, y, { continued: true, width: 250 }); doc.text("_______________________________");
    y += 16;
    doc.text("TAREHE: ____ / ____ / 20____", subjectX, y);
    y += 16;
    doc.text("SAINI: _______________________________", subjectX, y);
    y += 22;

    commentBlock("MAONI YA MKUU WA SHULE:", 2);
    y += 4;
    doc.text("SAINI: _______________________________", subjectX, y);
    y += 16;
    doc.text("MUHURI:", subjectX, y);

    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

const getHistory = async (req, res, next) => {
  const { form } = req.query;
  try {
    let q = `SELECT * FROM results_history`;
    const params = [];
    if (form) { q += ` WHERE form = $1`; params.push(form); }
    q += ` ORDER BY year DESC, form ASC, exam_type ASC`;
    const { rows } = await query(q, params);
    res.json(rows);
  } catch (err) { next(err); }
};

// ══════════════════ ANALYTICS DASHBOARD (Head Master) ══════════════════
// GET /api/results-mgmt/analytics?form=Form II&subject_id=12
// Head Master / Second Master oversight: performance trend across MANY
// exam periods (not a single sheet) - e.g. "does Form II keep dropping in
// Physics every year?" Two independent series are returned:
//   1. overallTrend  - the whole form's school GPA / pass rate, one point
//      per exam period that has published/compiled results, oldest first.
//   2. subjectTrend  - the SAME, narrowed to one subject, when subject_id
//      is given (so the caller can compare a subject against the form's
//      overall trend on the same chart).
// Both only ever look at RESULTS THAT HAVE ALREADY BEEN INCLUDED (the
// existing "Include in Results" gate - subject_performance/
// school_overall_performance are both built on top of included_scores),
// so this can never leak a subject a teacher hasn't finished submitting,
// or one Academic Master deliberately excluded.
const getResultsAnalytics = async (req, res, next) => {
  const { form, subject_id } = req.query;
  if (!form || !VALID_FORMS.includes(form)) return res.status(400).json({ error: "A valid form is required." });
  try {
    const overallRes = await query(
      `SELECT ap.id AS period_id, ap.exam_type, ap.month, ap.year, sop.total_candidates, sop.total_passed, sop.school_gpa
       FROM academic_periods ap
       JOIN score_sheets ss ON ss.period_id = ap.id AND ss.form = ap.form
       JOIN school_overall_performance sop ON sop.sheet_id = ss.id
       WHERE ap.form = $1
       ORDER BY ap.year ASC, ap.id ASC`,
      [form]
    );
    const overallTrend = overallRes.rows.map((r) => ({
      period_id: r.period_id, exam_type: r.exam_type, month: r.month, year: r.year,
      label: `${r.exam_type}, ${r.month} ${r.year}`,
      total_candidates: Number(r.total_candidates) || 0,
      total_passed: Number(r.total_passed) || 0,
      pass_pct: r.total_candidates > 0 ? Math.round((Number(r.total_passed) / Number(r.total_candidates)) * 1000) / 10 : null,
      school_gpa: r.school_gpa != null ? Number(r.school_gpa) : null,
    }));

    // Every subject that has AT LEAST ONE included result for this form -
    // powers the subject picker on the frontend so the Head Master only
    // ever sees subjects that actually have history to show.
    const subjectsRes = await query(
      `SELECT DISTINCT sub.id, sub.name, sub.code, sub.sort_order
       FROM subject_performance spf
       JOIN score_sheets ss ON ss.id = spf.sheet_id
       JOIN academic_periods ap ON ap.id = ss.period_id
       JOIN subjects sub ON sub.id = spf.subject_id
       WHERE ap.form = $1
       ORDER BY sub.sort_order ASC, sub.name ASC`,
      [form]
    );

    let subjectTrend = [];
    let subjectMeta = null;
    if (subject_id) {
      const subjRes = await query(
        `SELECT ap.id AS period_id, ap.exam_type, ap.month, ap.year,
                spf.total_sat, spf.pass_pct, spf.a_to_c_pct, spf.gpa, spf.competency_level,
                spf.grade_a, spf.grade_b, spf.grade_c, spf.grade_d, spf.grade_f
         FROM academic_periods ap
         JOIN score_sheets ss ON ss.period_id = ap.id AND ss.form = ap.form
         JOIN subject_performance spf ON spf.sheet_id = ss.id AND spf.subject_id = $2
         WHERE ap.form = $1
         ORDER BY ap.year ASC, ap.id ASC`,
        [form, subject_id]
      );
      subjectTrend = subjRes.rows.map((r) => ({
        period_id: r.period_id, exam_type: r.exam_type, month: r.month, year: r.year,
        label: `${r.exam_type}, ${r.month} ${r.year}`,
        total_sat: Number(r.total_sat) || 0,
        pass_pct: r.pass_pct != null ? Number(r.pass_pct) : null,
        a_to_c_pct: r.a_to_c_pct != null ? Number(r.a_to_c_pct) : null,
        gpa: r.gpa != null ? Number(r.gpa) : null,
        competency_level: r.competency_level,
        grade_a: Number(r.grade_a) || 0, grade_b: Number(r.grade_b) || 0, grade_c: Number(r.grade_c) || 0,
        grade_d: Number(r.grade_d) || 0, grade_f: Number(r.grade_f) || 0,
      }));
      const found = subjectsRes.rows.find((s) => Number(s.id) === Number(subject_id));
      subjectMeta = found ? { id: found.id, name: found.name, code: found.code } : null;
    }

    // Simple, honest trend direction - compares the average of the first
    // half of the series against the second half (not just first-vs-last
    // point, which one noisy exam could flip). Needs at least 2 data
    // points; fewer than that is reported as "insufficient_data" rather
    // than guessing. Pass rate rising = "improving"; GPA is inverted
    // (lower = better, since 1=Grade A ... 5=Grade F), so GPA rising means
    // "declining".
    const trendDirection = (series, key, lowerIsBetter = false) => {
      const vals = series.map((s) => s[key]).filter((v) => v != null);
      if (vals.length < 2) return "insufficient_data";
      const mid = Math.ceil(vals.length / 2);
      const firstAvg = vals.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
      const secondAvg = vals.slice(mid).reduce((a, b) => a + b, 0) / (vals.length - mid);
      const diff = secondAvg - firstAvg;
      const threshold = key === "school_gpa" || key === "gpa" ? 0.05 : 1; // ignore noise below this
      if (Math.abs(diff) < threshold) return "stable";
      const improving = lowerIsBetter ? diff < 0 : diff > 0;
      return improving ? "improving" : "declining";
    };

    res.json({
      form,
      subjects: subjectsRes.rows,
      overallTrend,
      overallTrendDirection: {
        pass_pct: trendDirection(overallTrend, "pass_pct", false),
        school_gpa: trendDirection(overallTrend, "school_gpa", true),
      },
      subjectMeta,
      subjectTrend,
      subjectTrendDirection: subject_id ? {
        pass_pct: trendDirection(subjectTrend, "pass_pct", false),
        gpa: trendDirection(subjectTrend, "gpa", true),
      } : null,
    });
  } catch (err) { next(err); }
};

const getFullExcel = async (req, res, next) => {
  const { form, period_id } = req.query;
  if (!form || !period_id) return res.status(400).json({ error: "form and period_id required." });
  try {
    const subjectsRes = await query(`SELECT id, code, name, sort_order FROM subjects WHERE is_active=TRUE ORDER BY sort_order ASC, code ASC`);
    const sheetRes = await query(`SELECT id FROM score_sheets WHERE period_id=$1 AND form=$2`, [period_id, form]);
    if (!sheetRes.rows.length) return res.json({ subjects: subjectsRes.rows, students: [], school_overall: null });

    const sheet_id = sheetRes.rows[0].id;
    const studentsRes = await query(`SELECT * FROM student_results WHERE sheet_id = $1 ORDER BY gender ASC, reg_no ASC NULLS LAST, student_id ASC, first_name ASC, last_name ASC`, [sheet_id]);
    const scoresRes = await query(
      `SELECT sc.student_id, sub.code AS subject_code, ROUND(sc.marks)::INT AS marks, sc.grade
       FROM included_scores sc JOIN subjects sub ON sc.subject_id = sub.id
       WHERE sc.sheet_id = $1 AND sc.marks IS NOT NULL`,
      [sheet_id]
    );
    const scoreMap = {};
    scoresRes.rows.forEach((r) => {
      if (!scoreMap[r.student_id]) scoreMap[r.student_id] = {};
      scoreMap[r.student_id][r.subject_code] = { marks: r.marks, grade: r.grade };
    });
    const subjPerfRes = await query(`SELECT * FROM subject_performance WHERE sheet_id=$1 ORDER BY sort_order ASC`, [sheet_id]);
    const divSummaryRes = await query(`SELECT gender, division, count FROM division_summary WHERE sheet_id=$1`, [sheet_id]);
    const overallRes = await query(`SELECT * FROM school_overall_performance WHERE sheet_id=$1`, [sheet_id]);

    res.json({
      subjects: subjectsRes.rows,
      students: studentsRes.rows.map((s) => ({ ...s, scores: scoreMap[s.student_id] || {} })),
      subject_performance: subjPerfRes.rows,
      division_summary: divSummaryRes.rows,
      school_overall: overallRes.rows[0] || null,
    });
  } catch (err) { next(err); }
};

// ══════════════════ PUBLISHED RESULTS (Cloudinary PDFs) ══════════════════
// Frontend uploads the PDF directly to Cloudinary (unsigned preset), then
// sends back secure_url + public_id here to save as a "published result".
const publicResults = async (req, res, next) => {
  const { form, year } = req.query;
  try {
    let q = `SELECT id, form, exam_type, month, year, title, pdf_url, file_size, created_at FROM published_results WHERE is_active = TRUE`;
    const params = [];
    if (form) { params.push(form); q += ` AND form = $${params.length}`; }
    if (year) { params.push(Number(year)); q += ` AND year = $${params.length}`; }
    q += ` ORDER BY created_at DESC`;
    const { rows } = await query(q, params);
    res.json(rows);
  } catch (err) { next(err); }
};

const listPublishedResults = async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT pr.*, u.full_name AS uploaded_by_name FROM published_results pr
       LEFT JOIN users u ON pr.uploaded_by = u.id ORDER BY pr.created_at DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
};

// POST /api/results-mgmt/published - multipart upload (field name "pdf").
// The Head Master/Second Master/Academic Master just picks a PDF file; it's
// uploaded straight to Cloudinary here and the resulting URL saved - no
// manual Cloudinary-dashboard-and-paste-the-link step needed anymore.
const publishResult = async (req, res, next) => {
  const { form, exam_type, month, year, title } = req.body;
  if (!form || !exam_type || !month || !year || !title)
    return res.status(400).json({ error: "form, exam_type, month, year and title are required." });
  if (!VALID_FORMS.includes(form)) return res.status(400).json({ error: "Invalid form." });
  if (!req.file) return res.status(400).json({ error: "Please choose a PDF file to publish." });
  try {
    const { uploadBufferToCloudinary } = require("../middleware/upload");
    const uploaded = await uploadBufferToCloudinary(req.file.buffer, {
      folder: "mikumbi/results",
      resource_type: "raw",
      // Cloudinary "raw" uploads store the file exactly as given and do
      // NOT auto-detect/append a format the way image uploads do - the
      // public_id (and therefore the delivered secure_url) must include
      // the extension itself, or the downloaded file has no extension
      // and won't open in a PDF viewer even though the bytes are fine.
      public_id: `${form.replace(/\s+/g, "")}-${exam_type.replace(/\s+/g, "")}-${month}-${year}-${Date.now()}.pdf`,
    });
    const { rows } = await query(
      `INSERT INTO published_results (form, exam_type, month, year, title, pdf_url, public_id, file_size, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [form, exam_type, month, Number(year), title.trim(), uploaded.secure_url, uploaded.public_id, req.file.size, req.user.id]
    );
    res.status(201).json({ ...rows[0], message: "Results Successfully Published." });
    recordAudit({
      actor: req.user, action: "published.create", entityType: "published_results", entityId: rows[0].id,
      description: `${req.user.full_name || req.user.username} published "${title.trim()}" (${form} - ${exam_type}, ${month} ${year}) to the public Publications page.`,
      metadata: { form, exam_type, month, year: Number(year), title: title.trim() }, req,
    });
  } catch (err) { next(err); }
};

// POST /api/results-mgmt/published/from-sheet  { sheet_id, title } -
// Publishes the compiled results PDF straight from the sheet, generating it
// on the server (the exact same PDF "Export PDF" produces) and uploading it
// to Cloudinary itself - no manual "download then choose that same file to
// upload" step. "Export PDF" (download) is completely untouched by this and
// keeps working exactly as before; this is just an additional, more direct
// way to reach the same published_results record as the manual-upload
// publishResult() above (same table, same Cloudinary folder, same fields).
const publishResultFromSheet = async (req, res, next) => {
  const { sheet_id, title } = req.body;
  if (!sheet_id) return res.status(400).json({ error: "sheet_id is required." });
  if (!title || !title.trim()) return res.status(400).json({ error: "title is required." });
  try {
    const d = await gatherFullResultsData(sheet_id);
    if (!d) return res.status(404).json({ error: "Sheet not found." });
    const { sheet } = d;
    const pdfBuffer = await generateResultsPdfBuffer(sheet_id);
    const { uploadBufferToCloudinary } = require("../middleware/upload");
    const uploaded = await uploadBufferToCloudinary(pdfBuffer, {
      folder: "mikumbi/results",
      resource_type: "raw",
      // Same public_id convention as the manual-upload path - see the
      // comment on publishResult() above for why the .pdf extension must
      // be baked into the public_id for Cloudinary "raw" uploads.
      public_id: `${sheet.form.replace(/\s+/g, "")}-${sheet.exam_type.replace(/\s+/g, "")}-${sheet.month}-${sheet.year}-${Date.now()}.pdf`,
    });
    const { rows } = await query(
      `INSERT INTO published_results (form, exam_type, month, year, title, pdf_url, public_id, file_size, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [sheet.form, sheet.exam_type, sheet.month, Number(sheet.year), title.trim(), uploaded.secure_url, uploaded.public_id, pdfBuffer.length, req.user.id]
    );
    res.status(201).json({ ...rows[0], message: "Results Successfully Published." });
    recordAudit({
      actor: req.user, action: "published.create", entityType: "published_results", entityId: rows[0].id,
      description: `${req.user.full_name || req.user.username} published "${title.trim()}" (${sheet.form} - ${sheet.exam_type}, ${sheet.month} ${sheet.year}) directly from sheet #${sheet_id} to the public Publications page.`,
      metadata: { sheet_id: Number(sheet_id), form: sheet.form, exam_type: sheet.exam_type, month: sheet.month, year: Number(sheet.year), title: title.trim() }, req,
    });
  } catch (err) {
    // generateResultsPdfBuffer rejects with the same shape exportResultsPdf
    // would have responded with (e.g. "Sheet not found.", 404) - surface
    // that message directly instead of a generic 500 where possible.
    if (err && err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
};

// GET /api/results-mgmt/published/:id/file - public download proxy.
// Streams the PDF from Cloudinary through our own server instead of the
// frontend linking straight to the Cloudinary secure_url. This fixes two
// separate causes of "downloads don't open / Page not Found" on the public
// Publications page:
//  1) A few published records were uploaded before public_id included a
//     ".pdf" extension - Cloudinary then serves them with no usable
//     extension, so phones/browsers refuse to open them. Streaming the file
//     back here with an explicit Content-Type/Content-Disposition fixes
//     that for every record, old or new, with no need to re-upload anything.
//  2) If a link is genuinely unreachable, whoever's downloading now sees
//     OUR OWN clear message instead of Cloudinary's raw error page (which
//     just looks like a dead/broken link with no explanation).
// NOTE: if this still 502s for every file after deploying, check Cloudinary
// Dashboard → Settings → Security → "PDF and ZIP files delivery" - some
// accounts have delivery of raw PDF/ZIP files switched OFF by default,
// which blocks every request for these files, including this one.
const downloadPublishedResult = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT title, pdf_url FROM published_results WHERE id = $1 AND is_active = TRUE`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "This result is not available - it may have been removed or unpublished." });
    const { title, pdf_url } = rows[0];

    let upstream;
    try {
      upstream = await fetch(pdf_url);
    } catch {
      return res.status(502).json({ error: "Could not reach the file storage service. Please try again shortly." });
    }
    if (!upstream.ok) {
      return res.status(502).json({ error: "This file could not be retrieved from storage right now. Please contact the school office." });
    }

    const safeName = (title || "result").replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "result";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${safeName}.pdf"`);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err) { next(err); }
};

const toggleResult = async (req, res, next) => {
  try {
    const { rows } = await query(`UPDATE published_results SET is_active = NOT is_active WHERE id = $1 RETURNING *`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Result not found." });
    res.json(rows[0]);
    recordAudit({
      actor: req.user, action: rows[0].is_active ? "published.show" : "published.hide", entityType: "published_results", entityId: rows[0].id,
      description: `${req.user.full_name || req.user.username} ${rows[0].is_active ? "re-published (made visible)" : "withdrew (hid)"} "${rows[0].title}" on the public Publications page.`,
      metadata: { published_id: rows[0].id, is_active: rows[0].is_active }, req,
    });
  } catch (err) { next(err); }
};

// No confirm() prompt on the frontend for this - runs immediately, per spec.
const deleteResult = async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT public_id, title, form, exam_type, month, year FROM published_results WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Result not found." });

    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    const publicId = rows[0].public_id;
    if (publicId && CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const toSign = `public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
        const signature = crypto.createHash("sha1").update(toSign).digest("hex");
        const form = new URLSearchParams({ public_id: publicId, timestamp: String(timestamp), api_key: CLOUDINARY_API_KEY, signature });
        await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/destroy`, { method: "POST", body: form });
      } catch (cloudErr) {
        console.error("Cloudinary destroy failed:", cloudErr.message);
      }
    }
    await query(`DELETE FROM published_results WHERE id = $1`, [req.params.id]);
    res.json({ message: "Result deleted." });
    recordAudit({
      actor: req.user, action: "published.delete", entityType: "published_results", entityId: Number(req.params.id),
      description: `${req.user.full_name || req.user.username} permanently deleted the published result "${rows[0].title}" (${rows[0].form} - ${rows[0].exam_type}, ${rows[0].month} ${rows[0].year}).`,
      metadata: { published_id: Number(req.params.id), title: rows[0].title }, req,
    });
  } catch (err) { next(err); }
};

// Shared by exportResultsPdf and exportResultsExcel - the full compiled
// class results (every subject, every student, GPA/division/position, plus
// the subject-performance and division-summary breakdowns).
const gatherFullResultsData = async (sheet_id) => {
  const sheetRes = await query(
    `SELECT ss.*, ap.exam_type, ap.month, ap.year FROM score_sheets ss JOIN academic_periods ap ON ap.id = ss.period_id WHERE ss.id = $1`,
    [sheet_id]
  );
  const sheet = sheetRes.rows[0];
  if (!sheet) return null;

  const subjectsRes = await query(`SELECT id, code, name, sort_order FROM subjects WHERE is_active=TRUE ORDER BY sort_order ASC, code ASC`);
  const studentsRes = await query(`SELECT * FROM student_results WHERE sheet_id = $1 ORDER BY gender ASC, reg_no ASC NULLS LAST, student_id ASC, first_name ASC, middle_name ASC, last_name ASC`, [sheet_id]);
  const scoresRes = await query(
    `SELECT sc.student_id, sub.code AS subject_code, ROUND(sc.marks)::INT AS marks, sc.grade
     FROM included_scores sc JOIN subjects sub ON sc.subject_id = sub.id
     WHERE sc.sheet_id = $1 AND sc.marks IS NOT NULL`,
    [sheet_id]
  );
  const scoreMap = {};
  scoresRes.rows.forEach((r) => {
    if (!scoreMap[r.student_id]) scoreMap[r.student_id] = {};
    scoreMap[r.student_id][r.subject_code] = { marks: r.marks, grade: r.grade };
  });
  const subjPerfRes = await query(`SELECT * FROM subject_performance WHERE sheet_id = $1 ORDER BY sort_order ASC, subject_code ASC`, [sheet_id]);
  const teacherSubjPerfRes = await getTeacherSubjectPerformance(sheet_id);
  const divSummaryRes = await query(`SELECT gender, division, count FROM division_summary WHERE sheet_id = $1 ORDER BY gender ASC, division ASC`, [sheet_id]);
  const overallRes = await query(`SELECT * FROM school_overall_performance WHERE sheet_id = $1`, [sheet_id]);

  return {
    sheet,
    subjects: subjectsRes.rows,
    students: studentsRes.rows.map((s) => ({ ...s, scores: scoreMap[s.student_id] || {} })),
    subject_performance: subjPerfRes.rows,
    teacher_subject_performance: teacherSubjPerfRes.rows,
    division_summary: divSummaryRes.rows,
    school_overall: overallRes.rows[0] || null,
  };
};

// Builds the "CODE - Marks 'Grade'" text used for the DETAILS SUBJECTS
// column - whole-number marks, and a subject the student wasn't given
// marks for is simply left out (never shows as "-" or "null").
const buildDetailsSubjects = (student, subjectList) =>
  subjectList
    .map(({ code }) => {
      const cell = student.scores[code];
      if (!cell || cell.marks == null || !cell.grade) return null;
      return `${code} - ${cell.marks} '${cell.grade}'`;
    })
    .filter(Boolean)
    .join(", ");

// GET /api/results-mgmt/export-pdf?sheet_id= - mirrors the on-screen
// Results page exactly: Division Performance Summary, then the compiled
// CNO / CAND NAME / SEX / AGGT / DIV / POS / DETAILS SUBJECTS table, then
// School Examination Subject Performance - so the download never looks
// different from what was on screen before it was downloaded.
const exportResultsPdf = async (req, res, next) => {
  const { sheet_id } = req.query;
  if (!sheet_id) return res.status(400).json({ error: "sheet_id required." });
  try {
    const d = await gatherFullResultsData(sheet_id);
    if (!d) return res.status(404).json({ error: "Sheet not found." });
    const { sheet, students, subject_performance, teacher_subject_performance, division_summary } = d;
    // Subject order/names for DETAILS SUBJECTS come from subject_performance
    // (already sorted server-side), matching the on-screen page exactly.
    const subjectList = (subject_performance || []).map((sp) => ({ code: sp.subject_code }));

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${sheet.form}-${sheet.exam_type}-results.pdf"`);
    const doc = new PDFDocument({ margin: 30, size: "A4", layout: "landscape", bufferPages: true });
    doc.pipe(res);
    // Whole-page light-blue backdrop - necta.go.tz tints the ENTIRE report
    // page this color (not just a box behind Division Performance Summary),
    // so every page of this export (including continuation pages below)
    // gets the same full-bleed fill, drawn first so every table/text drawn
    // afterward sits on top of it.
    const paintPageBg = () => { doc.rect(0, 0, doc.page.width, doc.page.height).fill(NECTA_SUMMARY_BG); };
    paintPageBg();
    drawLetterhead(doc, `${sheet.form}, ${sheet.exam_type} RESULTS - ${sheet.month}, ${sheet.year}`.toUpperCase());

    // Continuation pages (2nd, 3rd... page of the SAME report) intentionally
    // do NOT repeat the full official letterhead (logos + "PRIME MINISTER'S
    // OFFICE..." heading) - per spec, that heading belongs on the first page
    // only. A continuation page just starts fresh content at the top margin,
    // but still gets the same full-page light-blue backdrop as page 1.
    const newLandscapePage = () => {
      doc.addPage({ margin: 30, size: "A4", layout: "landscape" });
      paintPageBg();
      return doc.page.margins.top;
    };
    const newPortraitPage = () => {
      doc.addPage({ margin: 40, size: "A4" });
      paintPageBg();
      return doc.page.margins.top;
    };

    // ── DIVISION PERFORMANCE SUMMARY ──
    const divisions = ["I", "II", "III", "IV", "0"];
    const divGrid = { F: {}, M: {} };
    let totalF = 0, totalM = 0;
    const colTotals = {};
    (division_summary || []).forEach((r) => {
      const g = r.gender === "Female" ? "F" : r.gender === "Male" ? "M" : null;
      if (!g) return;
      divGrid[g][r.division] = Number(r.count);
      colTotals[r.division] = (colTotals[r.division] || 0) + Number(r.count);
      if (g === "F") totalF += Number(r.count); else totalM += Number(r.count);
    });
    let y = doc.y;
    const dsColW = 46;
    const dsHeaders = ["SEX", ...divisions, "T"];
    const dsX = dsHeaders.map((_, i) => 30 + i * dsColW);
    const dsRight = 30 + dsColW * dsHeaders.length;
    // Full usable page width - still needed below for the main results
    // table's column sizing.
    const pageUsableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    // NOTE: the light-blue backdrop behind this whole section is no longer a
    // separate box here - paintPageBg() (called for every page, above) already
    // tints the ENTIRE page this color, matching necta.go.tz exactly, so
    // nothing extra needs to be drawn just for this heading.
    doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#0F172A").text("DIVISION PERFORMANCE SUMMARY", 30, y);
    y += 16;
    doc.rect(30, y - 3, dsColW * dsHeaders.length, 14).fill(NECTA_HEAD_BG);
    doc.fontSize(7.5).font(NECTA_FONT_BOLD).fillColor(NECTA_TEXT);
    dsHeaders.forEach((h, i) => doc.text(h, dsX[i] + 3, y, { width: dsColW - 4, align: "center" }));
    y += 14;
    // Horizontal lines are collected here and drawn all at once, after every
    // row below is filled in - see flushHLines above for why.
    const dsLineYs = [y - 1];
    drawVLinesGroove(doc, dsX.concat([dsRight]), y - 1 - 14, y - 1);
    doc.font(NECTA_FONT).fillColor(NECTA_TEXT);
    const dsRows = [
      ["F", ...divisions.map((dv) => String(divGrid.F[dv] || 0)), String(totalF)],
      ["M", ...divisions.map((dv) => String(divGrid.M[dv] || 0)), String(totalM)],
      ["T", ...divisions.map((dv) => String(colTotals[dv] || 0)), String(totalF + totalM)],
    ];
    dsRows.forEach((row) => {
      const rowTop = y;
      doc.rect(30, y - 3, dsColW * dsHeaders.length, 13).fill(NECTA_BG);
      doc.fillColor(NECTA_TEXT);
      row.forEach((v, i) => doc.fontSize(7.5).font(NECTA_FONT).text(v, dsX[i] + 3, y, { width: dsColW - 4, align: "center" }));
      y += 13;
      // Every row (including the T total row) gets its own grid underneath.
      dsLineYs.push(y - 1);
      drawVLinesGroove(doc, dsX.concat([dsRight]), rowTop - 3, y - 1);
    });
    flushHLinesGroove(doc, dsLineYs, 30, dsRight);
    y += 12;

    // ── MAIN RESULTS TABLE ("MATOKEO YA JUMLA") ──
    // Full grid (vertical + horizontal), NECTA-report look - cream fill,
    // navy serif text, bordered cells on every column including DETAILS
    // SUBJECTS.
    const colWidths = { cno: 46, name: 160, sex: 32, aggt: 40, div: 36, pos: 36 };
    const detailsX = 30 + colWidths.cno + colWidths.name + colWidths.sex + colWidths.aggt + colWidths.div + colWidths.pos;
    // BUG FIX: DETAILS SUBJECTS used to be a hardcoded 300pt wide regardless
    // of page size, leaving the table ending ~130pt short of the actual
    // landscape page edge - a big dead gap on the right, while the fixed
    // 300pt column made long subject lists wrap onto extra lines more than
    // necessary. Stretch it to use every point of usable width instead.
    const detailsWidth = pageUsableWidth - (detailsX - 30);
    const totalWidth = pageUsableWidth;
    const headers = ["Reg.No", "CAND NAME", "SEX", "AGGT", "DIV", "POS", "DETAILS SUBJECTS"];
    const colX = [30, 30 + colWidths.cno];
    colX.push(colX[1] + colWidths.name);
    colX.push(colX[2] + colWidths.sex);
    colX.push(colX[3] + colWidths.aggt);
    colX.push(colX[4] + colWidths.div);
    colX.push(colX[5] + colWidths.pos); // start of DETAILS SUBJECTS

    const mainRight = 30 + totalWidth;
    const mainGridX = colX.concat([mainRight]);
    // Horizontal lines are collected per page and drawn all at once, after
    // every row on that page is filled in - see flushHLines above for why.
    let mainLineYs = [];
    const drawHeaderRow = () => {
      doc.rect(30, y - 4, totalWidth, 16).fill(NECTA_HEAD_BG);
      doc.fillColor(NECTA_TEXT).fontSize(7.5).font(NECTA_FONT_BOLD);
      headers.forEach((h, i) => doc.text(h, colX[i] + 3, y, { width: (colX[i + 1] || (colX[i] + detailsWidth)) - colX[i] - 4 }));
      y += 15;
      mainLineYs.push(y - 1);
      drawVLinesGroove(doc, mainGridX, y - 1 - 16, y - 1);
    };
    drawHeaderRow();
    doc.font(NECTA_FONT).fillColor(NECTA_TEXT);

    students.forEach((s, idx) => {
      const details = buildDetailsSubjects(s, subjectList);
      const rowLines = Math.max(1, doc.heightOfString(details || "-", { width: detailsWidth - 6, fontSize: 7 }) / 9);
      const rowHeight = Math.max(14, Math.ceil(rowLines) * 9 + 4);
      if (y + rowHeight > 520) {
        flushHLinesGroove(doc, mainLineYs, 30, mainRight);
        y = newLandscapePage();
        drawHeaderRow();
        doc.font(NECTA_FONT).fillColor(NECTA_TEXT);
      }
      const rowTop = y;
      doc.rect(30, y - 3, totalWidth, rowHeight).fill(NECTA_BG);
      doc.fillColor(NECTA_TEXT);
      const vals = [s.reg_no || s.student_id || "-", s.full_name, sexLabel(s.gender), s.points ?? "-", s.division ?? "-", s.position ?? "-"];
      vals.forEach((v, i) => doc.fontSize(7.5).font(NECTA_FONT).fillColor(NECTA_TEXT).text(String(v), colX[i] + 3, y, { width: colX[i + 1] - colX[i] - 4 }));
      doc.fontSize(7).font(NECTA_FONT).fillColor(NECTA_TEXT).text(details || "-", colX[6] + 3, y, { width: detailsWidth - 6 });
      y += rowHeight;
      // Each student's row is fully bordered - horizontal line underneath
      // plus a vertical grid line at every column boundary.
      mainLineYs.push(y - 1);
      drawVLinesGroove(doc, mainGridX, rowTop - 3, y - 1);
    });
    flushHLinesGroove(doc, mainLineYs, 30, mainRight);

    // ── SCHOOL EXAMINATION SUBJECT PERFORMANCE ──
    // Always starts on its own fresh page - never sharing a page with the
    // main results table above it, regardless of how much room was left.
    if (subject_performance?.length) {
      y = newLandscapePage();
      doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#0F172A").text("SCHOOL EXAMINATION SUBJECT PERFORMANCE", 30, y);
      y += 18;
      const spHeaders = ["SUBJECT", "A", "B", "C", "D", "F", "SAT", "PASS %", "GPA", "COMPETENCY LEVEL"];
      const spColW = [120, 26, 26, 26, 26, 26, 30, 42, 38, 140];
      const spX = []; let acc = 30; spHeaders.forEach((_, i) => { spX.push(acc); acc += spColW[i]; });
      doc.rect(30, y - 3, acc - 30, 14).fill(NECTA_HEAD_BG);
      doc.fontSize(7.5).font(NECTA_FONT_BOLD).fillColor(NECTA_TEXT);
      spHeaders.forEach((h, i) => doc.text(h, spX[i] + 3, y, { width: spColW[i] - 4 }));
      y += 14;
      // Horizontal lines are collected per page and drawn all at once, after
      // every row on that page is filled in - see flushHLines above for why.
      // BUG FIX: this used to push/draw the border line at "y - 1", but every
      // row/header rect above is drawn 3pt above its baseline and only fills
      // DOWN to (rowTop - 3 + rowHeight) - i.e. "y - 3" after the increment,
      // not "y - 1". That left every border line sitting 2pt below the
      // color fill's real bottom edge. Invisible on the plain cream rows
      // (same color both sides of the gap), but on the COMPETENCY LEVEL
      // column - a different fill color per row - it showed up as a sliver
      // of background color between each color band and the grid line
      // beneath it, and the bands never quite lined up with the borders.
      // Pushing "y - 3" instead makes every color band's edge land exactly
      // on its border line.
      let spLineYs = [y - 3];
      drawVLines(doc, spX.concat([acc]), y - 3 - 14, y - 3, NECTA_BORDER);
      doc.font(NECTA_FONT).fillColor(NECTA_TEXT);
      subject_performance.forEach((sp) => {
        if (y > 510) { flushHLines(doc, spLineYs, 30, acc, NECTA_BORDER); y = newLandscapePage(); }
        const rowTop = y;
        const passPct = sp.pass_pct == null ? "-" : Math.round(Number(sp.pass_pct));
        const competencyColor = COMPETENCY_COLOR[competencyGrade(sp.competency_level)] || null;
        const compColX = spX[9], compColW = spColW[9];
        doc.rect(30, y - 3, acc - 30, 13).fill(NECTA_BG);
        if (competencyColor) doc.rect(compColX, y - 3, compColW - 2, 13).fill(competencyColor.bg);
        const row = [sp.subject_name, sp.grade_a, sp.grade_b, sp.grade_c, sp.grade_d, sp.grade_f, sp.total_sat, passPct, sp.gpa];
        row.forEach((v, i) => doc.fillColor(NECTA_TEXT).font(NECTA_FONT).fontSize(7.5).text(String(v ?? "-"), spX[i] + 3, y, { width: spColW[i] - 4 }));
        doc.fillColor(competencyColor ? competencyColor.text : NECTA_TEXT).fontSize(7.5).font(NECTA_FONT_BOLD)
          .text(sp.competency_level || "-", compColX + 3, y, { width: compColW - 4 });
        doc.font(NECTA_FONT);
        y += 13;
        spLineYs.push(y - 3);
        drawVLines(doc, spX.concat([acc]), rowTop - 3, y - 3, NECTA_BORDER);
      });
      flushHLines(doc, spLineYs, 30, acc, NECTA_BORDER);
    }

    // ── SUBJECT PERFORMANCE ──
    // Same per-subject counts as the table above (all computed server-side
    // in the subject_performance view - SAT/A-F/A-C/A-D/PASS/GPA), PLUS the
    // Female/Male split for every grade band - matching the school's paper
    // mark sheet (SOMO | SAT | A..F/A-C/A-D/PASS each as F|M|T|% | GPA). No
    // teacher name column - this is a per-subject breakdown only. Its own
    // dedicated page, same as SCHOOL EXAMINATION SUBJECT PERFORMANCE above it.
    if (teacher_subject_performance?.length) {
      y = newLandscapePage();
      doc.fontSize(9.5).font(NECTA_FONT_BOLD).fillColor(NECTA_TEXT).text("SUBJECT PERFORMANCE", 30, y);
      y += 18;

      const tpGroups = [
        { label: "A", color: COMPETENCY_COLOR.A, fKey: "grade_a_f", mKey: "grade_a_m", tKey: "grade_a", pKey: "pct_a" },
        { label: "B", color: COMPETENCY_COLOR.B, fKey: "grade_b_f", mKey: "grade_b_m", tKey: "grade_b", pKey: "pct_b" },
        { label: "C", color: COMPETENCY_COLOR.C, fKey: "grade_c_f", mKey: "grade_c_m", tKey: "grade_c", pKey: "pct_c" },
        { label: "D", color: COMPETENCY_COLOR.D, fKey: "grade_d_f", mKey: "grade_d_m", tKey: "grade_d", pKey: "pct_d" },
        { label: "F", color: COMPETENCY_COLOR.F, fKey: "grade_f_f", mKey: "grade_f_m", tKey: "grade_f", pKey: "pct_f" },
        { label: "A-C", color: RANGE_COLOR.AC, fKey: "a_to_c_f", mKey: "a_to_c_m", tKey: "a_to_c_count", pKey: "a_to_c_pct" },
        { label: "A-D", color: RANGE_COLOR.AD, fKey: "a_to_d_f", mKey: "a_to_d_m", tKey: "a_to_d_count", pKey: "a_to_d_pct" },
        { label: "PASS", color: RANGE_COLOR.PASS, fKey: "pass_f", mKey: "pass_m", tKey: "pass_count", pKey: "pass_pct" },
      ];
      const FIXED_W = { somo: 110, sat: 26, gpa: 30 };
      const SUB_W = 18; // width of each F/M/T/% sub-column within a group
      const groupW = SUB_W * 4;

      const tpX = { somo: 30 };
      tpX.sat = tpX.somo + FIXED_W.somo;
      let gx = tpX.sat + FIXED_W.sat;
      tpGroups.forEach((g) => { g.x = gx; gx += groupW; });
      tpX.gpa = gx;
      const tableRight = tpX.gpa + FIXED_W.gpa;

      const tpAllX = [tpX.somo, tpX.sat, ...tpGroups.flatMap((g) => [g.x, g.x + SUB_W, g.x + 2 * SUB_W, g.x + 3 * SUB_W]), tpX.gpa, tableRight];
      // Horizontal lines are collected per page and drawn all at once, after
      // every row on that page is filled in - see flushHLines above for why.
      let tpLineYs = [];

      const drawTpHeader = () => {
        doc.rect(30, y - 3, tableRight - 30, 24).fill(NECTA_HEAD_BG);
        doc.fontSize(7.5).font(NECTA_FONT_BOLD).fillColor(NECTA_TEXT);
        doc.text("SOMO", tpX.somo + 3, y + 4, { width: FIXED_W.somo - 4 });
        doc.text("SAT", tpX.sat + 3, y + 4, { width: FIXED_W.sat - 4 });
        doc.text("GPA", tpX.gpa + 3, y + 4, { width: FIXED_W.gpa - 4 });
        tpGroups.forEach((g) => {
          if (g.color) doc.rect(g.x, y - 3, groupW, 24).fill(g.color.bg);
          doc.fontSize(7.5).font(NECTA_FONT_BOLD).fillColor(g.color ? g.color.text : NECTA_TEXT)
            .text(g.label, g.x, y - 1, { width: groupW, align: "center" });
          ["F", "M", "T", "%"].forEach((sub, i) => {
            doc.fontSize(6.5).font(NECTA_FONT_BOLD).fillColor(g.color ? g.color.text : NECTA_TEXT)
              .text(sub, g.x + i * SUB_W, y + 11, { width: SUB_W, align: "center" });
          });
        });
        y += 24;
        tpLineYs.push(y - 1);
        // BUG FIX: the F|M|T|% dividers used to run the whole 24pt header
        // height, landing one line exactly under the centered "A"/"B"/...
        // letter (groupW/2 == 2×SUB_W) and slicing it in half. Outer column
        // boundaries (table edges, SOMO/SAT/GPA, each group's own left edge)
        // never cross a centered label, so only those get the full-height
        // line.
        const subHeaderTop = y - 1 - 13; // top of the F|M|T|% row
        drawVLines(doc, [30, tpX.gpa, tableRight, ...tpGroups.map((g) => g.x)], y - 1 - 24, y - 1, NECTA_BORDER);
        // A clean line between the group-letter row and the F|M|T|% row
        // under it - translucent black so it stays visible on every group
        // color, including light ones (like "C") where white would vanish.
        doc.strokeOpacity(0.25);
        tpGroups.forEach((g) => {
          doc.moveTo(g.x, subHeaderTop).lineTo(g.x + groupW, subHeaderTop).strokeColor("#000000").lineWidth(0.75).stroke();
        });
        doc.strokeOpacity(1).lineWidth(1);
        // Inner F|M|T|% dividers belong ONLY to the sub-header row - each
        // group in its own text color (translucent) for contrast on light
        // and dark group colors alike.
        doc.strokeOpacity(0.35);
        tpGroups.forEach((g) => {
          if (!g.color) return;
          [g.x + SUB_W, g.x + 2 * SUB_W, g.x + 3 * SUB_W].forEach((dx) => {
            doc.moveTo(dx, subHeaderTop).lineTo(dx, y - 1).strokeColor(g.color.text).lineWidth(0.5).stroke();
          });
        });
        doc.strokeOpacity(1).lineWidth(1);
      };
      drawTpHeader();
      doc.font(NECTA_FONT).fillColor(NECTA_TEXT);

      teacher_subject_performance.forEach((tp) => {
        if (y > 500) {
          flushHLines(doc, tpLineYs, 30, tableRight, NECTA_BORDER);
          y = newLandscapePage();
          drawTpHeader();
          doc.font(NECTA_FONT).fillColor(NECTA_TEXT);
        }
        const rowTop = y;
        doc.rect(30, y - 3, tableRight - 30, 13).fill(NECTA_BG);
        doc.fillColor(NECTA_TEXT).font(NECTA_FONT);
        doc.fontSize(7.5).text(tp.subject_name || "-", tpX.somo + 3, y, { width: FIXED_W.somo - 4 });
        doc.text(String(tp.total_sat ?? "-"), tpX.sat, y, { width: FIXED_W.sat, align: "center" });
        doc.text(String(tp.gpa ?? "-"), tpX.gpa, y, { width: FIXED_W.gpa, align: "center" });
        tpGroups.forEach((g) => {
          const vals = [tp[g.fKey] ?? 0, tp[g.mKey] ?? 0, tp[g.tKey] ?? 0, tp[g.pKey] == null ? "-" : Math.round(Number(tp[g.pKey]))];
          vals.forEach((v, i) => doc.fontSize(7.5).text(String(v), g.x + i * SUB_W, y, { width: SUB_W, align: "center" }));
        });
        y += 13;
        tpLineYs.push(y - 1);
        drawVLines(doc, tpAllX, rowTop - 3, y - 1, NECTA_BORDER);
      });
      flushHLines(doc, tpLineYs, 30, tableRight, NECTA_BORDER);
    }

    // ── TOP 10 / BOTTOM 10 PERFORMERS ──
    // Ranked off the same `position` (RANK() by Best-7 GPA, computed
    // server-side in the student_results view, at full precision - not
    // rounded) shown in the main table - students without a computed
    // position (INC - fewer than 7 subjects sat) are left out of both
    // lists, same rule as the on-screen page. Always its own dedicated
    // PORTRAIT page, mirroring the on-screen order (right after SCHOOL
    // EXAMINATION SUBJECT PERFORMANCE).
    // NOTE: GPA itself is never displayed in this table (DIV + POINTS shown
    // instead) - it's only the ranking criterion underneath.
    const ranked = (students || [])
      .filter((s) => s.position != null && s.division !== "INC")
      .slice()
      .sort((a, b) => a.position - b.position);
    if (ranked.length) {
      const top10 = ranked.slice(0, 10).map((s, i) => ({ ...s, rank: i + 1 }));
      // Worst-performing student first (rank 1), counting up to rank 10 -
      // i.e. numbered 1→10 top-to-bottom, not 10→1.
      const bottom10 = ranked.slice().sort((a, b) => b.position - a.position).slice(0, 10)
        .map((s, i) => ({ ...s, rank: i + 1 }));

      let py = newPortraitPage();
      const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      const drawPerformersTable = (title, rows, accentColor) => {
        doc.fontSize(11).font("Helvetica-Bold").fillColor("#0F172A").text(title, 40, py);
        py += 18;
        const headers = ["RANK", "NAME", "DIV", "POINTS"];
        const colW = [40, pageW - 40 - 60 - 90, 60, 90];
        const colX = []; let acc2 = 40; headers.forEach((_, i) => { colX.push(acc2); acc2 += colW[i]; });
        const tableRight2 = 40 + pageW;
        doc.rect(40, py - 3, pageW, 15).fill(NECTA_HEAD_BG);
        doc.fontSize(8.5).font(NECTA_FONT_BOLD).fillColor(NECTA_TEXT);
        headers.forEach((h, i) => doc.text(h, colX[i] + 4, py, { width: colW[i] - 6 }));
        py += 15;
        // Horizontal lines are collected and drawn all at once, after every
        // row below is filled in - see flushHLines above for why.
        const perfLineYs = [py - 1];
        drawVLines(doc, colX.concat([tableRight2]), py - 1 - 15, py - 1, NECTA_BORDER);
        doc.font(NECTA_FONT);
        rows.forEach((s, idx) => {
          const rowTop = py;
          doc.rect(40, py - 3, pageW, 15).fill(NECTA_BG);
          doc.fontSize(8.5).font(NECTA_FONT_BOLD).fillColor(accentColor).text(String(s.rank), colX[0] + 4, py, { width: colW[0] - 6 });
          doc.font(NECTA_FONT).fillColor(NECTA_TEXT).text(s.full_name || "-", colX[1] + 4, py, { width: colW[1] - 6 });
          doc.text(s.division ?? "-", colX[2] + 4, py, { width: colW[2] - 6 });
          doc.text(s.points ?? "-", colX[3] + 4, py, { width: colW[3] - 6 });
          py += 15;
          perfLineYs.push(py - 1);
          drawVLines(doc, colX.concat([tableRight2]), rowTop - 3, py - 1, NECTA_BORDER);
        });
        flushHLines(doc, perfLineYs, 40, tableRight2, NECTA_BORDER);
        py += 16;
      };

      drawPerformersTable("TOP 10 PERFORMING STUDENTS", top10, "#15803D");
      drawPerformersTable("BOTTOM 10 PERFORMING STUDENTS", bottom10, "#B91C1C");
    }

    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

// Renders the EXACT same PDF as GET /export-pdf above, but into an
// in-memory Buffer instead of streaming it to a real HTTP response -
// used by "Publish" (see publishResultFromSheet below) so the Academic
// Master doesn't have to download the file and then re-upload that same
// file by hand. This calls exportResultsPdf ITSELF, unchanged, through a
// fake `res` that only implements what exportResultsPdf actually touches
// (setHeader, status().json(), and being a writable stream for doc.pipe) -
// so the published PDF can never drift from the one "Export PDF" downloads.
const { PassThrough } = require("stream");
const generateResultsPdfBuffer = (sheet_id) => new Promise((resolve, reject) => {
  const sink = new PassThrough();
  const chunks = [];
  sink.on("data", (c) => chunks.push(c));
  sink.on("end", () => resolve(Buffer.concat(chunks)));
  sink.on("error", reject);
  sink.setHeader = () => {}; // exportResultsPdf sets Content-Type/Disposition - irrelevant here, no-op
  sink.status = (code) => ({
    json: (body) => reject(Object.assign(new Error((body && body.error) || `Failed to generate results PDF (${code}).`), { statusCode: code })),
  });
  const fakeReq = { query: { sheet_id } };
  const fakeNext = (err) => reject(err);
  exportResultsPdf(fakeReq, sink, fakeNext).catch(reject);
});

// GET /api/results-mgmt/export-excel?sheet_id= - same data as a real
// downloadable .xlsx workbook (not just JSON), with header styling and one
// sheet for the results grid plus a Summary sheet.
const exportResultsExcel = async (req, res, next) => {
  const { sheet_id } = req.query;
  if (!sheet_id) return res.status(400).json({ error: "sheet_id required." });
  try {
    // Required lazily (not at module load) so that if this package is ever
    // missing/broken, only THIS endpoint fails - it can never take down the
    // whole backend the way a top-level require() would.
    const ExcelJS = require("exceljs");
    const d = await gatherFullResultsData(sheet_id);
    if (!d) return res.status(404).json({ error: "Sheet not found." });
    const { sheet, students, subject_performance, division_summary } = d;

    const wb = new ExcelJS.Workbook();
    wb.creator = "Mikumbi Secondary School - Results Management";

    // Subject order for "Details Subjects" - same source and order used by
    // the on-screen Results page and the PDF export, so all three match.
    const subjectList = (subject_performance || []).map((sp) => ({ code: sp.subject_code }));

    const ws = wb.addWorksheet("Results");
    const columns = [
      { header: "Reg.No", key: "cno", width: 10 },
      { header: "Cand Name", key: "name", width: 28 },
      { header: "Sex", key: "sex", width: 6 },
      { header: "AGGT", key: "aggt", width: 8 },
      { header: "Div", key: "division", width: 8 },
      { header: "Pos", key: "position", width: 8 },
      { header: "Details Subjects", key: "details", width: 60 },
    ];
    ws.columns = columns;
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

    students.forEach((s) => {
      ws.addRow({
        cno: s.reg_no || s.student_id || "-",
        name: s.full_name,
        sex: sexLabel(s.gender),
        aggt: s.points ?? "",
        division: s.division ?? "",
        position: s.position ?? "",
        details: buildDetailsSubjects(s, subjectList) || "-",
      });
    });
    ws.autoFilter = { from: "A1", to: `${ws.getColumn(columns.length).letter}1` };

    const summary = wb.addWorksheet("Summary");
    summary.columns = [{ header: "", key: "a", width: 28 }, { header: "", key: "b", width: 16 }];
    summary.addRow(["Division", "Count (by gender)"]);
    division_summary.forEach((r) => summary.addRow([`${r.division} (${r.gender})`, r.count]));
    summary.addRow([]);
    summary.addRow(["SCHOOL EXAMINATION SUBJECT PERFORMANCE"]);
    const spHeaderRow = summary.addRow(["Subject", "A", "B", "C", "D", "F", "SAT", "PASS %", "GPA", "Competency Level"]);
    spHeaderRow.font = { bold: true };
    subject_performance.forEach((r) => {
      const passPct = r.pass_pct == null ? "" : Math.round(Number(r.pass_pct));
      const row = summary.addRow([r.subject_code, r.grade_a, r.grade_b, r.grade_c, r.grade_d, r.grade_f, r.total_sat, passPct, r.gpa, r.competency_level || ""]);
      const colors = COMPETENCY_COLOR[competencyGrade(r.competency_level)];
      if (colors) {
        const cell = row.getCell(10);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${colors.bg.replace("#", "")}` } };
        cell.font = { color: { argb: `FF${colors.text.replace("#", "")}` }, bold: true };
      }
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${sheet.form}-${sheet.exam_type}-results.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
};

// ══════════════════════ RIPOTI YA MZAZI (PARENT REPORT) ══════════════════════
// One student's report-card addressed to their parent/guardian, in the
// school's own Kiswahili paper-form layout. Fully in Kiswahili (only the
// on-screen download buttons stay English) - see the sample form supplied
// when this feature was requested. Visible to Admin, Second Master, and
// Academic Master ONLY (same three roles as the rest of Results Management's
// admin-side exports).
const path = require("path");
const fs = require("fs");

const ARIMO_REGULAR = path.join(__dirname, "..", "assets", "fonts", "Arimo-Regular.ttf");
const ARIMO_BOLD = path.join(__dirname, "..", "assets", "fonts", "Arimo-Bold.ttf");
const CAVEAT_HAND = path.join(__dirname, "..", "assets", "fonts", "Caveat-SemiBold.ttf");
const GOVT_LOGO_PATH = path.join(__dirname, "..", "assets", "govt-logo.png");
const SCHOOL_LOGO_PATH = path.join(__dirname, "..", "assets", "shule-logo.png");

// Registers this report's three fonts on a fresh PDFDocument. "PR_REG"/
// "PR_BOLD" are Arimo - metrically identical to Arial/Arial-Bold (true
// Arial itself can't be legally embedded in a PDF; Arimo is the standard
// open-licensed, pixel-for-pixel-compatible drop-in replacement for it,
// same idea as NECTA_FONT using Helvetica above). "PR_HAND" is a
// handwriting-style font used ONLY for the two pre-filled comment lines
// (Class Teacher's and Head Master's), so they read as genuinely
// handwritten rather than typed, while staying clearly legible.
function registerParentReportFonts(doc) {
  doc.registerFont("PR_REG", ARIMO_REGULAR);
  doc.registerFont("PR_BOLD", ARIMO_BOLD);
  doc.registerFont("PR_HAND", CAVEAT_HAND);
}

const SW_MONTHS = ["Januari", "Februari", "Machi", "Aprili", "Mei", "Juni", "Julai", "Agosti", "Septemba", "Oktoba", "Novemba", "Desemba"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SW_MONTH_ORDINAL = ["Kwanza", "Pili", "Tatu", "Nne", "Tano", "Sita", "Saba", "Nane", "Tisa", "Kumi", "Kumi na Moja", "Kumi na Mbili"];

// academic_periods.month is stored as an English month name ("August") -
// the school's own paper form always writes it as "MWEZI WA {ordinal in
// Kiswahili}" instead ("MWEZI WA NANE"), so this converts one to the other.
const monthOrdinalSw = (englishMonthName) => {
  const idx = EN_MONTHS.findIndex((m) => m.toLowerCase() === String(englishMonthName || "").toLowerCase());
  return idx >= 0 ? SW_MONTH_ORDINAL[idx] : String(englishMonthName || "");
};

// The four fixed "Mhula" (term) choices the report-generation picker
// offers - purely a label the person generating the report chooses (it
// does not correspond to a stored field), used to build the title exactly
// the way the school's own paper form phrases it.
const MHULA_OPTIONS = ["Nusu Mhula wa I", "Mhula Wa I", "Nusu Mhula wa II", "Mhula Wa II"];

// "05 Juni 2026" from separate day/month/year query-string values - every
// part is optional so a half-filled date picker never throws, it just
// prints whatever parts it was given.
const formatSwDate = (day, month, year) => {
  const d = day ? String(day).padStart(2, "0") : "";
  const mIdx = month ? Number(month) - 1 : -1;
  const m = mIdx >= 0 && mIdx < 12 ? SW_MONTHS[mIdx] : "";
  const y = year ? String(year) : "";
  return [d, m, y].filter(Boolean).join(" ");
};

const PARENT_REPORT_GRADE_COMMENT = { A: "Vizuri sana", B: "Vizuri", C: "Wastani", D: "Dhaifu", F: "Mbaya sana" };
const gradeToComment = (g) => PARENT_REPORT_GRADE_COMMENT[g] || "-";

// ── Part B's ten TABIA (behaviour) traits, in the fixed two-column order
// the school's own paper form uses. ──
const TABIA_LEFT = [
  "Kufika, kutochelewa na kuhudhuria vipindi",
  "Bidii katika Masomo",
  "Kupenda, kuheshimu na kuthamini kazi",
  "Uangalifu wa mali za shule",
  "Uelewano na ushirikiano na wenzake",
];
const TABIA_RIGHT = [
  "Heshima kwa watu",
  "Uongozi",
  "Usafi binafsi",
  "Uaminifu",
  "Kushirikiana katika michezo",
];

// Deterministic PRNG (mulberry32), seeded with the student's own id - the
// same student always gets the same TABIA grades on re-export (stable,
// reproducible), but every student gets their own independent shuffle, so
// no two students' TABIA tables land on the same pattern.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, seed) {
  const rand = mulberry32(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// Every student gets exactly 6xC and 3xB across the nine TABIA traits other
// than "Bidii katika Masomo" (which instead always shows the grade they
// actually earned in their results, per spec) - no A appears anywhere in
// this table per current school policy. Shuffled onto a different subset
// of those nine traits per student via the seed above, so no two
// students' TABIA tables land on the same pattern, and re-exporting the
// same student's report always reproduces the same grades (deterministic
// per student, not random on every click).
function computeTabiaGrades(studentId, avgGrade) {
  const seed = Number(studentId) || 1;
  const otherTraits = [...TABIA_LEFT, ...TABIA_RIGHT].filter((t) => t !== "Bidii katika Masomo");
  const pool = seededShuffle(["C", "C", "C", "C", "C", "C", "B", "B", "B"], seed);
  const grades = {};
  otherTraits.forEach((trait, i) => { grades[trait] = pool[i]; });
  grades["Bidii katika Masomo"] = avgGrade || "-";
  // "Usafi binafsi" (personal hygiene) is never graded B (or A) per school
  // policy - always C. If the shuffle above happened to land a B on it,
  // swap grades with whichever OTHER trait drew a C, so the table still
  // shows exactly 6xC/3xB overall - just rearranged - rather than skewing
  // the totals by simply forcing it to C outright.
  if (grades["Usafi binafsi"] === "B") {
    const swapWith = otherTraits.find((t) => t !== "Usafi binafsi" && grades[t] === "C");
    if (swapWith) { grades["Usafi binafsi"] = "C"; grades[swapWith] = "B"; }
  }
  return grades;
}

// Looks up the Class Teacher's name for a Form - the same "role =
// class_teacher OR 'class_teacher' = ANY(extra_roles), scoped by
// class_teacher_of" pattern User Accounts itself assigns the role with.
const getClassTeacherName = async (form) => {
  const { rows } = await query(
    `SELECT full_name FROM users
     WHERE class_teacher_of = $1 AND is_active = TRUE
       AND (role = 'class_teacher' OR 'class_teacher' = ANY(extra_roles))
     ORDER BY id ASC LIMIT 1`,
    [form]
  );
  return rows[0]?.full_name || null;
};

// ── Letterhead - Kiswahili, specific to the Parent Report (every other
// export in the system uses the English drawLetterhead from pdfHeader.js;
// this one intentionally doesn't, per spec). Kept deliberately compact -
// this report has a tight one-page budget. ──
function drawParentReportLetterhead(doc, titleText) {
  const startY = doc.y;
  const lines = [
    { text: "OFISI YA WAZIRI MKUU,", size: 10.5 },
    { text: "TAWALA ZA MIKOA NA SERIKALI ZA MITAA", size: 9.5 },
    { text: "HALMASHAURI YA WILAYA YA NEWALA", size: 9.5 },
    { text: "SHULE YA SEKONDARI MIKUMBI", size: 12 },
  ];
  doc.font("PR_BOLD").fillColor("#0F172A");
  lines.forEach((l) => { doc.fontSize(l.size).text(l.text, { align: "center", lineGap: 0 }); });
  doc.moveDown(0.2);
  const lineY = doc.y;
  doc.moveTo(doc.page.margins.left, lineY).lineTo(doc.page.width - doc.page.margins.right, lineY)
    .lineWidth(1.1).strokeColor("#334155").stroke();

  // Logos, sized to whatever clear space is actually available beside the
  // (centered) text block - same clamped approach pdfHeader.js's
  // drawLetterhead uses, just capped smaller here for the tighter budget.
  const availableHeight = lineY - startY - 3;
  doc.font("PR_BOLD");
  const maxTextWidth = Math.max(...lines.map((l) => doc.fontSize(l.size).widthOfString(l.text)));
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const clearance = (usableWidth - maxTextWidth) / 2 - 8;
  const logoSize = Math.max(0, Math.min(38, availableHeight, clearance));
  if (logoSize >= 14) {
    const logoY = lineY - 3 - logoSize;
    if (fs.existsSync(GOVT_LOGO_PATH)) { try { doc.image(GOVT_LOGO_PATH, doc.page.margins.left, logoY, { fit: [logoSize, logoSize] }); } catch {} }
    if (fs.existsSync(SCHOOL_LOGO_PATH)) { try { doc.image(SCHOOL_LOGO_PATH, doc.page.width - doc.page.margins.right - logoSize, logoY, { fit: [logoSize, logoSize] }); } catch {} }
  }

  doc.moveDown(0.3);
  doc.fontSize(10).font("PR_BOLD").fillColor("#7A1710").text(titleText, { align: "center", lineGap: 0 });
  doc.moveDown(0.25);
}

// Draws one complete report onto whatever page is currently open on `doc`
// (the caller has already called addPage()/set the background) - shared by
// both the single-student and the "all students, one PDF" bulk export so
// the two can never drift out of sync with each other.
// pdfkit's continued-text chaining (used to mix PR_REG/PR_BOLD fonts on one
// line) does NOT work together with align:"center" - every continued
// segment restarts from the same centered anchor point instead of flowing
// after the previous one, so the words overlap. This measures each
// segment's width itself (per its own font) and places them side by side
// starting from a manually-computed centered X, which sidesteps that
// pdfkit limitation entirely.
function drawCenteredMixedLine(doc, parts, x, width) {
  const totalWidth = parts.reduce((sum, p) => { doc.font(p.font); return sum + doc.widthOfString(p.text); }, 0);
  const startX = x + Math.max(0, (width - totalWidth) / 2);
  const y = doc.y;
  let curX = startX;
  parts.forEach((p) => {
    doc.font(p.font).text(p.text, curX, y, { lineBreak: false, lineGap: 0 });
    curX += doc.widthOfString(p.text);
  });
  doc.y = y + doc.currentLineHeight();
}

async function drawParentReportPage(doc, { sheet, student, mhula, classTeacherName, closingDateText, openingDateText, subjectScores, headmasterSignatureBuf, schoolStampBuf, classTeacherSignatureBuf }) {


  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const fullWidth = right - left;
  doc.x = left;

  const titleText = `RIPOTI YA MAENDELEO YA MWANAFUNZI KATIKA MTIHANI WA KUFUNGA ${(mhula || "").toUpperCase()} MWEZI WA ${monthOrdinalSw(sheet.month).toUpperCase()} MWAKA ${sheet.year}`;
  drawParentReportLetterhead(doc, titleText);

  // ── "KWA MZAZI/MLEZI WA:" + optional passport photo ──────────────────
  const hasPhoto = !!student.photo_url;
  const photoW = 58, photoH = 72;
  const photoX = right - photoW;
  const nameBlockY = doc.y;
  const nameBlockWidth = hasPhoto ? fullWidth - photoW - 10 : fullWidth;
  doc.font("PR_BOLD").fontSize(10.5).fillColor(NECTA_TEXT)
    .text(`KWA MZAZI/MLEZI WA: ${student.full_name}`, left, nameBlockY, { width: nameBlockWidth, lineGap: 0 });
  const afterNameY = doc.y;

  if (hasPhoto) {
    doc.save();
    doc.rect(photoX, nameBlockY, photoW, photoH).lineWidth(1).strokeColor(NECTA_BORDER).stroke();
    try {
      const photoBuf = await fetchImageBuffer(student.photo_url);
      if (photoBuf) doc.image(photoBuf, photoX + 1, nameBlockY + 1, { width: photoW - 2, height: photoH - 2, fit: [photoW - 2, photoH - 2], align: "center", valign: "center" });
    } catch { /* photo failed to load - leave the empty bordered box */ }
    doc.restore();
  }

  doc.y = Math.max(afterNameY, hasPhoto ? nameBlockY + photoH : afterNameY) + 6;

  // ── JINSIA / KIDATO / NAMBA YA USAJILI table - same yellow/cream NECTA
  // table styling (and the same embossed grid lines) as the MATOKEO YA
  // JUMLA table in Results Management. ──
  const idTableRight = right;
  const idColW = (idTableRight - left) / 3;
  const idColX = [left, left + idColW, left + idColW * 2, idTableRight];
  const idHeaderH = 14, idRowH = 16;
  let y = doc.y;
  doc.rect(left, y, idTableRight - left, idHeaderH).fillColor(NECTA_HEAD_BG).fill();
  doc.font("PR_BOLD").fontSize(8).fillColor(NECTA_TEXT);
  ["JINSIA", "KIDATO", "NAMBA YA USAJILI"].forEach((h, i) => {
    doc.text(h, idColX[i] + 4, y + 3, { width: idColW - 8, align: "center" });
  });
  const idHLines = [y];
  y += idHeaderH;
  idHLines.push(y);
  doc.rect(left, y, idTableRight - left, idRowH).fillColor(NECTA_BG).fill();
  doc.font("PR_REG").fontSize(9).fillColor(NECTA_TEXT);
  const rawRegNo = String(student.reg_no || student.entry_no || student.student_id || "");
  const regNoDisplay = rawRegNo.startsWith("S4005/") ? rawRegNo : `S4005/${rawRegNo}`;
  [sexLabel(student.gender), sheet.form.replace("Form ", "Kidato "), regNoDisplay].forEach((v, i) => {
    doc.text(v, idColX[i] + 4, y + 3.5, { width: idColW - 8, align: "center" });
  });
  y += idRowH;
  idHLines.push(y);
  drawVLinesGroove(doc, idColX, idHLines[0], y);
  flushHLinesGroove(doc, idHLines, left, idTableRight);
  doc.y = y + 4;

  // Permanent Admission Number - this is the credential parents use to log
  // into the online Results portal (Publications → "Results"), so it's
  // printed here every time, in plain sight, rather than being something
  // only visible inside the system.
  if (student.admission_no) {
    doc.font("PR_REG").fontSize(7.5).fillColor(NECTA_TEXT)
      .text(`Namba ya Kuingia Mtandaoni (Results): ${student.admission_no}`, left, doc.y, { lineGap: 0 });
    doc.moveDown(0.25);
  }

  // ── A: TAARIFA YA MAENDELEO YA KITAALUMA ──────────────────────────────
  doc.font("PR_BOLD").fontSize(9.5).fillColor(NECTA_TEXT).text("A: TAARIFA YA MAENDELEO YA KITAALUMA", left, doc.y, { lineGap: 0 });
  doc.moveDown(0.15);

  const subjCount = subjectScores.length;
  let rowH, fSize;
  if (subjCount <= 9) { rowH = 16.5; fSize = 9.5; }
  else if (subjCount <= 12) { rowH = 14.5; fSize = 9; }
  else if (subjCount <= 15) { rowH = 12.5; fSize = 8; }
  else { rowH = 8; fSize = 6; }
  const headH = subjCount > 15 ? 12 : 16;

  const aColW = [fullWidth * 0.36, fullWidth * 0.22, fullWidth * 0.14, fullWidth * 0.28];
  const aColX = [left, left + aColW[0], left + aColW[0] + aColW[1], left + aColW[0] + aColW[1] + aColW[2], right];

  y = doc.y;
  const aTop = y;
  doc.rect(left, y, fullWidth, headH).fillColor(NECTA_HEAD_BG).fill();
  doc.font("PR_BOLD").fontSize(8).fillColor(NECTA_TEXT);
  ["SOMO", "ALAMA ZA MTIHANI", "DARAJA", "MAONI"].forEach((h, i) => {
    doc.text(h, aColX[i] + 4, y + 3.2, { width: aColW[i] - 8, align: i === 0 ? "left" : "center" });
  });
  const aHLines = [y];
  y += headH;
  aHLines.push(y);

  doc.font("PR_REG").fontSize(fSize);
  subjectScores.forEach((s, i) => {
    if (i % 2 === 1) { doc.rect(left, y, fullWidth, rowH).fillColor(NECTA_BG).fill(); }
    doc.fillColor(NECTA_TEXT);
    doc.text(s.subject_name, aColX[0] + 4, y + (rowH - fSize) / 2 - 1, { width: aColW[0] - 8, align: "left" });
    doc.text(String(s.marks), aColX[1] + 4, y + (rowH - fSize) / 2 - 1, { width: aColW[1] - 8, align: "center" });
    doc.text(s.grade || "-", aColX[2] + 4, y + (rowH - fSize) / 2 - 1, { width: aColW[2] - 8, align: "center" });
    doc.text(gradeToComment(s.grade), aColX[3] + 4, y + (rowH - fSize) / 2 - 1, { width: aColW[3] - 8, align: "center" });
    y += rowH;
    aHLines.push(y);
  });
  drawVLinesGroove(doc, aColX, aTop, y);
  flushHLinesGroove(doc, aHLines, left, right);
  doc.y = y + 6;

  // ── Summary strip: JUMLA YA ALAMA / WASTANI / DARAJA + legend + rank ──
  const totalMarks = subjectScores.reduce((sum, s) => sum + (Number(s.marks) || 0), 0);
  const average = subjCount ? Math.round(totalMarks / subjCount) : 0;
  const sumColW = fullWidth / 3;
  y = doc.y;
  doc.rect(left, y, fullWidth, 16).fillColor(NECTA_HEAD_BG).fill();
  doc.font("PR_BOLD").fontSize(8.5).fillColor(NECTA_TEXT);
  [`JUMLA YA ALAMA: ${totalMarks}`, `WASTANI: ${average}`, `DARAJA: ${student.avg_grade || "-"}`].forEach((t, i) => {
    doc.text(t, left + sumColW * i + 4, y + 3.5, { width: sumColW - 8, align: "center" });
  });
  drawVLinesGroove(doc, [left, left + sumColW, left + sumColW * 2, right], y, y + 16);
  flushHLinesGroove(doc, [y, y + 16], left, right);
  y += 16;
  doc.y = y + 4;

  doc.font("PR_REG").fontSize(8.5).fillColor(NECTA_TEXT);
  drawCenteredMixedLine(doc, [
    { text: "AMEKUWA MWANAFUNZI WA  ", font: "PR_REG" },
    { text: `${student.position ?? "-"}`, font: "PR_BOLD" },
    { text: "  KATI YA  ", font: "PR_REG" },
    { text: `${student.total_students ?? "-"}`, font: "PR_BOLD" },
    { text: "  WALIOFANYA MTIHANI", font: "PR_REG" },
  ], left, fullWidth);
  drawCenteredMixedLine(doc, [
    { text: "AMEPATA POINT  ", font: "PR_REG" },
    { text: `${student.points ?? "-"}`, font: "PR_BOLD" },
    { text: "  SAWA NA DIVISION  ", font: "PR_REG" },
    { text: `${student.division ?? "-"}`, font: "PR_BOLD" },
  ], left, fullWidth);
  doc.moveDown(0.25);
  doc.font("PR_BOLD").fontSize(7).fillColor(NECTA_TEXT)
    .text("MAELEZO YA ALAMA:", left, doc.y, { width: fullWidth, lineGap: 0 });
  doc.font("PR_REG").fontSize(7).fillColor(NECTA_TEXT);
  doc.text("I: A\u219275-100 (Nzuri sana), B\u219265-74 (Nzuri), C\u219245-64 (wastani), D\u219230-44 (Dhaifu), F\u21920-29 (Mbaya sana)", left, doc.y, { width: fullWidth, lineGap: 0 });
  doc.text("II: A\u2192 (Nzuri sana), B\u2192 (Nzuri), C\u2192 (Wastani), D\u2192 (Dhaifu), F\u2192 (Mbaya sana)", left, doc.y, { width: fullWidth, lineGap: 0 });
  doc.moveDown(0.22);

  // ── B: TAARIFA YA MAENDELEO YA TABIA YA MWANAFUNZI ────────────────────
  doc.font("PR_BOLD").fontSize(9.5).fillColor(NECTA_TEXT).text("B: TAARIFA YA MAENDELEO YA TABIA YA MWANAFUNZI", left, doc.y, { lineGap: 0 });
  doc.moveDown(0.15);

  const tabiaGrades = computeTabiaGrades(student.student_id, student.avg_grade);
  const bColW = [fullWidth * 0.44, fullWidth * 0.08, fullWidth * 0.40, fullWidth * 0.08];
  const bColX = [left, left + bColW[0], left + bColW[0] + bColW[1], left + bColW[0] + bColW[1] + bColW[2], right];
  const bHeadH = 14, bRowH = 17;
  y = doc.y;
  const bTop = y;
  doc.rect(left, y, fullWidth, bHeadH).fillColor(NECTA_HEAD_BG).fill();
  doc.font("PR_BOLD").fontSize(7.5).fillColor(NECTA_TEXT);
  ["TABIA", "DARAJA", "TABIA", "DARAJA"].forEach((h, i) => {
    doc.text(h, bColX[i] + 3, y + 2.8, { width: bColW[i] - 6, align: i % 2 === 0 ? "left" : "center" });
  });
  const bHLines = [y];
  y += bHeadH;
  bHLines.push(y);
  doc.font("PR_REG").fontSize(8.5);
  for (let i = 0; i < TABIA_LEFT.length; i++) {
    if (i % 2 === 1) { doc.rect(left, y, fullWidth, bRowH).fillColor(NECTA_BG).fill(); }
    doc.fillColor(NECTA_TEXT);
    doc.text(TABIA_LEFT[i], bColX[0] + 3, y + (bRowH - 8.5) / 2 - 1, { width: bColW[0] - 6, align: "left" });
    doc.text(tabiaGrades[TABIA_LEFT[i]], bColX[1] + 3, y + (bRowH - 8.5) / 2 - 1, { width: bColW[1] - 6, align: "center" });
    doc.text(TABIA_RIGHT[i], bColX[2] + 3, y + (bRowH - 8.5) / 2 - 1, { width: bColW[2] - 6, align: "left" });
    doc.text(tabiaGrades[TABIA_RIGHT[i]], bColX[3] + 3, y + (bRowH - 8.5) / 2 - 1, { width: bColW[3] - 6, align: "center" });
    y += bRowH;
    bHLines.push(y);
  }
  drawVLinesGroove(doc, bColX, bTop, y);
  flushHLinesGroove(doc, bHLines, left, right);
  doc.y = y + 8;

  // ── C: MAONI YA MWALIMU WA DARASA ─────────────────────────────────────
  doc.font("PR_BOLD").fontSize(9.5).fillColor(NECTA_TEXT).text("C: MAONI YA MWALIMU WA DARASA", left, doc.y, { lineGap: 0 });
  doc.moveDown(0.1);
  doc.font("PR_HAND").fontSize(19).fillColor("#1B2A6B")
    .text("Aongeze bidii katika masomo yake.", left + 4, doc.y, { lineGap: 0, underline: true });
  doc.moveDown(0.2);
  doc.font("PR_REG").fontSize(8.5).fillColor(NECTA_TEXT)
    .text(`Jina la Mwalimu wa Darasa: ${classTeacherName || "-"}`, left, doc.y, { lineGap: 0 });
  // Fixed, explicit gap (not a relative moveDown(), which advances by a
  // multiple of whatever font size happens to be active - fragile here
  // since the line right above switches between a large 19pt cursive font
  // and this normal 8.5pt one). This is intentionally kept TIGHT (close to
  // where "Sahihi:" originally sat) - unlike the stamp line below, this
  // signature box is short enough (SIG_BOX_H) that it doesn't need much
  // clearance, and a big gap here just reads as wasted blank space between
  // the Class Teacher's name and their own signature line.
  const afterJina = doc.y;
  const SIG_BOX_H = 28, SIG_BELOW = 5; // box height, and how far its bottom extends below the printed line
  const sigY = afterJina + 16;
  doc.font("PR_REG").fontSize(8.5).text("Sahihi: ", left, sigY, { continued: false, lineGap: 0 });
  const sahihiLabelW = doc.widthOfString("Sahihi: ");
  const sahihiLineStart = left + sahihiLabelW, sahihiLineEnd = left + 200, sahihiLineY = sigY + 9;
  doc.moveTo(sahihiLineStart, sahihiLineY).lineTo(sahihiLineEnd, sahihiLineY).lineWidth(0.8).strokeColor(NECTA_BORDER).stroke();
  // Class Teacher's OWN signature (Settings → "Signature & Stamp" →
  // per-Form Class Teacher signature) - drawn immediately after the word
  // "Sahihi:" ends (sahihiLineStart, computed from the label's actual
  // printed width, not a guessed offset) and ON TOP of the printed line,
  // like real ink resting on a signature line. Left as a blank line (same
  // as before this feature existed) whenever no signature is on file yet
  // for this Form, so nothing ever looks broken.
  if (classTeacherSignatureBuf) {
    try {
      const sigW = Math.min(140, sahihiLineEnd - sahihiLineStart - 4);
      doc.image(classTeacherSignatureBuf, sahihiLineStart + 2, sahihiLineY - SIG_BOX_H + SIG_BELOW, { fit: [sigW, SIG_BOX_H], align: "left", valign: "bottom" });
    } catch { /* signature failed to load - leave the blank line */ }
  }
  doc.y = sigY + 14;

  // ── D: MAAGIZO ─────────────────────────────────────────────────────
  doc.font("PR_BOLD").fontSize(9.5).fillColor(NECTA_TEXT).text("D: MAAGIZO", left, doc.y, { lineGap: 0 });
  doc.moveDown(0.15);
  const maagizo = [
    "a) Ili kuweza kuhakikisha anafanya vizuri, fuatilia kwa karibu maendeleo yake.",
    "b) Hakikisha anahudhuria shule na kufanya kazi za kitaaluma anazopewa na Mwalimu wake.",
    "c) Uongozi wa Shule unakutaka Mzazi/Mlezi uwe na mawasiliano ya mara kwa mara na shule kupitia Mwalimu wa darasa ili kufahamu kwa karibu mwenendo na tabia za kijana wetu awapo shuleni.",
    "d) Usimamizi zaidi unahitajika, kama mwanao hakai kambini jitahidi sana umlete kambini ili akae mazingira ya karibu na Shule kwa usimamizi mzuri zaidi.",
  ];
  doc.font("PR_REG").fontSize(8.6).fillColor(NECTA_TEXT);
  maagizo.forEach((m) => { doc.text(m, left, doc.y, { width: fullWidth, align: "left", lineGap: 0.3 }); doc.moveDown(0.08); });
  doc.moveDown(0.03);
  doc.font("PR_BOLD").fontSize(8.5).fillColor(NECTA_TEXT)
    .text(`Shule Imefungwa leo tarehe ${closingDateText || "-"}, na Itafunguliwa tarehe ${openingDateText || "-"}.`, left, doc.y, { width: fullWidth, lineGap: 0 });
  doc.moveDown(0.35);

  doc.font("PR_BOLD").fontSize(8.5).fillColor(NECTA_TEXT).text("MAONI YA MKUU WA SHULE", left, doc.y, { lineGap: 0 });
  doc.moveDown(0.1);
  doc.font("PR_HAND").fontSize(19).fillColor("#1B2A6B")
    .text("Azingatie Maoni ya mwalimu wa darasa", left + 4, doc.y, { lineGap: 0, underline: true });
  // Fixed, explicit gap - see the identical note on afterJina/sigY above.
  // The stamp box (STAMP_H=52) is considerably taller than the old
  // relative moveDown(0.25) ever reserved room for, which is exactly why
  // the stamp was overlapping "Azingatie Maoni..." above it: the gap
  // simply wasn't big enough for a box that tall, regardless of how well
  // the image itself had been cropped.
  const afterAzingatie = doc.y;
  const STAMP_W = 70, STAMP_H = 52, STAMP_BELOW = 8; // box size, and how far its bottom extends below the printed line
  const HM_SIG_BOX_H = 34, HM_SIG_BELOW = 4;
  const sigY2 = afterAzingatie + 40;
  doc.font("PR_REG").fontSize(8.5).fillColor(NECTA_TEXT).text("MHURI/SAINI YA MKUU WA SHULE: ", left, sigY2, { lineGap: 0 });
  const labelW = doc.widthOfString("MHURI/SAINI YA MKUU WA SHULE: ");
  const hmLineStart = left + labelW + 4, hmLineY = sigY2 + 9;
  doc.moveTo(hmLineStart, hmLineY).lineTo(right, hmLineY).lineWidth(0.8).strokeColor(NECTA_BORDER).stroke();
  // Head Master's signature + the school stamp (Settings → "Signature &
  // Stamp"). The STAMP sits FIRST, immediately after the "MHURI/SAINI YA
  // MKUU WA SHULE:" label ends (per spec - not floated to the far right of
  // the line), its bottom edge anchored to the printed line (align/valign
  // "bottom" inside its box) so it visibly sits ON the line regardless of
  // its cropped aspect ratio, the way a real rubber stamp overlaps a
  // signature line. Tanzanian school stamps are usually a wide rectangle
  // (name/box/date fields), not a circle, so the box is wider than it is
  // tall rather than a fixed square. The signature fills whatever space
  // remains to its right, bottom-anchored the same way. Either, both, or
  // neither may be on file - each is drawn independently and the blank
  // line is left untouched if not.
  const stampX = hmLineStart;
  const hmSigStart = stampX + STAMP_W + 8;
  const hmSigMaxW = Math.max(0, right - hmSigStart);
  // Head Master's signature is intentionally NEVER drawn here - per spec,
  // it belongs on the Student Identity Card only. Only the school stamp
  // (still uploaded from the same Settings screen) and the Class
  // Teacher's own signature appear on this report.
  if (schoolStampBuf) {
    try {
      doc.image(schoolStampBuf, stampX, hmLineY - STAMP_H + STAMP_BELOW, { fit: [STAMP_W, STAMP_H], align: "center", valign: "bottom" });
    } catch { /* stamp failed to load - leave the blank line */ }
  }
}

// Downloads a student's photo (a small Cloudinary derivative sized for
// exactly how it's displayed here, same approach the Student Profile PDF
// already uses in studentController.js) into a Buffer for embedding.
// Returns null (never throws) on any failure, so a broken/slow image link
// never breaks the report - it just falls back to the empty bordered box.
async function fetchImageBuffer(url) {
  if (!url) return null;
  try {
    const { cloudinaryResized } = require("../middleware/upload");
    const resp = await fetch(cloudinaryResized(url, "w_180,h_220,c_fill,q_auto,f_auto"));
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch { return null; }
}

// Same idea, but for the Head Master signature / school stamp / Class
// Teacher signature (Settings → "Signature & Stamp"). Unlike the student
// photo above, these must NEVER be cropped (c_fill) - a signature/stamp
// squeezed or cut to a fixed box would look wrong - so this uses c_limit
// (scales down, preserves aspect ratio, never upscales) and forces the PNG
// format explicitly (f_png, not f_auto) since PDFKit's doc.image() can only
// embed JPEG or PNG - f_auto could hand back a WebP/AVIF derivative on some
// requests, which would silently fail to embed. Quality is left at its
// original level (q_100, not q_auto) - these are already tiny, tightly
// cropped graphics (see signatureBackground.js), so there is no real file
// -size cost to paying for full quality, and any compression here would
// visibly soften fine ink strokes that are only a pixel or two wide once
// printed at report size.
async function fetchBrandingImageBuffer(url, maxDim = 500) {
  if (!url) return null;
  try {
    const { cloudinaryResized } = require("../middleware/upload");
    const resp = await fetch(cloudinaryResized(url, `w_${maxDim},h_${maxDim},c_limit,q_100,f_png`));
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch { return null; }
}

// Loads everything drawParentReportPage needs for ONE student: their row
// from student_results (+ photo_url, joined from students), their
// per-subject marks/grades (with subject names, in the school's fixed
// subject order), and the sheet/class-teacher context shared by every
// student on that sheet.
async function loadParentReportContext(sheet_id) {
  const sheetRes = await query(
    `SELECT ss.*, ap.exam_type, ap.month, ap.year FROM score_sheets ss JOIN academic_periods ap ON ap.id = ss.period_id WHERE ss.id = $1`,
    [sheet_id]
  );
  const sheet = sheetRes.rows[0];
  if (!sheet) return null;

  const classTeacherName = await getClassTeacherName(sheet.form);

  const studentsRes = await query(
    `SELECT sr.*, st.photo_url FROM student_results sr JOIN students st ON st.id = sr.student_id
     WHERE sr.sheet_id = $1 ORDER BY sr.gender ASC, sr.reg_no ASC NULLS LAST, sr.student_id ASC`,
    [sheet_id]
  );
  const totalStudents = studentsRes.rows.length;

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

  const students = studentsRes.rows.map((s) => ({ ...s, total_students: totalStudents }));

  // Signature/stamp sources (Settings → "Signature & Stamp") - the Head
  // Master's own signature + the school stamp are school-wide (one row),
  // the Class Teacher signature is looked up for THIS sheet's Form, same
  // way getClassTeacherName above resolves "today's Class Teacher of this
  // Form" rather than a fixed person tied to when the sheet was created.
  const [brandRes, ctSigRes] = await Promise.all([
    query("SELECT headmaster_signature_url, school_stamp_url FROM school_settings WHERE id = 1"),
    query("SELECT signature_url FROM class_teacher_signatures WHERE form = $1", [sheet.form]),
  ]);
  const brand = brandRes.rows[0] || {};

  return {
    sheet, classTeacherName, students, scoresByStudent,
    headmasterSignatureUrl: brand.headmaster_signature_url || null,
    schoolStampUrl: brand.school_stamp_url || null,
    classTeacherSignatureUrl: ctSigRes.rows[0]?.signature_url || null,
  };
}

// A Class Teacher may only ever generate/preview the Parent Report for
// their OWN Form - Admin/Second Master/Academic have no such restriction.
// Used by all three parent-report endpoints below.
function canAccessParentReportForForm(req, form) {
  const roles = req.user.roles && req.user.roles.length ? req.user.roles : [req.user.role];
  if (roles.some((r) => ["admin", "second_master", "academic"].includes(r))) return true;
  if (roles.includes("class_teacher")) return req.user.class_teacher_of === form;
  return false;
}

// GET /api/results-mgmt/parent-report/export-pdf?sheet_id=&student_id=&mhula=&closing_day=&closing_month=&closing_year=&opening_day=&opening_month=&opening_year=
const exportParentReportPdf = async (req, res, next) => {
  const { sheet_id, student_id, mhula, closing_day, closing_month, closing_year, opening_day, opening_month, opening_year } = req.query;
  if (!sheet_id || !student_id) return res.status(400).json({ error: "sheet_id and student_id required." });
  try {
    const ctx = await loadParentReportContext(sheet_id);
    if (!ctx) return res.status(404).json({ error: "Sheet not found." });
    if (!canAccessParentReportForForm(req, ctx.sheet.form)) return res.status(403).json({ error: "You can only generate reports for your own class." });
    const student = ctx.students.find((s) => String(s.student_id) === String(student_id));
    if (!student) return res.status(404).json({ error: "Student not found in this sheet." });
    const subjectScores = ctx.scoresByStudent[student.student_id] || [];
    const [headmasterSignatureBuf, schoolStampBuf, classTeacherSignatureBuf] = await Promise.all([
      fetchBrandingImageBuffer(ctx.headmasterSignatureUrl),
      fetchBrandingImageBuffer(ctx.schoolStampUrl),
      fetchBrandingImageBuffer(ctx.classTeacherSignatureUrl),
    ]);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Ripoti-ya-Mzazi-${student.full_name.replace(/\s+/g, "-")}.pdf"`);
    const doc = new PDFDocument({ margin: 36, size: "A4", bufferPages: true });
    doc.pipe(res);
    registerParentReportFonts(doc);
    doc.rect(0, 0, doc.page.width, doc.page.height).fillColor(NECTA_SUMMARY_BG).fill();
    await drawParentReportPage(doc, {
      sheet: ctx.sheet, student, mhula: MHULA_OPTIONS.includes(mhula) ? mhula : (mhula || ""),
      classTeacherName: ctx.classTeacherName,
      closingDateText: formatSwDate(closing_day, closing_month, closing_year),
      openingDateText: formatSwDate(opening_day, opening_month, opening_year),
      subjectScores,
      headmasterSignatureBuf, schoolStampBuf, classTeacherSignatureBuf,
    });
    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

// GET /api/results-mgmt/parent-report/export-pdf-all?sheet_id=&mhula=&closing_day=...
// Same report, one student per page, for every student on the sheet, in a
// single downloadable PDF - so the Academic Master can print/send the
// whole class's reports at once instead of one-by-one.
const exportParentReportPdfAll = async (req, res, next) => {
  const { sheet_id, mhula, closing_day, closing_month, closing_year, opening_day, opening_month, opening_year } = req.query;
  if (!sheet_id) return res.status(400).json({ error: "sheet_id required." });
  try {
    const ctx = await loadParentReportContext(sheet_id);
    if (!ctx) return res.status(404).json({ error: "Sheet not found." });
    if (!canAccessParentReportForForm(req, ctx.sheet.form)) return res.status(403).json({ error: "You can only generate reports for your own class." });
    if (!ctx.students.length) return res.status(404).json({ error: "No results found for this sheet." });
    const [headmasterSignatureBuf, schoolStampBuf, classTeacherSignatureBuf] = await Promise.all([
      fetchBrandingImageBuffer(ctx.headmasterSignatureUrl),
      fetchBrandingImageBuffer(ctx.schoolStampUrl),
      fetchBrandingImageBuffer(ctx.classTeacherSignatureUrl),
    ]);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Ripoti-za-Wazazi-${ctx.sheet.form.replace(/\s+/g, "-")}.pdf"`);
    const doc = new PDFDocument({ margin: 36, size: "A4", bufferPages: true });
    doc.pipe(res);
    registerParentReportFonts(doc);
    const mhulaFinal = MHULA_OPTIONS.includes(mhula) ? mhula : (mhula || "");
    const closingDateText = formatSwDate(closing_day, closing_month, closing_year);
    const openingDateText = formatSwDate(opening_day, opening_month, opening_year);

    for (let i = 0; i < ctx.students.length; i++) {
      if (i > 0) doc.addPage();
      doc.rect(0, 0, doc.page.width, doc.page.height).fillColor(NECTA_SUMMARY_BG).fill();
      const student = ctx.students[i];
      await drawParentReportPage(doc, {
        sheet: ctx.sheet, student, mhula: mhulaFinal, classTeacherName: ctx.classTeacherName,
        closingDateText, openingDateText,
        subjectScores: ctx.scoresByStudent[student.student_id] || [],
        headmasterSignatureBuf, schoolStampBuf, classTeacherSignatureBuf,
      });
    }
    drawFooter(doc, formatTZ);
    doc.end();
  } catch (err) { next(err); }
};

// GET /api/results-mgmt/parent-report/meta?sheet_id= - lets the frontend
// show the Class Teacher's name and student count in the picker BEFORE the
// person commits to a download, and the fixed Mhula choice list.
const getParentReportMeta = async (req, res, next) => {
  const { sheet_id } = req.query;
  if (!sheet_id) return res.status(400).json({ error: "sheet_id required." });
  try {
    const ctx = await loadParentReportContext(sheet_id);
    if (!ctx) return res.status(404).json({ error: "Sheet not found." });
    if (!canAccessParentReportForForm(req, ctx.sheet.form)) return res.status(403).json({ error: "You can only view reports for your own class." });
    res.json({
      class_teacher_name: ctx.classTeacherName,
      student_count: ctx.students.length,
      mhula_options: MHULA_OPTIONS,
    });
  } catch (err) { next(err); }
};

module.exports = {
  getPeriods, createOrFindPeriod, getSheet, createSheet, saveScores,
  deleteTeacherResults, unlockTeacher, toggleInclude, lockTeacher, getTeacherLock, requestUnlock,
  getMyScores, getResults, getSubmittedSheets, getTeacherStatus, getHistory, getFullExcel,
  getResultsAnalytics,
  getTeacherEvaluationTeachers, getTeacherEvaluation, exportTeacherEvaluationPdf,
  publicResults, listPublishedResults, publishResult, publishResultFromSheet, toggleResult, deleteResult, downloadPublishedResult,
  exportMyScoresPdf, exportResultsPdf, exportResultsExcel,
  getStudentPeriods, getStudentResult, exportStudentResultPdf, getStudentTrend,
  getParentReportMeta, exportParentReportPdf, exportParentReportPdfAll,
  toggleSheetOnlinePublish,
  publicResultsCheckUsername, publicResultsLogin, requirePublicResultToken, publicResultsMe,
};
