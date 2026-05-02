const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Property = require("../models/Property");
const User = require("../models/User");
const { sendBookingStatusEmail, sendNewBookingEmail } = require("../utils/sendEmail");
const { notify } = require("../utils/notify");
const { getIO } = require("../socket");

function emitBookingUpdate(booking) {
  try {
    const io = getIO();
    if (!io || !booking) return;
    const tenantId = String(booking.user?._id || booking.user);
    const ownerId  = String(booking.owner?._id || booking.owner);
    if (tenantId) io.to(`user_${tenantId}`).emit("booking:updated", booking);
    if (ownerId && ownerId !== tenantId) io.to(`user_${ownerId}`).emit("booking:updated", booking);
  } catch (e) {
    console.error("emitBookingUpdate failed:", e.message);
  }
}

// Compute when a visit slot has ended (slot start + 30 min). Returns null if unparseable.
function visitEndedAt(b) {
  if (!b?.visitDate || !b?.visitSlot) return null;
  const m = String(b.visitSlot).match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = (m[3] || "").toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  const d = new Date(b.visitDate);
  d.setHours(h, min + 30, 0, 0);
  return d;
}

const DEFAULT_SLOTS = ["10:00 AM", "12:00 PM", "3:00 PM", "6:00 PM"];
const MAX_PER_SLOT = 1;

// Fire-and-forget email — never blocks the response
const fireEmail = (fn, ...args) => fn(...args).catch((e) => console.error("Email send failed:", e.message));

const normalizeDay = (d) => {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
};

