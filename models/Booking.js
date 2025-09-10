// models/Booking.js
const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // requester
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // property owner
  status: { 
    type: String, 
    enum: ["pending", "approved", "rejected", "cancelled", "completed"], 
    default: "pending"
  },
  checkIn: { type: Date, required: true },
  checkOut: { type: Date }, // optional for monthly rent; can be null
  message: { type: String },
  priceQuoted: { type: Number }, // optional snapshot at time of request (rent or deposit)
  paid: { type: Boolean, default: false },
  paymentInfo: { type: Object }, // store payment metadata (paymentId, amount, status)
  isReadByOwner: { type: Boolean, default: false }, // owner unread flag
  isReadByUser: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model("Booking", bookingSchema);
