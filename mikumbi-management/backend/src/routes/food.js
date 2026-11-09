const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { getTypes, getStudents, addEntry, deleteEntry, getStudentEntries, getHistory, getHistoryStudents, getFoodDaily, exportStudentsPdf } = require("../controllers/foodContributionsController");

// Food Contributions: Head Master, Second Master, and food_teacher only.
// Class teachers must NEVER see this module — recording is the Food
// Teacher's job (Boarding/Day/Daily Collections), and History is reserved
// for oversight (Head Master/Second Master) only, not even the Food Teacher.
router.use(auth(["admin", "second_master", "food_teacher"]));

router.get("/types",                      getTypes);
router.get("/students",                   getStudents);
router.get("/students/pdf",               exportStudentsPdf);
router.post("/:studentId",                auth(["food_teacher"]), addEntry);
router.delete("/entry/:id",                auth(["admin", "second_master", "food_teacher"]), deleteEntry);
router.get("/student/:studentId/entries", getStudentEntries);
router.get("/daily",                      getFoodDaily);
router.get("/history",                    auth(["admin", "second_master"]), getHistory);
router.get("/history/students",           auth(["admin", "second_master"]), getHistoryStudents);

module.exports = router;
