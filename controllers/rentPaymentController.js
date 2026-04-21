const RentPayment = require("../models/RentPayment");
const Booking = require("../models/Booking");
const { notify } = require("../utils/notify");

function genReceiptNumber() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.floor(Math.random() * 1e6).toString(36).toUpperCase().padStart(4, "0");
  return `RNT-${t}-${r}`;
}

// POST /api/rent-payments  — tenant
// body: { bookingId, periodLabel, periodMonth, periodYear, method }
exports.create = async (req, res) => {
  try {
    const { bookingId, periodLabel, periodMonth, periodYear, method } = req.body;
    if (!bookingId) return res.status(400).json({ message: "bookingId required" });

    const booking = await Booking.findById(bookingId).populate("property", "title price");
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the tenant can pay rent" });
    }
    if (booking.type !== "rental") {
      return res.status(400).json({ message: "Not a rental booking" });
    }

    const amount = booking.priceQuoted || booking.property?.price;
    if (!amount) return res.status(400).json({ message: "No rent amount on booking" });

    const month = Number(periodMonth) || (new Date().getMonth() + 1);
    const year = Number(periodYear) || new Date().getFullYear();
    const label = periodLabel || new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });

    // Block duplicate payment for same period
    const exists = await RentPayment.findOne({ booking: bookingId, periodMonth: month, periodYear: year });
    if (exists) return res.status(409).json({ message: `Rent already paid for ${label}`, payment: exists });

    const payment = await RentPayment.create({
      booking: booking._id,
      property: booking.property._id,
      tenant: booking.user,
      owner: booking.owner,
      amount,
      periodLabel: label,
      periodMonth: month,
      periodYear: year,
      method: method || "UPI",
      status: "paid",
      receiptNumber: genReceiptNumber(),
      paidAt: new Date(),
    });

    // Mark the booking as paid flag (latest payment)
    booking.paid = true;
    booking.paymentInfo = { lastPaymentId: payment._id, lastPaidAt: payment.paidAt, lastPeriodLabel: label };
    await booking.save();

    // Notify owner
    notify({
      user: booking.owner,
      kind: "booking_status",
      title: "Rent received",
      body: `${req.user.name || "Tenant"} paid rent for ${booking.property?.title || "your home"} (${label}).`,
      link: "/owner/bookings",
      refId: booking._id,
      refType: "Booking",
      meta: { propertyTitle: booking.property?.title, periodLabel: label, amount },
    });

    res.status(201).json(payment);
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ message: "Rent already paid for this period" });
    console.error("rentPayments.create:", err);
    res.status(500).json({ message: "Failed to record payment" });
  }
};

// GET /api/rent-payments/my?bookingId=
exports.listMine = async (req, res) => {
  try {
    const q = { tenant: req.user._id };
    if (req.query.bookingId) q.booking = req.query.bookingId;
    const items = await RentPayment.find(q)
      .populate("property", "title")
      .sort({ periodYear: -1, periodMonth: -1, createdAt: -1 })
      .lean();
    res.json(items);
  } catch (err) {
    console.error("rentPayments.listMine:", err);
    res.status(500).json({ message: "Failed" });
  }
};

// GET /api/rent-payments/:id
exports.get = async (req, res) => {
  try {
    const p = await RentPayment.findById(req.params.id)
      .populate("property", "title location")
      .populate("tenant", "name email")
      .populate("owner", "name email");
    if (!p) return res.status(404).json({ message: "Not found" });
    const uid = req.user._id.toString();
    if (p.tenant._id.toString() !== uid && p.owner._id.toString() !== uid) {
      return res.status(403).json({ message: "Not allowed" });
    }
    res.json(p);
  } catch (err) {
    console.error("rentPayments.get:", err);
    res.status(500).json({ message: "Failed" });
  }
};
