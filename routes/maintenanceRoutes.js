const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const upload = require("../middlewares/upload");
const ctrl = require("../controllers/maintenanceController");

router.post("/",            protect, upload.array("images", 5), ctrl.create);
router.get("/my",           protect, ctrl.listMine);
router.get("/owner",        protect, ctrl.listForOwner);
router.patch("/:id/status", protect, ctrl.updateStatus);
router.patch("/:id/schedule", protect, ctrl.setSchedule);
router.post("/:id/comments", protect, ctrl.addComment);
router.patch("/:id/confirm", protect, ctrl.tenantConfirm);
router.patch("/:id/reopen",  protect, ctrl.tenantReopen);

module.exports = router;
