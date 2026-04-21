const mongoose = require("mongoose");

const rentPaymentSchema = new mongoose.Schema(
  {
    booking:  { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
    tenant:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    owner:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    amount:      { type: Number, required: true },
    periodLabel: { type: String, required: true },  // e.g. "May 2026"
    periodMonth: { type: Number, required: true },  // 1..12
    periodYear:  { type: Number, required: true },

    method:  { type: String, enum: ["UPI", "Card", "Netbanking", "Cash", "Manual"], default: "UPI" },
    status:  { type: String, enum: ["paid", "pending", "failed"], default: "paid" }, // simulated flow marks as paid
    receiptNumber: { type: String, required: true, unique: true },
    paidAt:  { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// one payment per booking per period
rentPaymentSchema.index({ booking: 1, periodYear: 1, periodMonth: 1 }, { unique: true });

module.exports = mongoose.model("RentPayment", rentPaymentSchema);
