// routes/public.js — everything reachable from the landing page's
// Publications section WITHOUT a staff login: the parent/student Results
// portal, and the Joining Instructions public application + download.
const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const {
  publicResultsCheckUsername, publicResultsLogin,
  requirePublicResultToken, publicResultsMe,
} = require("../controllers/resultsController");
const {
  publicJoiningStatus, submitJoining, downloadJoiningPdf, verifyJoiningDocument,
} = require("../controllers/joiningController");
const { verifyGenericDocument } = require("../controllers/verifyController");
const { verifyIdCard } = require("../controllers/idCardController");

// Same IP+identifier keying strategy as the staff auth limiter — a whole
// school/village sharing one public IP shouldn't be able to lock each
// other out of checking results.
const resultsLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Majaribio mengi ya kuingia. Tafadhali subiri dakika 15." },
  keyGenerator: (req) => {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const username = req.body && typeof req.body.username === "string" ? req.body.username.trim().toLowerCase() : "";
    return `${ip}:${username}`;
  },
});

// Per-IP ceiling on top of the per-number limiter above: without it one
// device could try thousands of DIFFERENT login numbers (each got its own
// 20-attempt budget). 60 per 15 min still lets a whole school on one
// connection check results normally.
const resultsIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { message: "Majaribio mengi kutoka kifaa/mtandao huu. Tafadhali subiri dakika 15." },
  keyGenerator: (req) => req.ip || req.socket?.remoteAddress || "unknown",
});

// Verification pages are public; this stops anyone hammering them to guess references.
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: "Too many requests.",
  keyGenerator: (req) => req.ip || req.socket?.remoteAddress || "unknown",
});

const joiningSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: "Maombi mengi kwa muda mfupi. Tafadhali subiri kidogo." },
  keyGenerator: (req) => req.ip || req.socket?.remoteAddress || "unknown",
});

// ── Results portal (Publications → "Results") ───────────────────────────
router.post("/results/check-username", resultsIpLimiter, resultsLoginLimiter, publicResultsCheckUsername);
router.post("/results/login", resultsIpLimiter, resultsLoginLimiter, publicResultsLogin);
router.get("/results/me", requirePublicResultToken, publicResultsMe);

// ── Joining Instructions (Publications → "Joining Instructions") ────────
router.get("/joining/status", publicJoiningStatus);
router.post("/joining/submit", joiningSubmitLimiter, submitJoining);
router.get("/joining/download-pdf", downloadJoiningPdf);
router.get("/joining/verify/:ref", verifyLimiter, verifyJoiningDocument);

// ── Generic document verification (footer QR on every other exported PDF —
//    Contributions, Food Contribution, TAMS, Hostel, Student Management,
//    Results, Timetable...) ───────────────────────────────────────────────
router.get("/verify", verifyGenericDocument);

// ── Student Identity Card verification (back-side QR) ──────────────────
router.get("/id-card/verify/:studentId", verifyLimiter, verifyIdCard);

module.exports = router;
