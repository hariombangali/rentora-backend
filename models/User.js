const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    contact: { type: String }, // Add contact/phone here
    role: {
      type: String,
      enum: ["guest", "user", "owner", "admin"],
      default: "user", 
    },
    ownerKYC: {
      ownerName: String,
      ownerEmail: String,
      ownerPhone: String,
      ownerIdType: String,
      ownerIdNumber: String,
      ownerIdFile: String,
      ownershipProofType: String,
      ownershipProofDocNumber: String,
      ownershipProofFile: String,
    },

    ownerVerified: { type: Boolean, default: false },  // default false till admin verifies
    ownerRejected: { type: Boolean, default: false },
    ownerRejectionReason: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
