const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const ctrl = require("../controllers/notificationController");

router.get("/",              protect, ctrl.list);
router.get("/unread-count",  protect, ctrl.unreadCount);
router.patch("/read-all",    protect, ctrl.markAllRead);
router.patch("/:id/read",    protect, ctrl.markRead);
router.delete("/:id",        protect, ctrl.remove);

module.exports = router;
