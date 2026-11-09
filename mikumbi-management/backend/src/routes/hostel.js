const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/auth");
const {
  getRooms, createRoom, updateRoom, deleteRoom, searchOccupants,
  getStats, assignStudent, getBoysOccupants, admitBoysHall,
  removeOccupant, permanentlyDeleteOccupant, getOccupant, getHistory, getHistoryByClass,
  getContributions, addContribution, deleteContribution,
  getDiscipline, addDiscipline,
  exportOccupantPdf, exportHostelListPdf, exportDisciplinePdf, exportContributionReceipt,
} = require("../controllers/hostelController");

router.use(auth(["admin", "second_master", "patron", "matron"]));

// ── Rooms & Beds (Girls Hostel only) ─────────────────────────────────────────
// Room setup, admission, contribution collection and discipline records are
// Matron/Patron ONLY — Admin/Second Master have read-only (History) access
// to this module and must never be able to admit students or collect fees,
// even by calling these endpoints directly.
router.get("/rooms",                 getRooms);
router.post("/rooms",   auth(["patron","matron"]), createRoom);
router.put("/rooms/:id", auth(["patron","matron"]), updateRoom);
router.delete("/rooms/:id", auth(["patron","matron"]), deleteRoom);
router.post("/rooms/:roomId/assign", auth(["patron","matron"]), assignStudent);

// ── Boys Hostel (Hall — no rooms) ───────────────────────────────────────────
router.get("/boys",  getBoysOccupants);
router.post("/boys", auth(["patron","matron"]), admitBoysHall);

// ── Stats ────────────────────────────────────────────────────────────────────
router.get("/stats", getStats);

// ── Occupants (shared) ────────────────────────────────────────────────────────
router.get("/occupants",               searchOccupants); // must come before /occupants/:id
router.get("/occupants/:id",           getOccupant);
router.get("/occupants/:id/history",   getHistory);
router.get("/occupants/:id/pdf",       exportOccupantPdf);
router.get("/history-by-class",        getHistoryByClass);
router.delete("/occupants/:occupantId", auth(["patron","matron"]), removeOccupant);
// Hard delete - ONLY for correcting a mistaken registration (wrong student,
// duplicate entry). Fully erases the record so it stops appearing in
// History - unlike the soft-delete above, which intentionally keeps a
// "Departed" record forever for real departures. See hostelController.js.
// Also allowed for admin/second_master (Head Master/Second Master) - not
// just patron/matron - since the ONLY place this action is reachable from
// for those two roles is the read-only History view (a mistakenly
// registered student who was then "Removed" no longer appears as a
// current occupant anywhere a patron/matron would see them either, so
// without this the Head Master/Second Master had literally no way to
// correct such a mistake themselves).
router.delete("/occupants/:occupantId/permanent", auth(["admin","second_master","patron","matron"]), permanentlyDeleteOccupant);

// ── Contributions ──────────────────────────────────────────────────────────────
router.get("/occupants/:id/contributions",  getContributions);
router.post("/occupants/:id/contributions", auth(["patron","matron"]), addContribution);
router.delete("/contributions/:id",         auth(["patron","matron"]), deleteContribution);
router.get("/contributions/:id/receipt",    exportContributionReceipt);

// ── Discipline ─────────────────────────────────────────────────────────────────
router.get("/discipline/pdf", exportDisciplinePdf);
router.get("/discipline",  getDiscipline);
router.post("/discipline", auth(["patron","matron"]), addDiscipline);

// ── PDF export ──────────────────────────────────────────────────────────────────
router.get("/pdf", exportHostelListPdf);

module.exports = router;
