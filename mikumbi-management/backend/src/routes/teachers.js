const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/auth");
const {
  getTeachers, getTeacher, createTeacher, updateTeacher, deleteTeacher,
} = require("../controllers/teacherController");

router.use(auth());

router.get("/",        getTeachers);
router.get("/:id",     getTeacher);
router.post("/",       auth(["admin","second_master","academic"]), createTeacher);
router.put("/:id",     auth(["admin","second_master","academic"]), updateTeacher);
router.delete("/:id",  auth(["admin","second_master"]),            deleteTeacher);

module.exports = router;