const ensureParties = async (propertyId, requesterId) => {
  const property = await Property.findById(propertyId).select("user price title");
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
      // Notify owner of new lead
      const ownerDoc = await User.findById(property.user).select("email name").lean();
      if (ownerDoc?.email) {
        fireEmail(sendNewBookingEmail, ownerDoc.email, { bookingType: "enquiry", propertyTitle: property.title, seekerName: req.user.name });
      }
      notify({
        user: property.user,
        kind: "booking_new",
        title: "New enquiry",
        body: `${req.user.name} sent an enquiry about ${property.title}`,
        link: "/owner/bookings",
        refId: booking._id,
        refType: "Booking",
        meta: { propertyTitle: property.title, bookingType: "lead" },
      });
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
      // Notify owner of new visit request
      const ownerDoc = await User.findById(property.user).select("email name").lean();
      if (ownerDoc?.email) {
        fireEmail(sendNewBookingEmail, ownerDoc.email, { bookingType: "visit", propertyTitle: property.title, seekerName: req.user.name });
      }
      notify({
        user: property.user,
        kind: "booking_new",
        title: "New visit request",
        body: `${req.user.name} wants to visit ${property.title} on ${day.toDateString()} at ${vSlot}`,
        link: "/owner/bookings",
        refId: booking._id,
        refType: "Booking",
        meta: { propertyTitle: property.title, bookingType: "visit", visitDate: day, visitSlot: vSlot },
      });
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
    // Email the seeker
    const [seekerDoc, propDoc] = await Promise.all([
      User.findById(b.user).select("email name").lean(),
      Property.findById(b.property).select("title").lean(),
    ]);
    if (seekerDoc?.email) {
      fireEmail(sendBookingStatusEmail, seekerDoc.email, {
        bookingType: b.type, status: "approved", propertyTitle: propDoc?.title || "your property", seekerName: seekerDoc.name,
      });
    }
    notify({
      user: b.user,
      kind: "booking_status",
      title: `${b.type === "visit" ? "Visit" : b.type === "rental" ? "Rental" : "Request"} approved`,
      body: `Your ${b.type} request for ${propDoc?.title || "the home"} is approved.`,
      link: "/my-bookings",
      refId: b._id,
      refType: "Booking",
      meta: { status: "approved", bookingType: b.type, propertyTitle: propDoc?.title },
    });
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
    const reason = req.body?.reason || "";
    if (reason) b.message = [b.message, `Owner note: ${reason}`].filter(Boolean).join("\n\n");
    b.isReadByUser = false;
    await b.save();
    // Email the seeker
    const [seekerDoc, propDoc] = await Promise.all([
      User.findById(b.user).select("email name").lean(),
      Property.findById(b.property).select("title").lean(),
    ]);
    if (seekerDoc?.email) {
      fireEmail(sendBookingStatusEmail, seekerDoc.email, {
        bookingType: b.type, status: "rejected", propertyTitle: propDoc?.title || "your property", reason, seekerName: seekerDoc.name,
      });
    }
    notify({
      user: b.user,
      kind: "booking_status",
      title: `${b.type === "visit" ? "Visit" : b.type === "rental" ? "Rental" : "Request"} declined`,
      body: `Your ${b.type} request for ${propDoc?.title || "the home"} wasn't approved${reason ? `: ${reason}` : "."}`,
      link: "/my-bookings",
      refId: b._id,
      refType: "Booking",
      meta: { status: "rejected", bookingType: b.type, propertyTitle: propDoc?.title, reason },
    });
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
    // Email the seeker
    const [seekerDoc, propDoc] = await Promise.all([
      User.findById(b.user).select("email name").lean(),
      Property.findById(b.property).select("title").lean(),
    ]);
    if (seekerDoc?.email) {
      fireEmail(sendBookingStatusEmail, seekerDoc.email, {
        bookingType: "visit", status: "rescheduled", propertyTitle: propDoc?.title || "your property",
        reason: `New time: ${slot} on ${day.toDateString()}`, seekerName: seekerDoc.name,
      });
    }
    notify({
      user: b.user,
      kind: "booking_rescheduled",
      title: "Visit rescheduled",
      body: `Owner proposed ${slot} on ${day.toDateString()} for ${propDoc?.title || "the home"}.`,
      link: "/my-bookings",
      refId: b._id,
      refType: "Booking",
      meta: { newDate: day, newSlot: slot, reason, propertyTitle: propDoc?.title },
    });
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
    const cancelledByOwner = b.owner.toString() === uid;
    b.status = "cancelled";
    await b.save();

    // Notify the other party
    const propDoc = await Property.findById(b.property).select("title").lean();
    notify({
      user: cancelledByOwner ? b.user : b.owner,
      kind: "booking_status",
      title: `${b.type === "visit" ? "Visit" : b.type === "rental" ? "Rental" : "Booking"} cancelled`,
      body: `${cancelledByOwner ? "The owner" : (req.user.name || "The applicant")} cancelled the ${b.type} for ${propDoc?.title || "the home"}.`,
      link: cancelledByOwner ? "/my-bookings" : "/owner/bookings",
      refId: b._id,
      refType: "Booking",
      meta: { status: "cancelled", bookingType: b.type, propertyTitle: propDoc?.title },
    });
    return res.json(b);
  } catch (err) {
    console.error("cancelBooking err", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// PATCH /bookings/:id/accept-reschedule  (tenant)
exports.acceptReschedule = async (req, res) => {
  try {
    const b = await Booking.findById(req.params.id);
    if (!b) return res.status(404).json({ message: "Booking not found" });
    if (b.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the tenant can accept a reschedule" });
    }
    if (b.status !== "rescheduled" || !b.reschedule?.date) {
      return res.status(400).json({ message: "Nothing to accept" });
    }

    b.visitDate = normalizeDay(b.reschedule.date);
    b.visitSlot = b.reschedule.slot;
    b.status = "approved";
    b.reschedule = undefined;
    b.isReadByOwner = false;
    await b.save();

    const propDoc = await Property.findById(b.property).select("title").lean();
    notify({
      user: b.owner,
      kind: "booking_status",
      title: "Tenant accepted the new time",
      body: `The visit at ${propDoc?.title || "the home"} is on for ${b.visitSlot} on ${b.visitDate.toDateString()}.`,
      link: "/owner/bookings",
      refId: b._id,
      refType: "Booking",
    });
    return res.json(b);
  } catch (err) {
    console.error("acceptReschedule err", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// PATCH /bookings/:id/decline-reschedule  (tenant)
exports.declineReschedule = async (req, res) => {
  try {
    const b = await Booking.findById(req.params.id);
    if (!b) return res.status(404).json({ message: "Booking not found" });
    if (b.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the tenant can decline a reschedule" });
    }
    if (b.status !== "rescheduled") {
      return res.status(400).json({ message: "Nothing to decline" });
    }

    // Revert to pending so owner can re-propose, or keep original visitDate as pending
    b.status = "pending";
    b.reschedule = undefined;
    b.isReadByOwner = false;
    await b.save();

    const propDoc = await Property.findById(b.property).select("title").lean();
    notify({
      user: b.owner,
      kind: "booking_status",
      title: "Tenant declined the reschedule",
      body: `The tenant prefers the original time for ${propDoc?.title || "the home"}. Reply to confirm or propose again.`,
      link: "/owner/bookings",
      refId: b._id,
      refType: "Booking",
    });
    return res.json(b);
  } catch (err) {
    console.error("declineReschedule err", err);
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

// POST /api/bookings/:id/visit-outcome  — tenant
// body: { outcome: "applied"|"considering"|"passed"|"no_show", note? }
exports.markVisitOutcome = async (req, res) => {
  try {
    const { outcome, note } = req.body || {};
    const allowed = ["applied", "considering", "passed", "no_show"];
    if (!allowed.includes(outcome)) {
      return res.status(400).json({ message: "Invalid outcome" });
    }

    const booking = await Booking.findById(req.params.id).populate("property", "title");
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.type !== "visit") return res.status(400).json({ message: "Not a visit" });
    if (String(booking.user) !== String(req.user._id)) {
      return res.status(403).json({ message: "Only the tenant can mark the outcome" });
    }
    if (["cancelled", "rejected"].includes(booking.status)) {
      return res.status(400).json({ message: "Visit was cancelled" });
    }

    booking.outcome = outcome;
    booking.outcomeNote = (note || "").trim();
    booking.status = "completed";
    booking.completedAt = booking.completedAt || new Date();
    await booking.save();

    const titleMap = {
      applied:      "Tenant wants to apply",
      considering:  "Tenant is considering",
      passed:       "Tenant passed on the home",
      no_show:      "Tenant didn't visit",
    };

    notify({
      user: booking.owner,
      kind: "booking_status",
      title: titleMap[outcome],
      body: `${req.user.name || "Your visitor"} for ${booking.property?.title || "your property"}${note ? ` — ${note}` : ""}.`,
      link: "/owner/bookings",
      refId: booking._id,
      refType: "Booking",
      meta: { outcome, note },
    });

    const populated = await Booking.findById(booking._id)
      .populate("property", "title location images price deposit user")
      .populate("owner", "name email")
      .populate("user", "name email")
      .lean();
    emitBookingUpdate(populated);
    res.json(populated);
  } catch (err) {
    console.error("markVisitOutcome:", err);
    res.status(500).json({ message: "Failed to mark outcome" });
  }
};

// POST /api/bookings/:id/visit-attendance  — owner
// body: { attended: "attended"|"no_show" }
exports.markVisitAttendance = async (req, res) => {
  try {
    const { attended } = req.body || {};
    if (!["attended", "no_show"].includes(attended)) {
      return res.status(400).json({ message: "attended must be 'attended' or 'no_show'" });
    }

    const booking = await Booking.findById(req.params.id).populate("property", "title");
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.type !== "visit") return res.status(400).json({ message: "Not a visit" });
    if (String(booking.owner) !== String(req.user._id)) {
      return res.status(403).json({ message: "Only the owner can mark attendance" });
    }
    if (["cancelled", "rejected"].includes(booking.status)) {
      return res.status(400).json({ message: "Visit was cancelled" });
    }

    booking.attendedByOwner = attended;
    // If the tenant hasn't recorded their outcome yet, owner's mark closes the visit.
    if (!booking.outcome) {
      booking.status = "completed";
      booking.completedAt = booking.completedAt || new Date();
      // For a no-show, mirror it as the outcome so the visit is unambiguous.
      if (attended === "no_show") booking.outcome = "no_show";
    }
    await booking.save();

    notify({
      user: booking.user,
      kind: "booking_status",
      title: attended === "attended" ? "Owner confirmed your visit" : "Owner marked you as no-show",
      body: attended === "attended"
        ? `Your visit to ${booking.property?.title || "the property"} is confirmed. Liked it?`
        : `If this is wrong, drop the owner a note from your inbox.`,
      link: "/my-bookings",
      refId: booking._id,
      refType: "Booking",
      meta: { attended },
    });

    const populated = await Booking.findById(booking._id)
      .populate("property", "title location images price deposit user")
      .populate("owner", "name email")
      .populate("user", "name email")
      .lean();
    emitBookingUpdate(populated);
    res.json(populated);
  } catch (err) {
    console.error("markVisitAttendance:", err);
    res.status(500).json({ message: "Failed to mark attendance" });
  }
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

