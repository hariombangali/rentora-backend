const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const ctrl = require("../controllers/rentPaymentController");

router.post("/",    protect, ctrl.create);
router.get("/my",   protect, ctrl.listMine);
router.get("/:id",  protect, ctrl.get);

module.exports = router;
