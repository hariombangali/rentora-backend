const Booking = require("../models/Booking");
const Property = require("../models/Property");
const { notify } = require("../utils/notify");
const { getIO } = require("../socket");

const POPULATE = [
  { path: "property", select: "title location price deposit images user" },
  { path: "user", select: "name email" },
  { path: "owner", select: "name email" },
];

function isTenant(b, user) { return String(b.user?._id || b.user) === String(user._id); }
function isOwner(b, user)  { return String(b.owner?._id || b.owner) === String(user._id); }

async function getRentalBooking(id) {
  const booking = await Booking.findById(id);
  if (!booking) return { error: { status: 404, message: "Booking not found" } };
  if (booking.type !== "rental") {
    return { error: { status: 400, message: "Move-in flow only applies to rentals" } };
  }
  return { booking };
}

// Recompute moveInCompletedAt every time a checklist field changes.
function maybeCompleteMoveIn(booking) {
  const m = booking.moveIn || {};
  const allDone =
    m.paymentDone === true &&
    !!m.tenantSignedAt && !!m.ownerSignedAt &&
    !!m.tenantConfirmedAt && !!m.ownerConfirmedAt;

  if (allDone && !booking.moveInCompletedAt) {
    booking.moveInCompletedAt = new Date();
    booking.status = "approved"; // already approved when created; keep status here
    return true;
  }
  return false;
}

function emitBookingUpdate(booking) {
  try {
    const io = getIO();
    if (!io) return;
    const tenantId = String(booking.user?._id || booking.user);
    const ownerId  = String(booking.owner?._id || booking.owner);
    if (tenantId) io.to(`user_${tenantId}`).emit("booking:updated", booking);
    if (ownerId && ownerId !== tenantId) io.to(`user_${ownerId}`).emit("booking:updated", booking);
  } catch (e) {
    console.error("emitBookingUpdate failed:", e.message);
  }
}

// POST /api/bookings/:id/movein/payment  — tenant only
// body: { method, ref? }
exports.recordPayment = async (req, res) => {
  try {
    const { booking, error } = await getRentalBooking(req.params.id);
    if (error) return res.status(error.status).json({ message: error.message });
    if (!isTenant(booking, req.user)) return res.status(403).json({ message: "Only the tenant can pay" });
    if (booking.moveIn?.paymentDone) return res.status(400).json({ message: "Move-in payment already recorded" });

    const { method, ref } = req.body || {};
    if (!method) return res.status(400).json({ message: "Payment method is required" });

    // Snapshot amounts at the moment of payment.
    const property = await Property.findById(booking.property).select("deposit price");
    const firstRent = Number(booking.priceQuoted) || Number(property?.price) || 0;
    const deposit   = Number(property?.deposit) || firstRent * 2; // sensible fallback: 2x rent
    const total     = firstRent + deposit;

    booking.moveIn = booking.moveIn || {};
    booking.moveIn.paymentDone     = true;
    booking.moveIn.paymentAmount   = total;
    booking.moveIn.depositAmount   = deposit;
    booking.moveIn.firstRentAmount = firstRent;
    booking.moveIn.paymentMode     = method;
    booking.moveIn.paymentRef      = ref || `MOV-${Date.now()}`;
    booking.moveIn.paymentAt       = new Date();
    maybeCompleteMoveIn(booking);
    await booking.save();

    notify({
      user: booking.owner,
      kind: "booking_status",
      title: "Move-in payment received",
      body: `${req.user.name || "Your tenant"} paid ₹${total.toLocaleString("en-IN")} (deposit + first month).`,
      link: "/owner/bookings",
      refId: booking._id,
      refType: "Booking",
      meta: { stage: "payment" },
    });

    const populated = await Booking.findById(booking._id).populate(POPULATE).lean();
    emitBookingUpdate(populated);
    res.json(populated);
  } catch (err) {
    console.error("moveIn.recordPayment:", err);
    res.status(500).json({ message: "Failed to record payment" });
  }
};

