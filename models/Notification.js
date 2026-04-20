const mongoose = require("mongoose");

const NOTIFICATION_KINDS = [
  "application_new",
  "application_status",
  "application_withdrawn",
  "booking_new",
  "booking_status",
  "booking_rescheduled",
  "message_new",
];

const notificationSchema = new mongoose.Schema(
  {
    user:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind:  { type: String, enum: NOTIFICATION_KINDS, required: true },
    title: { type: String, required: true },
    body:  { type: String, default: "" },
    link:  { type: String, default: "" },          // relative path, e.g. /owner/applications
    refId: { type: mongoose.Schema.Types.ObjectId, default: null }, // booking/application/message id
    refType: { type: String, enum: ["Application", "Booking", "Message", null], default: null },
    meta:  { type: Object, default: {} },           // optional payload (e.g. property title, avatar)
    read:  { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
module.exports.NOTIFICATION_KINDS = NOTIFICATION_KINDS;
