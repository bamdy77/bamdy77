const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const c = require("../controllers/resultsController");

// ── Public (no login) — for the landing page "Publications" section ──
router.get("/public", c.publicResults);
router.get("/published/:id/file", c.downloadPublishedResult);

// Everything below requires login. Admin (Head Master) and Academic Master
// administer periods/sheets/publishing; Teachers can only touch their own
// scores (enforced again inside the controller, not just here).
router.get("/periods",  auth(["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"]), c.getPeriods);
router.post("/periods", auth(["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"]), c.createOrFindPeriod);

router.get("/sheet",  auth(["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"]), c.getSheet);
router.post("/sheet", auth(["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"]), c.createSheet);

router.put("/save",                     auth(["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"]), c.saveScores);
router.delete("/teacher-results",       auth(["admin", "second_master", "academic"]), c.deleteTeacherResults);
router.post("/unlock",                  auth(["admin", "second_master", "academic"]), c.unlockTeacher);
router.patch("/teacher-status/include", auth(["admin", "second_master", "academic"]), c.toggleInclude);
router.post("/lock-teacher",            auth(["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"]), c.lockTeacher);
router.get("/teacher-lock",             auth(["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"]), c.getTeacherLock);

// ── Unlock Request — a teacher taps one button to ask the Academic Master
//    to unlock their locked/submitted subject; no free-text reason. ──
router.post("/unlock-request",          auth(["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"]), c.requestUnlock);

router.get("/my-scores",      auth(["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"]), c.getMyScores);
router.get("/my-scores/export-pdf", auth(["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"]), c.exportMyScoresPdf);
router.get("/results",        auth(["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"]), c.getResults);
router.get("/export-pdf",     auth(["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"]), c.exportResultsPdf);
router.get("/export-excel",   auth(["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"]), c.exportResultsExcel);
router.get("/submitted",      auth(["admin", "second_master", "academic"]), c.getSubmittedSheets);
router.get("/teacher-status", auth(["admin", "second_master", "academic"]), c.getTeacherStatus);
router.get("/history",        auth(["admin", "second_master", "academic"]), c.getHistory);
router.get("/full-excel",     auth(["admin", "second_master", "academic"]), c.getFullExcel);

// ── Analytics Dashboard — multi-period performance trends (e.g. "does Form
//    II keep dropping in Physics every year?"). Head Master / Second
//    Master ONLY, per explicit spec — not Academic Master. ──
router.get("/analytics", auth(["admin", "second_master"]), c.getResultsAnalytics);

// ── Analytics Dashboard — ONE student's GPA history across every period
//    they have a result in, plus a trend-based projection. Admin, Second
//    Master, Academic Master, and Teacher (Teacher sees only the subjects
//    they teach, per their subject_ids). ──
router.get("/student-trend", auth(["admin", "second_master", "academic", "teacher"]), c.getStudentTrend);

// ── Teachers Evaluation — Admin (Head Master) only, per explicit spec:
//    not Second Master, not Academic Master. ──
router.get("/teacher-evaluation/teachers",    auth(["admin"]), c.getTeacherEvaluationTeachers);
router.get("/teacher-evaluation",             auth(["admin"]), c.getTeacherEvaluation);
router.get("/teacher-evaluation/export-pdf",  auth(["admin"]), c.exportTeacherEvaluationPdf);

// ── One student's results (Students Management "Search Results" for
//    Admin/Second Master, and the same lookup on Results Management for
//    the Academic Master) ──
router.get("/student-periods",         auth(["admin", "second_master", "academic"]), c.getStudentPeriods);
router.get("/student-result",          auth(["admin", "second_master", "academic"]), c.getStudentResult);
router.get("/student-result/export-pdf", auth(["admin", "second_master", "academic"]), c.exportStudentResultPdf);

// ── Ripoti ya Mzazi (Parent Report) - Kiswahili report-card addressed to
//    a student's parent/guardian. Admin/Second Master/Academic can generate
//    for any class; a Class Teacher can generate ONLY for their own class
//    (enforced server-side in the controller via canAccessParentReportForForm,
//    not just hidden in the UI). ──
const PARENT_REPORT_ROLES = ["admin", "second_master", "academic", "class_teacher"];
router.get("/parent-report/meta",            auth(PARENT_REPORT_ROLES), c.getParentReportMeta);
router.get("/parent-report/export-pdf",      auth(PARENT_REPORT_ROLES), c.exportParentReportPdf);
router.get("/parent-report/export-pdf-all",  auth(PARENT_REPORT_ROLES), c.exportParentReportPdfAll);

// ── Send Results to Parents via SMS (NextSMS) — Admin/Second Master/
//    Academic Master only, same gate as Parent Report (PDF) above. ──
const smsC = require("../controllers/resultsSmsController");
router.post("/results-sms/preview", auth(["admin", "second_master", "academic"]), smsC.previewResultsSms);
router.post("/results-sms/send",    auth(["admin", "second_master", "academic"]), smsC.sendResultsSms);

// ── Published Results (PDFs on the landing page "Publications" tab) ──
const { uploadResultsPdf } = require("../middleware/upload");
router.get("/published",         auth(["admin", "second_master", "academic"]), c.listPublishedResults);
router.post("/published",        auth(["admin", "second_master", "academic"]), uploadResultsPdf.single("pdf"), c.publishResult);
router.post("/published/from-sheet", auth(["admin", "second_master", "academic"]), c.publishResultFromSheet);
router.patch("/published/:id/toggle", auth(["admin", "second_master", "academic"]), c.toggleResult);
router.delete("/published/:id",  auth(["admin", "second_master", "academic"]), c.deleteResult);

// ── Publish ONE compiled sheet to the public Results portal (Publications
//    → "Results", Reg No + parent-phone login). Separate from the
//    Published-PDFs mechanism above — this gates the per-student online
//    view, not a downloadable bulk PDF. ──
router.get("/online-sheets", auth(["admin", "second_master", "academic"]), c.listOnlineSheets);
router.patch("/online-publish/:sheet_id", auth(["admin", "second_master", "academic"]), c.toggleSheetOnlinePublish);

module.exports = router;
