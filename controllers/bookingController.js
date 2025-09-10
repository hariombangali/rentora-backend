// controllers/bookingController.js
const Booking = require("../models/Booking");
const Property = require("../models/Property");
const User = require("../models/User");

// Create booking (user requests)
exports.createBooking = async (req, res) => {
  try {
    const userId = req.user._id;
    const { propertyId, checkIn, checkOut, message } = req.body;

    if (!propertyId || !checkIn) {
      return res.status(400).json({ message: "propertyId and checkIn required" });
    }

    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ message: "Property not found" });

    // prevent owner requesting own property
    if (property.user.toString() === userId.toString()) {
      return res.status(400).json({ message: "Owners cannot request booking on their own property" });
    }

    // Availability check: any approved booking overlapping?
    if (checkOut) {
      const overlapping = await Booking.findOne({
        property: propertyId,
        status: "approved",
        $or: [
          { checkIn: { $lte: new Date(checkOut) }, checkOut: { $gte: new Date(checkIn) } },
          { checkIn: { $lte: new Date(checkIn) }, checkOut: { $gte: new Date(checkIn) } }
        ]
      });
      if (overlapping) {
        return res.status(409).json({ message: "Property not available for selected dates" });
      }
    }

    const booking = await Booking.create({
      property: propertyId,
      user: userId,
      owner: property.user,
      checkIn,
      checkOut,
      message,
      priceQuoted: property.price
    });

    // Optionally: send notification/email to owner here (left as TODO)
    // e.g. notifyOwner(property.user, booking)

    res.status(201).json(booking);
  } catch (err) {
    console.error("createBooking err", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get bookings of logged-in user (their requests)
exports.getMyBookings = async (req, res) => {
  try {
    const userId = req.user._id;
    const bookings = await Booking.find({ user: userId })
      .populate("property", "title address images price")
      .populate("owner", "name email")
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    console.error("getMyBookings err", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get bookings for owner (requests for owner's properties)
exports.getOwnerBookings = async (req, res) => {
  try {
    const ownerId = req.user._id;
    const status = req.query.status;
    const filter = { owner: ownerId };
    if (status) filter.status = status;

    const bookings = await Booking.find(filter)
      .populate("property", "title address images price")
      .populate("user", "name email ownerKYC phone")
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (err) {
    console.error("getOwnerBookings err", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get booking by id (owner or user)
exports.getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("property", "title address images price")
      .populate("user", "name email ownerKYC phone")
      .populate("owner", "name email");
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // authorization: user or owner or admin (assume protect middleware sets req.user.role)
    const uid = req.user._id.toString();
    if (booking.user.toString() !== uid && booking.owner.toString() !== uid && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not allowed" });
    }

    res.json(booking);
  } catch (err) {
    console.error("getBookingById err", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Approve (owner)
exports.approveBooking = async (req, res) => {
  try {
    const ownerId = req.user._id.toString();
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.owner.toString() !== ownerId) return res.status(403).json({ message: "Not allowed" });

    // optional: availability check again
    booking.status = "approved";
    booking.isReadByUser = false;
    await booking.save();

    // TODO: send notification/email + optionally request payment
    res.json(booking);
  } catch (err) {
    console.error("approveBooking err", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Reject (owner)
exports.rejectBooking = async (req, res) => {
  try {
    const ownerId = req.user._id.toString();
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.owner.toString() !== ownerId) return res.status(403).json({ message: "Not allowed" });

    const { reason } = req.body;
    booking.status = "rejected";
    booking.rejectionReason = reason || "";
    booking.isReadByUser = false;
    await booking.save();

    // TODO: notify user
    res.json(booking);
  } catch (err) {
    console.error("rejectBooking err", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Cancel (user or owner)
exports.cancelBooking = async (req, res) => {
  try {
    const uid = req.user._id.toString();
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (booking.user.toString() !== uid && booking.owner.toString() !== uid && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not allowed" });
    }

    booking.status = "cancelled";
    await booking.save();

    // TODO: refund logic if paid
    res.json(booking);
  } catch (err) {
    console.error("cancelBooking err", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Optional: availability check endpoint
exports.checkAvailability = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { start, end } = req.query;
    if (!propertyId || !start) return res.status(400).json({ message: "propertyId and start required" });

    const filter = {
      property: propertyId,
      status: "approved",
      $or: [
        { checkIn: { $lte: new Date(end || start) }, checkOut: { $gte: new Date(start) } },
        { checkIn: { $lte: new Date(start) }, checkOut: { $gte: new Date(start) } }
      ]
    };

    const overlapping = await Booking.findOne(filter);
    res.json({ available: !overlapping });
  } catch (err) {
    console.error("checkAvailability err", err);
    res.status(500).json({ message: "Server error" });
  }
};
