// routes/bookingRoutes.js
const express = require("express");
const router = express.Router();
const bookingCtrl = require("../controllers/bookingController");
const { protect } = require("../middlewares/authMiddleware"); // your existing auth

router.post("/", protect, bookingCtrl.createBooking);
router.get("/my", protect, bookingCtrl.getMyBookings);
router.get("/owner", protect, bookingCtrl.getOwnerBookings);
router.get("/availability/:propertyId", protect, bookingCtrl.checkAvailability); // ?start=&end=
router.get("/:id", protect, bookingCtrl.getBookingById);
router.put("/:id/approve", protect, bookingCtrl.approveBooking);
router.put("/:id/reject", protect, bookingCtrl.rejectBooking);
router.put("/:id/cancel", protect, bookingCtrl.cancelBooking);

module.exports = router;
