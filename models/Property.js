
const mongoose = require('mongoose'); 

const propertySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  title: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  deposit: { type: Number, default: 0 },

  type: {
    type: String,
    enum: ["1BHK", "2BHK", "Studio", "PG"],
    required: true,
  },

  furnishing: {
    type: String,
    enum: ["Furnished", "Semi-Furnished", "Unfurnished"],
    required: true,
  },

  location: {
    city: { type: String, required: true },
    locality: { type: String},
    address: { type: String, required: true },
    pincode: { type: String, required: true },
  },

  tenants: {
    type: String,
    enum: ["Any", "Students", "Working Professionals", "Family"],
    default: "Any",
  },
  availableFrom: {
  type: Date,   // ya String bhi hota hai, lekin Date recommended
  default: null,
},

  amenities: { type: [String], default: [] },
  images: { type: [String], default: [] },

  // ✅ Owner KYC details (nested)
  // ownerKYC: {
  //   ownerName: { type: String, required: true },
  //   ownerEmail: { type: String, required: true },
  //   ownerPhone: { type: String, required: true },
  //   ownerIdType: { type: String, required: true },
  //   ownerIdNumber: { type: String, required: true },
  //   ownerIdFile: { type: String, required: true },
  // },

  // ✅ Ownership proof details (nested)
  // ownershipProof: {
  //   ownershipProofType: { type: String, required: true },
  //   ownershipProofDocNumber: { type: String },
  //   ownershipProofFile: { type: String, required: true },
  // },
  approved: { type: Boolean, default: false },
  rejected: { type: Boolean, default: false },
rejectionReason: { type: String, default: "" },

}, { timestamps: true });

module.exports = mongoose.model("Property", propertySchema);

