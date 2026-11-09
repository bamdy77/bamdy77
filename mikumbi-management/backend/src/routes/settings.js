const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { uploadBrandingImage } = require("../middleware/upload");
const c = require("../controllers/settingsController");

// Anyone signed in can READ either signature/stamp set (just image URLs,
// nothing sensitive) - needed by any role that can generate a Parent
// Report, and to preview in Settings.
router.get("/branding",                  auth([]), c.getBranding);
router.get("/class-teacher-signatures",  auth([]), c.getClassTeacherSignatures);

// Head Master's OWN signature + the school stamp - only Admin, Second
// Master, or Academic may change these (any of the three can act on the
// Head Master's behalf).
const BRANDING_ADMINS = ["admin", "second_master", "academic"];
router.post("/branding/signature",   auth(BRANDING_ADMINS), uploadBrandingImage.single("image"), c.uploadSignature);
router.post("/branding/stamp",       auth(BRANDING_ADMINS), uploadBrandingImage.single("image"), c.uploadStamp);
router.delete("/branding/signature", auth(BRANDING_ADMINS), c.deleteSignature);
router.delete("/branding/stamp",     auth(BRANDING_ADMINS), c.deleteStamp);

// Class Teacher signature - a Class Teacher may upload/remove only their
// OWN Form's row; Admin/Second Master/Academic may do so for ANY Form on
// that teacher's behalf. Which case applies, and which Form is actually
// touched, is resolved server-side in the controller — never trusted from
// the request alone for a Class Teacher.
const CLASS_SIG_ROLES = ["admin", "second_master", "academic", "class_teacher"];
router.post("/class-teacher-signature",   auth(CLASS_SIG_ROLES), uploadBrandingImage.single("image"), c.uploadClassTeacherSignature);
router.delete("/class-teacher-signature", auth(CLASS_SIG_ROLES), c.deleteClassTeacherSignature);

// SMS Gateway provider settings — same admin tier as branding above
// (Admin/Second Master/Academic; whoever sends results SMS also needs to
// be able to see/pick the provider).
router.get("/sms",  auth(BRANDING_ADMINS), c.getSmsSettings);
router.put("/sms",  auth(BRANDING_ADMINS), c.updateSmsSettings);

module.exports = router;
