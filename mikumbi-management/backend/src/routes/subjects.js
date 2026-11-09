const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/auth");
const { getSubjects, addSubject, updateSubject, deleteSubject } = require("../controllers/subjectsController");

router.use(auth());
router.get("/",          getSubjects);
router.post("/",         auth(["admin","second_master","academic"]), addSubject);
router.patch("/:id",     auth(["admin","second_master","academic"]), updateSubject);
router.delete("/:id",    auth(["admin","second_master","academic"]), deleteSubject);

module.exports = router;
