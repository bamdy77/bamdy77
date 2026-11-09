const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  getJoiningSettings, updateJoiningSettings, publishJoiningSettings,
  listJoiningApplications, getJoiningStats, manualIssueJoining,
  exportJoiningApplicationsCsv, deleteJoiningApplication, deleteAllJoiningApplications,
  downloadBlankJoiningPdf, previewJoiningPdf,
} = require("../controllers/joiningController");

// Every route here requires a logged-in staff account.
router.use(auth());

// Requirements text + publish toggle — Admin/Second Master only (per spec:
// "Admin/second Master watakuwa na sehemu ya kuandika mahitaji...ili wa-publish").
router.get("/settings", auth(["admin", "second_master"]), getJoiningSettings);
router.put("/settings", auth(["admin", "second_master"]), updateJoiningSettings);
router.post("/settings/publish", auth(["admin", "second_master"]), publishJoiningSettings);
router.post("/preview-pdf", auth(["admin", "second_master"]), previewJoiningPdf);

// Applicant list ("Yatahifadhiwe...ndio atayaona pekee") — Admin/Second Master only.
router.get("/applications", auth(["admin", "second_master"]), listJoiningApplications);
router.get("/applications/export", auth(["admin", "second_master"]), exportJoiningApplicationsCsv);
router.delete("/applications/all", auth(["admin", "second_master"]), deleteAllJoiningApplications);
router.delete("/applications/:id", auth(["admin", "second_master"]), deleteJoiningApplication);

// Online-vs-manual counts — visible to everyone who can reach this module.
router.get("/stats", auth(["admin", "second_master", "academic"]), getJoiningStats);

// Issue a Joining Instruction in person — Admin/Second Master/Academic Master.
router.post("/manual", auth(["admin", "second_master", "academic"]), manualIssueJoining);

// Printable blank template (no power/no internet at school) — Admin/Second
// Master/Academic Master.
router.get("/blank-pdf", auth(["admin", "second_master", "academic"]), downloadBlankJoiningPdf);

module.exports = router;
