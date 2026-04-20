const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    // Parties
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    user:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    owner:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // Applicant (Step 1)
    name:          { type: String, required: true, trim: true },
    phone:         { type: String, required: true, trim: true },
    email:         { type: String, required: true, trim: true, lowercase: true },
    occupation:    { type: String, enum: ["Student", "Working professional", "Self-employed", "Business owner", "Other"], required: true },
    employer:      { type: String, trim: true, default: "" },
    monthlyIncome: { type: Number, default: null },

    // Tenancy (Step 2)
    moveInDate: { type: Date, required: true },
    duration:   { type: String, enum: ["6 months", "11 months", "1 year", "2+ years"], required: true },

    // Occupants (Step 3)
    occupantCount: { type: String, enum: ["1", "2", "3", "4", "5+"], required: true },
    occupantType:  { type: String, enum: ["Self", "Couple", "Family", "Friends", "Colleagues"], default: "Self" },
    hasPets:       { type: Boolean, default: false },

    // Verification (Step 4)
    idType:         { type: String, enum: ["Aadhar", "PAN", "Driving license", "Passport", "Other"], required: true },
    idNumber:       { type: String, required: true, trim: true },
    previousAddress:{ type: String, default: "" },
    referenceName:  { type: String, default: "" },
    referencePhone: { type: String, default: "" },
    aboutMe:        { type: String, default: "" },

    // Owner workflow
    status:      { type: String, enum: ["pending", "reviewing", "approved", "rejected", "withdrawn"], default: "pending", index: true },
    ownerNote:   { type: String, default: "" },
    decidedAt:   { type: Date },

    // Bridge — rental Booking auto-created when status = approved
    booking:     { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null },

    // Read flags (for notifications)
    isReadByOwner: { type: Boolean, default: false },
    isReadByUser:  { type: Boolean, default: true },
  },
  { timestamps: true }
);

applicationSchema.index({ property: 1, user: 1, status: 1 });
applicationSchema.index({ owner: 1, createdAt: -1 });
applicationSchema.index({ user: 1, createdAt: -1 });

// Prevent duplicate active applications from the same user for the same property
applicationSchema.index(
  { property: 1, user: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["pending", "reviewing", "approved"] } } }
);

module.exports = mongoose.model("Application", applicationSchema);
