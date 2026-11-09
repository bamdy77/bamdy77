const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { generateIdCardsPdf } = require("../controllers/idCardController");

// Same access as Student Management itself (Admin/Second Master) — this
// lives on/under that page, not as its own separately-permissioned module.
router.get("/pdf", auth(["admin", "second_master"]), generateIdCardsPdf);

module.exports = router;
