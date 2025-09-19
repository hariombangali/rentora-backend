// controllers/bookingController.js
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Property = require("../models/Property");

const DEFAULT_SLOTS = ["10:00 AM", "12:00 PM", "3:00 PM", "6:00 PM"];
const MAX_PER_SLOT = 1;

const normalizeDay = (d) => {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
};

const ensureParties = async (propertyId, requesterId) => {
  const property = await Property.findById(propertyId).select("user price");
  if (!property) return { error: "Property not found" };
  if (property.user.toString() === requesterId.toString()) {
    return { error: "Action not allowed on own listing" };
  }
  return { property };
};

exports.createBooking = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      type,
      propertyId,
      message,        // may be undefined (UI sends note)
      visitDate,      // may be undefined (UI sends date)
      visitSlot,      // may be undefined (UI sends slot)
      checkIn,
      checkOut,
    } = req.body;

    if (!type || !propertyId) {
      return res.status(400).json({ message: "type and propertyId are required" });
    }
    if (!["lead", "visit", "rental", "reveal"].includes(type)) {
      return res.status(400).json({ message: "Invalid type" });
    }

    const { property, error } = await ensureParties(propertyId, userId);
    if (error) return res.status(400).json({ message: error });

    // NEW: normalize payload from UI
    const msg = (message ?? req.body.note ?? "").trim();
    const vDate = visitDate ?? req.body.date ?? null;
    const vSlot = visitSlot ?? req.body.slot ?? null;

    let doc = {
      property: propertyId,
      user: userId,
      owner: property.user,
      type,
      message: msg || "",
      isReadByOwner: false,
      isReadByUser: true,
    };

    if (type === "lead") {
      if (!msg) {
        return res.status(400).json({ message: "Message is required for lead" });
      }
      const existing = await Booking.findOne({
        type: "lead",
        property: propertyId,
        user: userId,
        owner: property.user,
        status: { $in: ["pending", "approved", "rescheduled"] },
      });
      if (existing) {
        existing.message = [existing.message, msg].filter(Boolean).join("\n\n");
        await existing.save();
        return res.status(200).json({ booking: existing, message: "Lead updated" });
      }
      const booking = await Booking.create(doc);
      return res.status(201).json({ booking, message: "Lead created" });
    }

    if (type === "visit") {
      if (!vDate || !vSlot) {
        return res.status(400).json({ message: "visitDate and visitSlot are required for visit" });
      }
      const day = normalizeDay(vDate);
      const next = new Date(day); next.setDate(next.getDate() + 1);
      if (!DEFAULT_SLOTS.includes(vSlot)) {
        return res.status(400).json({ message: "Invalid slot" });
      }
      const count = await Booking.countDocuments({
        type: "visit",
        property: propertyId,
        visitDate: { $gte: day, $lt: next },
        visitSlot: vSlot,
        status: { $in: ["pending", "approved"] },
      });
      if (count >= MAX_PER_SLOT) {
        return res.status(409).json({ message: "Selected slot is full" });
      }
      doc.visitDate = day;
      doc.visitSlot = vSlot;
      const booking = await Booking.create(doc);
      return res.status(201).json({ booking, message: "Visit requested" });
    }

    if (type === "rental") {
      if (!checkIn) {
        return res.status(400).json({ message: "checkIn is required for rental" });
      }
      const ci = new Date(checkIn);
      const co = req.body.checkOut ? new Date(checkOut) : null;
      if (co && co < ci) {
        return res.status(400).json({ message: "checkOut must be after checkIn" });
      }
      const overlap = await Booking.findOne({
        type: "rental",
        property: propertyId,
        status: "approved",
        $or: [
          { checkIn: { $lte: co || ci }, checkOut: { $gte: ci } },
          { checkIn: { $lte: ci }, checkOut: { $gte: ci } },
        ],
      });
      if (overlap) {
        return res.status(409).json({ message: "Property not available for selected dates" });
      }
      doc.checkIn = ci;
      doc.checkOut = co;
      doc.priceQuoted = property.price || null;
      const booking = await Booking.create(doc);
      return res.status(201).json({ booking, message: "Rental request created" });
    }

    return res.status(400).json({ message: "Unsupported type" });
  } catch (err) {
    console.error("createBooking err", err);
    return res.status(500).json({ message: "Server error" });
  }
};


