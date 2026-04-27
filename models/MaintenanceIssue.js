const mongoose = require("mongoose");

const ISSUE_CATEGORIES = ["Electrical", "Plumbing", "Appliance", "Cleaning", "Furniture", "Pest", "Other"];
const ISSUE_PRIORITY = ["low", "medium", "high"];
const ISSUE_STATUS = ["open", "acknowledged", "in_progress", "resolved", "closed"];

const commentSchema = new mongoose.Schema(
  {
    author:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    authorRole:{ type: String, enum: ["tenant", "owner"], required: true },
    text:      { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const issueSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true },
    tenant:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    owner:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    booking:  { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null },

    category:    { type: String, enum: ISSUE_CATEGORIES, required: true },
    description: { type: String, required: true, trim: true },
    priority:    { type: String, enum: ISSUE_PRIORITY, default: "medium" },
    status:      { type: String, enum: ISSUE_STATUS, default: "open", index: true },

    images:      [{ type: String }],

    ownerNote:   { type: String, default: "" },
    scheduledFor:{ type: Date, default: null },

    comments:    [commentSchema],

    awaitingTenantConfirm: { type: Boolean, default: false },
    tenantConfirmedAt:     { type: Date, default: null },
    reopenCount:           { type: Number, default: 0 },

    resolvedAt:  { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MaintenanceIssue", issueSchema);
module.exports.CATEGORIES = ISSUE_CATEGORIES;
module.exports.PRIORITIES = ISSUE_PRIORITY;
module.exports.STATUSES   = ISSUE_STATUS;
