const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/auth");
const {
  getStudents, getStudent, createStudent, updateStudent,
  deleteStudent, getStats, addCharge, markChargePaid, deleteCharge,
  getHistory, exportStudentPdf, exportStudentsListPdf, uploadPhoto, deletePhoto,
  markTransferredOut, exportStudentReportPdf, promoteStudents, deleteOldGraduatedStudents,
  previewStudentImport, commitStudentImport,
} = require("../controllers/studentController");
const { uploadStudentPhoto, uploadStudentRoster } = require("../middleware/upload");

// Any logged-in role may READ the student roster (Results Management,
// Hostel, and Contributions all need to look students up) — but only
// Admin/Second Master can create, edit, delete, or export full records,
// since full Student Management (enrollment) is their domain alone.
router.use(auth());

router.get("/stats",                           auth(["admin","second_master"]), getStats);
router.get("/pdf",                             auth(["admin","second_master"]), exportStudentsListPdf); // must come before /:id
router.get("/",                                getStudents);
router.get("/:id",                             getStudent);
router.get("/:id/pdf",                         auth(["admin","second_master"]), exportStudentPdf);
router.get("/:id/report",                      auth(["admin","second_master"]), exportStudentReportPdf);
router.get("/:id/history",                     auth(["admin","second_master"]), getHistory);

// Enrolling a brand-new student, editing, or deleting is Admin-only.
router.post("/",         auth(["admin","second_master"]), createStudent);
router.put("/:id",       auth(["admin","second_master"]), updateStudent);
router.delete("/:id",    auth(["admin","second_master"]), deleteStudent);
router.patch("/:id/transfer-out", auth(["admin","second_master"]), markTransferredOut);
router.post("/promote", auth(["admin","second_master"]), promoteStudents);
router.delete("/graduated/cleanup", auth(["admin","second_master"]), deleteOldGraduatedStudents);

// Bulk Student Registration — upload a CSV/Excel roster instead of typing
// each student in one at a time. Preview parses + validates only (nothing
// saved); commit actually inserts the approved rows. Same Admin/Second
// Master-only access as every other student-creating endpoint above.
router.post("/bulk-import/preview", auth(["admin","second_master"]), uploadStudentRoster.single("file"), previewStudentImport);
router.post("/bulk-import/commit",  auth(["admin","second_master"]), commitStudentImport);

// Charges / Contributions
router.post("/:id/charges",                    auth(["admin","second_master"]), addCharge);
router.patch("/:id/charges/:chargeId/pay",     auth(["admin","second_master"]), markChargePaid);
router.delete("/:id/charges/:chargeId",        auth(["admin","second_master"]), deleteCharge);

// Photo (captured at enrollment or added later)
router.post("/:id/photo",   auth(["admin","second_master"]), uploadStudentPhoto.single("photo"), uploadPhoto);
router.delete("/:id/photo", auth(["admin","second_master"]), deletePhoto);

module.exports = router;
