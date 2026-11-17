const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const auth = require("../middleware/auth");
const { askChatbot, chatbotStatus } = require("../controllers/chatbotController");

// Every logged-in role may ask - the controller itself is what scopes the
// answer to what that specific role can see. Rate-limited per-account
// (not just per-IP) since this calls a metered external API.
const chatbotLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: { ok: false, reason: "rate_limited" },
  keyGenerator: (req) => (req.user && req.user.id ? `user:${req.user.id}` : req.ip),
});

// Also a daily ceiling per account, so one account (or a stolen session)
// cannot run up the Gemini bill or use the assistant to probe the system.
const chatbotDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 200,
  message: { ok: false, reason: "rate_limited" },
  keyGenerator: (req) => (req.user && req.user.id ? `user:${req.user.id}` : req.ip),
});

router.post("/ask", auth(), chatbotLimiter, chatbotDailyLimiter, askChatbot);
router.get("/status", auth(["admin", "second_master"]), chatbotLimiter, chatbotStatus);

module.exports = router;
