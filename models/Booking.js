// models/Booking.js
const mongoose = require("mongoose");

const rescheduleSchema = new mongoose.Schema(
  {
    date: { type: Date },
    slot: { type: String },
    reason: { type: String },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    // Parties
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },   // requester/seeker
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },  // property owner

    // Unified type
    type: { type: String, enum: ["lead", "visit", "rental"], required: true },

    // Common
    message: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "rescheduled", "cancelled", "completed"],
      default: "pending",
    },

    // Visit-only
    visitDate: { type: Date },     // normalized to 00:00
    visitSlot: { type: String },   // e.g., "10:00 AM"
    reschedule: { type: rescheduleSchema, default: undefined },

    // Rental-only (long-term)
    checkIn: { type: Date },
    checkOut: { type: Date },      // optional

    // Commercials
    priceQuoted: { type: Number }, // snapshot (e.g., monthly rent)
    paid: { type: Boolean, default: false },
    paymentInfo: { type: Object },

    // Read flags
    isReadByOwner: { type: Boolean, default: false },
    isReadByUser: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Helpful indexes
bookingSchema.index({ property: 1, type: 1, status: 1 });
bookingSchema.index({ property: 1, visitDate: 1, visitSlot: 1, status: 1 });
bookingSchema.index({ property: 1, checkIn: 1, checkOut: 1, status: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
