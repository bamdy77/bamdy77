const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/auth");
const { getClasses, addClass, deleteClass } = require("../controllers/classesController");

router.get("/public", getClasses); // for the landing page Publications "Per Class" selector

router.use(auth());
router.get("/",          getClasses);
router.post("/",         auth(["admin","second_master","academic"]), addClass);
router.delete("/:id",    auth(["admin","second_master","academic"]), deleteClass);

module.exports = router;
