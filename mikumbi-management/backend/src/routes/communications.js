const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const c = require("../controllers/communicationsController");

// ── Announcements ──
// Spec: Communications (both Announcements and SMS) is Head Master / Second
// Master only — Academic Master must NOT see this page at all, hence
// "academic" is deliberately absent from every auth() list below.
router.get("/announcements",         auth(["admin", "second_master"]), c.listAnnouncements);
router.get("/announcements/public",  c.listPublicAnnouncements); // PUBLIC website (audience public/both), no login
router.get("/announcements/staff",   auth(), c.listStaffAnnouncements); // staff dashboard banner (audience staff/both), any logged-in role
router.post("/announcements",        auth(["admin", "second_master"]), c.createAnnouncement);
router.delete("/announcements/:id",  auth(["admin", "second_master"]), c.deleteAnnouncement);

// ── SMS Service — Admin (Head Master) only, per module visibility rules ──
router.get("/sms/contacts/:type",       auth(["admin", "second_master"]), c.listContacts);
router.post("/sms/contacts/:type",      auth(["admin", "second_master"]), c.addContact);
router.delete("/sms/contacts/:type/:id", auth(["admin", "second_master"]), c.deleteContact);
router.post("/sms/send",                auth(["admin", "second_master"]), require("../utils/smsLimiter"), c.sendSms);
router.get("/sms/history",              auth(["admin", "second_master"]), c.smsHistory);
router.delete("/sms/history/failed",    auth(["admin", "second_master"]), c.deleteFailedSms);

module.exports = router;
