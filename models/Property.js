const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // Basic Info
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },

  // Location
location: {
    city: { type: String, required: true },
    locality: { type: String, required: true },
    address: { type: String, required:true },
    pincode: { type: String, required: true },
    // GeoJSON Point
    point: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
        }
    }
  },

  // Availability & Tenant Preferences
  availableFor: { type: String, enum: ["Boys", "Girls", "Any"], default: "Any" },
  preferredTenants: { type: String, enum: ["Students", "Working Professionals", "Any"], default: "Any" },
  availableFrom: { type: Date, required: true },
  
  // Room & Property Specifics
  occupancyType: { type: String, enum: ["Single", "Shared", "Both"], default: "Single" },
  sharingCount: { type: String, default: "2" }, // Can be "2", "3", "4", "5+"
  bedrooms: { type: Number, default: 1 },
  attachedBathroom: { type: String, enum: ["Yes", "No"], default: "Yes" },
  attachedBalcony: { type: String, enum: ["Yes", "No"], default: "Yes" },
  furnishing: { type: String, enum: ["Unfurnished", "Semi-furnished", "Fully furnished"], default: "Unfurnished" },
  ageOfProperty: { type: String }, // e.g., "0 - 1 Year"
  totalFloors: { type: Number },
  propertyOnFloor: { type: Number },
  
  // Pricing & Contract
  price: { type: Number, required: true },
  deposit: { type: Number, default: 0 },
  maintenance: { type: Number, default: 0 },
  maintenanceFreq: { type: String, enum: ["Monthly", "Quarterly", "Yearly"], default: "Yearly" },
  earlyLeavingCharges: { type: Number, default: 0 },
  minContractDuration: { type: String, default: "1 Month" },
  noticePeriod: { type: String, default: "1 Month" },

  // Amenities & Images
  commonAreaFacilities: { type: [String], default: [] },
  pgAmenities: { type: [String], default: [] },
  images: { type: [String], default: [] }, // Stores filenames

  // Admin fields
  approved: { type: Boolean, default: false },
  rejected: { type: Boolean, default: false },
  rejectionReason: { type: String, default: "" },
  featured: { type: Boolean, default: false },
   active: { type: Boolean, default: true },

}, { timestamps: true });

module.exports = mongoose.model("Property", propertySchema);
