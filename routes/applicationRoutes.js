const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const ctrl = require("../controllers/applicationController");

router.post("/",          protect, ctrl.createApplication);
router.get("/my",         protect, ctrl.getMyApplications);
router.get("/owner",      protect, ctrl.getOwnerApplications);
router.get("/:id",        protect, ctrl.getApplicationById);
router.patch("/:id/status",   protect, ctrl.updateApplicationStatus);
router.patch("/:id/withdraw", protect, ctrl.withdrawApplication);

module.exports = router;
