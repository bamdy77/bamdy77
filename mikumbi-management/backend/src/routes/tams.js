const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { checkin, myHistory, dashboard, history, monthlySummary, attendanceTrend, exportPdf, getConfig } = require("../controllers/tamsController");

// Everyone who has TAMS access marks their own attendance / sees their own
// history — EXCEPT the Head Master (admin), who never checks in himself and
// must never appear here, by name or username; his account only needs a
// `teachers` link so he can be assigned periods in the Timetable Generator.
router.get("/config",     auth(["second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"]), getConfig);
router.post("/checkin",    auth(["second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"]), checkin);
router.get("/my-history",  auth(["second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"]), myHistory);

// Admin Overview (dashboard/history/monthly-summary) — admin and Second
// Master ONLY. Academic, Patron, and Matron mark their own attendance like
// any other teaching staff (via /config, /checkin, /my-history above) but
// must never see the school-wide reports — matches the frontend, where
// TAMS.jsx only ever renders AdminDashboard for "admin" and DualView for
// "second_master"; every other role always gets TeacherCheckIn only.
router.get("/dashboard",       auth(["admin", "second_master"]), dashboard);
router.get("/history",         auth(["admin", "second_master"]), history);
router.get("/monthly-summary", auth(["admin", "second_master"]), monthlySummary);
router.get("/attendance-trend", auth(["admin", "second_master"]), attendanceTrend);
router.get("/export-pdf",      auth(["admin", "second_master"]), exportPdf);

module.exports = router;
