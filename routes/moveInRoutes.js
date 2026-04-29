const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const ctrl = require("../controllers/moveInController");

router.post("/:id/movein/payment", protect, ctrl.recordPayment);
router.post("/:id/movein/sign",    protect, ctrl.signAgreement);
router.post("/:id/movein/confirm", protect, ctrl.confirmMoveIn);

module.exports = router;
