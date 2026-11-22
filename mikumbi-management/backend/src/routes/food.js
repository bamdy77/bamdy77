const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { getTypes, createType, updateType, reorderTypes, deleteType, getStudents, addEntry, deleteEntry, getStudentEntries, getHistory, getHistoryStudents, getFoodDaily, exportStudentsPdf, getFoodStatus, exportFoodStatusPdf } = require("../controllers/foodContributionsController");

// Food Contributions: Head Master, Second Master, and food_teacher only.
// Class teachers must NEVER see this module — recording is the Food
// Teacher's job (Boarding/Day/Daily Collections), and History is reserved
// for oversight (Head Master/Second Master) only, not even the Food Teacher.
router.use(auth(["admin", "second_master", "food_teacher"]));

router.get("/types",                      getTypes);
// Food Types manager - Head Master / Second Master only.
router.post("/types",                     auth(["admin", "second_master"]), createType);
router.put("/types/order",                auth(["admin", "second_master"]), reorderTypes);
router.patch("/types/:id(\\d+)",          auth(["admin", "second_master"]), updateType);
router.delete("/types/:id(\\d+)",         auth(["admin", "second_master"]), deleteType);
router.get("/students",                   getStudents);
// Completed / owing per food type (Food Teacher, Head Master, Second Master).
router.get("/status",                     getFoodStatus);
router.get("/status/pdf",                 exportFoodStatusPdf);
router.get("/students/pdf",               exportStudentsPdf);
router.post("/:studentId",                auth(["food_teacher"]), addEntry);
router.delete("/entry/:id",                auth(["admin", "second_master", "food_teacher"]), deleteEntry);
router.get("/student/:studentId/entries", getStudentEntries);
router.get("/daily",                      getFoodDaily);
router.get("/history",                    auth(["admin", "second_master"]), getHistory);
router.get("/history/students",           auth(["admin", "second_master"]), getHistoryStudents);

module.exports = router;
