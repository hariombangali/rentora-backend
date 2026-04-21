const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const ctrl = require("../controllers/maintenanceController");

router.post("/",            protect, ctrl.create);
router.get("/my",           protect, ctrl.listMine);
router.get("/owner",        protect, ctrl.listForOwner);
router.patch("/:id/status", protect, ctrl.updateStatus);

module.exports = router;
