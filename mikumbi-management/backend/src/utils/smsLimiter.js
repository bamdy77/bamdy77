// utils/smsLimiter.js - a ceiling on SMS sending per staff account, so a
// stolen session, a script or a stuck button cannot use up the school's SMS
// balance. One "send" may contain many recipients; the limit counts sends.
const rateLimit = require("express-rate-limit");

module.exports = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many SMS sends in one hour. Please wait and try again." },
  keyGenerator: (req) => (req.user && req.user.id ? `sms:${req.user.id}` : `sms-ip:${req.ip}`),
});
