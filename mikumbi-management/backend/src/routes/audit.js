const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { listAuditLog, listAuditActions } = require("../controllers/auditController");

// Head Master (admin), Second Master, and Academic Master.
router.get("/", auth(["admin", "second_master", "academic"]), listAuditLog);
router.get("/actions", auth(["admin", "second_master", "academic"]), listAuditActions);

module.exports = router;
