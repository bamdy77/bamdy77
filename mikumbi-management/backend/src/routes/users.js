const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { listUsers, createUser, updateUser, adminSetPassword, deactivateUser, deleteUser } = require("../controllers/usersController");

router.use(auth(["admin", "second_master"])); // Head Master + Second Master manage accounts

router.get("/",              listUsers);
router.post("/",             createUser);
router.patch("/:id",         updateUser);
router.post("/:id/reset",    adminSetPassword);
router.delete("/:id",        deactivateUser);
router.delete("/:id/permanent", deleteUser);

module.exports = router;
