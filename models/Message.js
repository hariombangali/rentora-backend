const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: false },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // logged in user
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // property owner
    content: { type: String, required: true },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ sender: 1, receiver: 1, property: 1 });
messageSchema.index({ createdAt: -1 });

const Message = mongoose.model("Message", messageSchema);
module.exports = Message;