// POST /api/bookings/:id/movein/sign  — tenant or owner
exports.signAgreement = async (req, res) => {
  try {
    const { booking, error } = await getRentalBooking(req.params.id);
    if (error) return res.status(error.status).json({ message: error.message });

    const tenant = isTenant(booking, req.user);
    const owner  = isOwner(booking, req.user);
    if (!tenant && !owner) return res.status(403).json({ message: "Forbidden" });

    // Tenant must pay before either side can sign.
    if (!booking.moveIn?.paymentDone) {
      return res.status(400).json({ message: "Deposit + first rent must be paid before signing" });
    }

    booking.moveIn = booking.moveIn || {};
    if (tenant) {
      if (booking.moveIn.tenantSignedAt) return res.status(400).json({ message: "Already signed" });
      booking.moveIn.tenantSignedAt = new Date();
    } else {
      if (booking.moveIn.ownerSignedAt) return res.status(400).json({ message: "Already signed" });
      booking.moveIn.ownerSignedAt = new Date();
    }
    const justCompleted = maybeCompleteMoveIn(booking);
    await booking.save();

    const recipient = tenant ? booking.owner : booking.user;
    notify({
      user: recipient,
      kind: "booking_status",
      title: tenant ? "Tenant signed the agreement" : "Owner signed the agreement",
      body: `Awaiting the other party to sign.`,
      link: tenant ? "/owner/bookings" : "/my-bookings",
      refId: booking._id,
      refType: "Booking",
      meta: { stage: "sign" },
    });

    if (justCompleted) {
      // Both signed AND already paid AND already confirmed — fire the lease-live notification.
      notifyLeaseLive(booking);
    }

    const populated = await Booking.findById(booking._id).populate(POPULATE).lean();
    emitBookingUpdate(populated);
    res.json(populated);
  } catch (err) {
    console.error("moveIn.signAgreement:", err);
    res.status(500).json({ message: "Failed to sign" });
  }
};

// POST /api/bookings/:id/movein/confirm  — tenant or owner
exports.confirmMoveIn = async (req, res) => {
  try {
    const { booking, error } = await getRentalBooking(req.params.id);
    if (error) return res.status(error.status).json({ message: error.message });

    const tenant = isTenant(booking, req.user);
    const owner  = isOwner(booking, req.user);
    if (!tenant && !owner) return res.status(403).json({ message: "Forbidden" });

    // Both parties must have signed first.
    if (!booking.moveIn?.tenantSignedAt || !booking.moveIn?.ownerSignedAt) {
      return res.status(400).json({ message: "Both parties must sign the agreement before confirming move-in" });
    }

    booking.moveIn = booking.moveIn || {};
    if (tenant) {
      if (booking.moveIn.tenantConfirmedAt) return res.status(400).json({ message: "Already confirmed" });
      booking.moveIn.tenantConfirmedAt = new Date();
    } else {
      if (booking.moveIn.ownerConfirmedAt) return res.status(400).json({ message: "Already confirmed" });
      booking.moveIn.ownerConfirmedAt = new Date();
    }
    const justCompleted = maybeCompleteMoveIn(booking);
    if (justCompleted && !booking.checkIn) {
      booking.checkIn = new Date(); // anchor the lease start to today if not already set
    }
    await booking.save();

    const recipient = tenant ? booking.owner : booking.user;
    notify({
      user: recipient,
      kind: "booking_status",
      title: tenant ? "Tenant confirmed move-in" : "Owner confirmed move-in",
      body: justCompleted ? "Lease is now live." : "Awaiting the other party to confirm.",
      link: tenant ? "/owner/bookings" : "/my-bookings",
      refId: booking._id,
      refType: "Booking",
      meta: { stage: "confirm", leaseLive: justCompleted },
    });

    if (justCompleted) {
      notifyLeaseLive(booking);
    }

    const populated = await Booking.findById(booking._id).populate(POPULATE).lean();
    emitBookingUpdate(populated);
    res.json(populated);
  } catch (err) {
    console.error("moveIn.confirmMoveIn:", err);
    res.status(500).json({ message: "Failed to confirm move-in" });
  }
};

function notifyLeaseLive(booking) {
  // Notify tenant (owner already gets a "Tenant confirmed move-in" message above when relevant)
  notify({
    user: booking.user,
    kind: "booking_status",
    title: "🎉 Your lease is live",
    body: `Welcome home. You can pay rent and raise issues from My Bookings.`,
    link: "/my-bookings",
    refId: booking._id,
    refType: "Booking",
    meta: { stage: "live" },
  });
}
