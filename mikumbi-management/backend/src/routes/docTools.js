const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { uploadDocToolsFiles } = require("../middleware/upload");
const { convert } = require("../controllers/docToolsController");

// Doc Tools — open to every authenticated staff role, no restriction.
router.use(auth([]));

router.post("/convert", uploadDocToolsFiles.array("files", 20), convert);

module.exports = router;
