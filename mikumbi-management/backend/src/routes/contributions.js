const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/auth");
const {
  getPartTime, payPartTime, payPartTimeAdvance, getPartTimeSummary, getPartTimeHistory, receiptPartTime,
  getPartTimeStudents, getPartTimeStudentEntries, getContributedStudentsCount, getPartTimeDaily,
  getReam, getReamSummary, getOtherExpenses, updateChargeAmount, receiptCharge,
  getReamMyClass, markReam, exportPartTimeStudentsPdf,
} = require("../controllers/contributionsController");

// Contributions Management is visible to: Head Master, Second Master, and
// Academic Master (History/read-only — enforced here at the route level,
// not just hidden in the frontend UI), and Class Teacher (their own class's
// Part-Time Teachers collection only — enforced inside the controllers via
// classScopeFor()).
router.use(auth(["admin", "second_master", "academic", "class_teacher"]));

// ── Part-time Teachers ────────────────────────────────────────────────────
router.get("/parttime",                  getPartTime);
// Recording a payment is admin/second_master/class_teacher only — Academic
// Master is read-only (History), so is deliberately left out here even
// though the router.use() above lets them through for the GET routes.
router.post("/parttime/:studentId",      auth(["admin", "second_master", "class_teacher"]), payPartTime);
router.post("/parttime/:studentId/advance", auth(["admin", "second_master", "class_teacher"]), payPartTimeAdvance);
router.get("/receipt/parttime/:id",      receiptPartTime);
// Daily Collections — a class teacher sees their own class (auto-scoped);
// admin/second_master/academic see every class, or one via ?form=.
router.get("/parttime/daily",            getPartTimeDaily);

// Class-level aggregate views — Head Master/Second Master/Academic Master only.
router.get("/parttime/summary", auth(["admin", "second_master", "academic"]), getPartTimeSummary);
router.get("/parttime/history", auth(["admin", "second_master", "academic"]), getPartTimeHistory);
// Student History — Head Master/Second Master/Academic Master see every
// class; a class_teacher also gets this (scoped to their own class only,
// enforced inside the controllers via classScopeFor()).
router.get("/parttime/students", auth(["admin", "second_master", "academic", "class_teacher"]), getPartTimeStudents);
router.get("/parttime/students/pdf", auth(["admin", "second_master", "academic", "class_teacher"]), exportPartTimeStudentsPdf);
router.get("/parttime/student/:studentId/entries", auth(["admin", "second_master", "academic", "class_teacher"]), getPartTimeStudentEntries);
router.get("/summary/students-count", auth(["admin", "second_master", "academic", "class_teacher"]), getContributedStudentsCount);
router.get("/ream/summary",     auth(["admin", "second_master", "academic"]), getReamSummary);

// ── Ream ──────────────────────────────────────────────────────────────────
router.get("/ream", auth(["admin", "second_master", "academic"]), getReam);
router.get("/ream/my-class", getReamMyClass); // class_teacher's own class — scope enforced in controller
// Recording Ream is admin/second_master/class_teacher only — same reasoning
// as payPartTime above; Academic Master stays read-only (History/summary).
router.post("/ream/:studentId", auth(["admin", "second_master", "class_teacher"]), markReam); // one-time per year; scope + duplicate check enforced in controller

// ── Other Expenses ────────────────────────────────────────────────────────
router.get("/other", auth(["admin", "second_master", "academic"]), getOtherExpenses);

// ── Shared: edit payment amount / receipt for Ream + Other Expenses ───────
router.put("/charge/:chargeId",          auth(["admin", "second_master"]), updateChargeAmount);
router.get("/receipt/charge/:chargeId",  receiptCharge);

module.exports = router;