// GET /bookings/my
exports.getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user._id })
      .populate("property", "title address images price")
      .populate("owner", "name email")
      .sort({ createdAt: -1 });
    return res.json(bookings);
  } catch (err) {
    console.error("getMyBookings err", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET /bookings/owner?status=
exports.getOwnerBookings = async (req, res) => {
  try {
    const filter = { owner: req.user._id };
    if (req.query.status) filter.status = req.query.status;
    const bookings = await Booking.find(filter)
      .populate("property", "title address images price")
      .populate("user", "name email ownerKYC phone")
      .sort({ createdAt: -1 });
    return res.json(bookings);
  } catch (err) {
    console.error("getOwnerBookings err", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET /bookings/:id
exports.getBookingById = async (req, res) => {
  try {
    const b = await Booking.findById(req.params.id)
      .populate("property", "title address images price")
      .populate("user", "name email ownerKYC phone")
      .populate("owner", "name email");
    if (!b) return res.status(404).json({ message: "Booking not found" });
    const uid = req.user._id.toString();
    if (b.user.toString() !== uid && b.owner.toString() !== uid && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not allowed" });
    }
    return res.json(b);
  } catch (err) {
    console.error("getBookingById err", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// PATCH /bookings/:id/approve  (owner)
exports.approveBooking = async (req, res) => {
  try {
    const b = await Booking.findById(req.params.id);
    if (!b) return res.status(404).json({ message: "Booking not found" });
    if (b.owner.toString() !== req.user._id.toString()) return res.status(403).json({ message: "Not allowed" });

    if (b.type === "lead") {
      // For lead, treat approve as acknowledged contact
      b.status = "approved";
    } else if (b.type === "visit" || b.type === "rental") {
      b.status = "approved";
    }
    b.isReadByUser = false;
    await b.save();
    return res.json(b);
  } catch (err) {
    console.error("approveBooking err", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// PATCH /bookings/:id/reject  (owner)  body: { reason? }
exports.rejectBooking = async (req, res) => {
  try {
    const b = await Booking.findById(req.params.id);
    if (!b) return res.status(404).json({ message: "Booking not found" });
    if (b.owner.toString() !== req.user._id.toString()) return res.status(403).json({ message: "Not allowed" });

    b.status = "rejected";
    if (req.body?.reason) {
      b.message = [b.message, `Owner note: ${req.body.reason}`].filter(Boolean).join("\n\n");
    }
    b.isReadByUser = false;
    await b.save();
    return res.json(b);
  } catch (err) {
    console.error("rejectBooking err", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// PATCH /bookings/:id/reschedule  (owner)  body: { date, slot, reason }
exports.rescheduleBooking = async (req, res) => {
  try {
    const { date, slot, reason } = req.body;
    const b = await Booking.findById(req.params.id);
    if (!b) return res.status(404).json({ message: "Booking not found" });
    if (b.owner.toString() !== req.user._id.toString()) return res.status(403).json({ message: "Not allowed" });
    if (b.type !== "visit") return res.status(400).json({ message: "Reschedule only valid for visit" });
    if (!date || !slot) return res.status(400).json({ message: "date and slot required" });
    if (!DEFAULT_SLOTS.includes(slot)) return res.status(400).json({ message: "Invalid slot" });

    const day = normalizeDay(date);
    const end = new Date(day);
    end.setDate(end.getDate() + 1);

    const count = await Booking.countDocuments({
      _id: { $ne: b._id },
      type: "visit",
      property: b.property,
      visitDate: { $gte: day, $lt: end },
      visitSlot: slot,
      status: { $in: ["pending", "approved"] },
    });
    if (count >= MAX_PER_SLOT) return res.status(409).json({ message: "Selected slot is full" });

    b.status = "rescheduled";
    b.reschedule = { date: day, slot, reason: reason || "" };
    b.isReadByUser = false;
    await b.save();
    return res.json(b);
  } catch (err) {
    console.error("rescheduleBooking err", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// PATCH /bookings/:id/cancel  (user or owner)
exports.cancelBooking = async (req, res) => {
  try {
    const b = await Booking.findById(req.params.id);
    if (!b) return res.status(404).json({ message: "Booking not found" });
    const uid = req.user._id.toString();
    if (b.user.toString() !== uid && b.owner.toString() !== uid && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not allowed" });
    }
    b.status = "cancelled";
    await b.save();
    return res.json(b);
  } catch (err) {
    console.error("cancelBooking err", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET /bookings/availability?propertyId&date=YYYY-MM-DD   (visit slots)
exports.getVisitAvailability = async (req, res) => {
  try {
    const { propertyId, date } = req.query;
    if (!propertyId || !date) return res.status(400).json({ message: "propertyId and date are required" });

    const day = normalizeDay(date);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);

    const agg = await Booking.aggregate([
      {
        $match: {
          property: new mongoose.Types.ObjectId(propertyId),
          type: "visit",
          visitDate: { $gte: day, $lt: next },
          status: { $in: ["pending", "approved"] },
        },
      },
      { $group: { _id: "$visitSlot", count: { $sum: 1 } } },
    ]);

    const taken = Object.fromEntries(agg.map((x) => [x._id, x.count]));
    const slots = DEFAULT_SLOTS.map((time, i) => ({
      id: String(i + 1),
      time,
      full: (taken[time] || 0) >= MAX_PER_SLOT,
    }));
    return res.json({ slots });
  } catch (err) {
    console.error("getVisitAvailability err", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET /bookings/check-dates/:propertyId?start=...&end=...   (rental overlap)
exports.checkDates = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { start, end } = req.query;
    if (!propertyId || !start) return res.status(400).json({ message: "propertyId and start required" });

    const s = new Date(start);
    const e = end ? new Date(end) : s;
    const overlapping = await Booking.findOne({
      type: "rental",
      property: propertyId,
      status: "approved",
      $or: [
        { checkIn: { $lte: e }, checkOut: { $gte: s } },
        { checkIn: { $lte: s }, checkOut: { $gte: s } },
      ],
    });
    return res.json({ available: !overlapping });
  } catch (err) {
    console.error("checkDates err", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// Helpers for contact quota
const FREE_CONTACTS_PER_MONTH = 3;
const startOfMonth = (d) => { const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; };
const maskPhone = (phone = "") => {
  const s = String(phone);
  if (s.length <= 4) return "****";
  const last4 = s.slice(-4);
  return s.slice(0, -4).replace(/\d/g, "•") + last4;
};

// Aliases so frontend can call /leads and /visits directly
exports.createLeadAlias = async (req, res, next) => {
  req.body.type = "lead";
  return exports.createBooking(req, res, next);
};
exports.createVisitAlias = async (req, res, next) => {
  req.body.type = "visit";
  return exports.createBooking(req, res, next);
};

// Contacts: GET /contacts/quota?ownerId=...
exports.getContactQuota = async (req, res) => {
  try {
    const { ownerId } = req.query;
    if (!ownerId) return res.status(400).json({ message: "ownerId is required" });
    const now = new Date();
    const from = startOfMonth(now);

    const used = await Booking.countDocuments({
      user: req.user._id,
      type: "reveal",
      createdAt: { $gte: from, $lte: now },
    });

    // sample listing to fetch phone
    const property = await Property.findOne({ user: ownerId })
      .select("user")
      .populate({ path: "user", select: "ownerKYC.ownerPhone" });

    const phone = property?.user?.ownerKYC?.ownerPhone || "";
    return res.json({
      remainingFreeContacts: Math.max(FREE_CONTACTS_PER_MONTH - used, 0),
      canRevealPhone: used < FREE_CONTACTS_PER_MONTH,
      phoneMasked: maskPhone(phone),
    });
  } catch (e) {
    console.error("getContactQuota err", e);
    return res.status(500).json({ message: "Server error" });
  }
};

// Contacts: POST /contacts/reveal-phone  body: { ownerId, propertyId }
exports.revealPhone = async (req, res) => {
  try {
    const { ownerId, propertyId } = req.body;
    if (!ownerId || !propertyId) return res.status(400).json({ message: "ownerId and propertyId are required" });

    const now = new Date();
    const from = startOfMonth(now);
    const used = await Booking.countDocuments({
      user: req.user._id,
      type: "reveal",
      createdAt: { $gte: from, $lte: now },
    });
    if (used >= FREE_CONTACTS_PER_MONTH) {
      return res.status(200).json({ message: "Free contact limit reached. Upgrade to reveal more contacts." });
    }

    const property = await Property.findById(propertyId)
      .select("user")
      .populate({ path: "user", select: "ownerKYC.ownerPhone" });
    if (!property) return res.status(404).json({ message: "Property not found" });
    if (property.user._id.toString() !== ownerId.toString()) {
      return res.status(400).json({ message: "Owner does not match property" });
    }

    const phone = property.user.ownerKYC?.ownerPhone;
    if (!phone) return res.status(404).json({ message: "Owner phone not available" });

    // Log as a Booking doc to honor single-model requirement
    await Booking.create({
      property: propertyId,
      user: req.user._id,
      owner: ownerId,
      type: "reveal",
      status: "completed",
      message: "Phone revealed",
      isReadByOwner: true,
      isReadByUser: true,
    });

    return res.json({ phoneFull: phone });
  } catch (e) {
    console.error("revealPhone err", e);
    return res.status(500).json({ message: "Server error" });
  }
};

// Optional: alias for availability under /visits/availability
exports.getVisitAvailabilityAlias = async (req, res, next) => {
  return exports.getVisitAvailability(req, res, next);
};

