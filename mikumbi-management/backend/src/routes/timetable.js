const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/auth");
const {
  getTimetable, generateTimetable, updateCell, clearCell, getTeacherTimetable,
  getPeriods, getAllPeriods, addPeriod, togglePeriod, deletePeriod,
  getEventTypes, addEventType,
  getEventSchedule, addEventSchedule, deleteEventSchedule,
  getGenerationStatus, getDrafts, deleteDraft,
  exportClassPdf, exportTeacherPdf, exportMasterPdf,
  getPublicStatus, publishDraft, unpublishDraft, getPublicClassesWithData,
  getSharedStatus, shareDraft, unshareDraft,
} = require("../controllers/timetableController");
const { query } = require("../db/db");

// A generated/saved draft is NOT automatically public — only once the Head
// Master explicitly publishes it (see /publish below) should the public
// Publications page be able to download it. This forces the requested
// draft to whichever one is currently published, and returns a friendly
// "not published yet" response otherwise, for every /public/pdf/* route.
const requirePublishedDraft = async (req, res, next) => {
  try {
    const { academic_year = "2025", term = "Term 1" } = req.query;
    const { rows } = await query(
      `SELECT draft_label FROM timetable_generations WHERE academic_year=$1 AND term=$2 AND is_published=true ORDER BY created_at DESC LIMIT 1`,
      [academic_year, term]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "The timetable has not been published yet." });
    req.query.draft = rows[0].draft_label;
    next();
  } catch (err) { next(err); }
};

// ── Public (no login) — Publications page on the landing site ──────────────
router.get("/public/status",                 getPublicStatus);
router.get("/public/classes-with-data",      requirePublishedDraft, getPublicClassesWithData);
router.get("/public/pdf/master",             requirePublishedDraft, exportMasterPdf);
router.get("/public/pdf/class",              requirePublishedDraft, exportClassPdf);
router.get("/public/pdf/teacher/:teacherId", requirePublishedDraft, exportTeacherPdf);
router.get("/public/teachers-list",          async (req, res, next) => {
  try {
    const result = await query(`
      SELECT t.id, t.short_name, t.full_name, u.username
      FROM teachers t LEFT JOIN users u ON u.id = t.user_id
      WHERE t.is_active = true ORDER BY COALESCE(u.username, t.full_name) ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

router.use(auth());

// ── Core timetable ───────────────────────────────────────────────────────────
router.get("/",                          getTimetable);
router.get("/teacher/:teacherId",        getTeacherTimetable);
router.post("/generate",  auth(["admin","second_master","academic"]), generateTimetable);
router.put("/cell",       auth(["admin","second_master","academic"]), updateCell);
router.delete("/cell",    auth(["admin","second_master","academic"]), clearCell);
router.get("/generation-status",         getGenerationStatus);
router.get("/drafts",                    getDrafts);
router.delete("/draft",   auth(["admin","second_master","academic"]), deleteDraft);
router.post("/publish",   auth(["admin","second_master","academic"]), publishDraft);
router.post("/unpublish", auth(["admin","second_master","academic"]), unpublishDraft);

// ── Share with Teachers (separate from public /publish above) — any
//    logged-in role may READ the shared status, only the generate-capable
//    roles may change it. ──
router.get("/shared-status",  getSharedStatus);
router.post("/share",   auth(["admin","second_master","academic"]), shareDraft);
router.post("/unshare", auth(["admin","second_master","academic"]), unshareDraft);

// ── Periods (P1-P7 core + optional afternoon periods from 14:10) ─────────────
router.get("/periods",                          getPeriods);
router.get("/periods/all",                      getAllPeriods);
router.post("/periods",   auth(["admin","second_master","academic"]), addPeriod);
router.patch("/periods/:id/toggle", auth(["admin","second_master","academic"]), togglePeriod);
router.delete("/periods/:id",       auth(["admin","second_master","academic"]), deletePeriod);

// ── Special event types (Debate, Subject Club, Religion, Sports & Games…) ────
router.get("/events",                       getEventTypes);
router.post("/events",  auth(["admin","second_master","academic"]), addEventType);

// ── Scheduled events (event + day + time + classes, before generating) ──────
router.get("/event-schedule",                       getEventSchedule);
router.post("/event-schedule",  auth(["admin","second_master","academic"]), addEventSchedule);
router.delete("/event-schedule/:id", auth(["admin","second_master","academic"]), deleteEventSchedule);

// ── PDF exports ───────────────────────────────────────────────────────────────
router.get("/pdf/master",             exportMasterPdf);
router.get("/pdf/class",              exportClassPdf);
router.get("/pdf/teacher/:teacherId", exportTeacherPdf);

module.exports = router;
