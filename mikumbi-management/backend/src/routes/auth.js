// ── Auth Routes ───────────────────────────────────────────────────────────────
const express = require("express");
const router  = express.Router();
const { login, me, changePassword, forgotPassword, resetPassword, uploadAvatar, removeAvatar } = require("../controllers/authController");
const auth = require("../middleware/auth");
const { uploadStudentPhoto } = require("../middleware/upload"); // generic image multer (5MB, image/* only) — not student-specific despite the name

router.post("/login",           login);
router.get("/me",               auth(), me);
router.post("/change-password", auth(), changePassword);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password",  resetPassword);
router.post("/photo",           auth(), uploadStudentPhoto.single("photo"), uploadAvatar);
router.delete("/photo",         auth(), removeAvatar);

module.exports = router;
