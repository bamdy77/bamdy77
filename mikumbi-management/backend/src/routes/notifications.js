const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const c = require("../controllers/notificationsController");

// Every role — this is each account's own Notification Center. auth([])
// (no roles list) just requires a valid, active login; the controller
// itself always scopes rows to req.user.id.
const ALL_ROLES = ["admin", "second_master", "academic", "teacher", "patron", "matron", "class_teacher", "food_teacher"];

router.get("/",              auth(ALL_ROLES), c.listNotifications);
router.get("/unread-count",  auth(ALL_ROLES), c.unreadCount);
router.patch("/:id/read",    auth(ALL_ROLES), c.markRead);
router.patch("/read-all",    auth(ALL_ROLES), c.markAllRead);

module.exports = router;
