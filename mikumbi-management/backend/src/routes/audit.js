const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { listAuditLog, listAuditActions } = require("../controllers/auditController");

// Head Master (admin) and Second Master only.
router.get("/", auth(["admin", "second_master", "developer"]), listAuditLog);
router.get("/actions", auth(["admin", "second_master", "developer"]), listAuditActions);

module.exports = router;
