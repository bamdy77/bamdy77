const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const auth = require("../middleware/auth");
const { askChatbot } = require("../controllers/chatbotController");

// Every logged-in role may ask - the controller itself is what scopes the
// answer to what that specific role can see. Rate-limited per-account
// (not just per-IP) since this calls a metered external API.
const chatbotLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: { ok: false, reason: "rate_limited" },
  keyGenerator: (req) => (req.user && req.user.id ? `user:${req.user.id}` : req.ip),
});

router.post("/ask", auth(), chatbotLimiter, askChatbot);

module.exports = router;
