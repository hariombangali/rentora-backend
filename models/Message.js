const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: false },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // logged in user
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // property owner
    content: { type: String, required: true },
  },
  { timestamps: true }
);

const Message = mongoose.model("Message", messageSchema);
module.exports = Message;
