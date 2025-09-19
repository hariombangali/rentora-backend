// routes/index.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware"); // <-- adjust if your folder is 'middlewares'
const bookingCtrl = require("../controllers/bookingController");

// Unified booking routes
router.post("/bookings", protect, bookingCtrl.createBooking);
router.get("/bookings/my", protect, bookingCtrl.getMyBookings);
router.get("/bookings/owner", protect, bookingCtrl.getOwnerBookings);
router.get("/bookings/:id", protect, bookingCtrl.getBookingById);
router.patch("/bookings/:id/approve", protect, bookingCtrl.approveBooking);
router.patch("/bookings/:id/reject", protect, bookingCtrl.rejectBooking);
router.patch("/bookings/:id/reschedule", protect, bookingCtrl.rescheduleBooking);
router.patch("/bookings/:id/cancel", protect, bookingCtrl.cancelBooking);
router.get("/bookings/availability", bookingCtrl.getVisitAvailability);
router.get("/bookings/check-dates/:propertyId", bookingCtrl.checkDates);

// Aliases to match current frontend calls (PDP)
router.post("/leads", protect, bookingCtrl.createLeadAlias);
router.post("/visits", protect, bookingCtrl.createVisitAlias);
router.get("/visits/availability", bookingCtrl.getVisitAvailabilityAlias);
router.get("/contacts/quota", protect, bookingCtrl.getContactQuota);
router.post("/contacts/reveal-phone", protect, bookingCtrl.revealPhone);

module.exports = router;
