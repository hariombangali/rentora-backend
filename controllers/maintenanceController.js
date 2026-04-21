const MaintenanceIssue = require("../models/MaintenanceIssue");
const Booking = require("../models/Booking");
const Property = require("../models/Property");
const { notify } = require("../utils/notify");

// POST /api/issues  — tenant
// body: { bookingId, category, description, priority }
exports.create = async (req, res) => {
  try {
    const { bookingId, category, description, priority } = req.body;
    if (!bookingId || !category || !description?.trim()) {
      return res.status(400).json({ message: "bookingId, category and description are required" });
    }
    const booking = await Booking.findById(bookingId).populate("property", "title user");
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the tenant can raise an issue" });
    }
    if (booking.type !== "rental") {
      return res.status(400).json({ message: "Issues can only be raised on an active rental" });
    }

    const issue = await MaintenanceIssue.create({
      property: booking.property._id,
      tenant:   booking.user,
      owner:    booking.owner,
      booking:  booking._id,
      category,
      description: description.trim(),
      priority: priority || "medium",
      status: "open",
    });

    notify({
      user: booking.owner,
      kind: "booking_new",
      title: `New maintenance request`,
      body: `${req.user.name || "Your tenant"} raised a ${category.toLowerCase()} issue at ${booking.property?.title || "your home"}.`,
      link: "/owner/issues",
      refId: issue._id,
      refType: "Booking",
      meta: { category, priority: issue.priority, propertyTitle: booking.property?.title },
    });

    res.status(201).json(issue);
  } catch (err) {
    console.error("issues.create:", err);
    res.status(500).json({ message: "Failed to create issue" });
  }
};

// GET /api/issues/my  — tenant
exports.listMine = async (req, res) => {
  try {
    const items = await MaintenanceIssue.find({ tenant: req.user._id })
      .populate("property", "title location")
      .sort({ createdAt: -1 })
      .lean();
    res.json(items);
  } catch (err) {
    console.error("issues.listMine:", err);
    res.status(500).json({ message: "Failed" });
  }
};

// GET /api/issues/owner?status=
exports.listForOwner = async (req, res) => {
  try {
    const q = { owner: req.user._id };
    if (req.query.status) q.status = req.query.status;
    const items = await MaintenanceIssue.find(q)
      .populate("property", "title location")
      .populate("tenant", "name email")
      .sort({ createdAt: -1 })
      .lean();
    res.json(items);
  } catch (err) {
    console.error("issues.listForOwner:", err);
    res.status(500).json({ message: "Failed" });
  }
};

// PATCH /api/issues/:id/status  — owner
// body: { status, ownerNote? }
exports.updateStatus = async (req, res) => {
  try {
    const { status, ownerNote } = req.body;
    if (!MaintenanceIssue.STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const issue = await MaintenanceIssue.findById(req.params.id).populate("property", "title");
    if (!issue) return res.status(404).json({ message: "Not found" });
    if (issue.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the owner can update" });
    }

    issue.status = status;
    if (ownerNote != null) issue.ownerNote = ownerNote;
    if (status === "resolved" || status === "closed") issue.resolvedAt = new Date();
    await issue.save();

    notify({
      user: issue.tenant,
      kind: "booking_status",
      title: status === "resolved" ? "Issue resolved" : status === "acknowledged" ? "Owner acknowledged your issue" : "Issue update",
      body: `${issue.category} at ${issue.property?.title || "your home"} is now ${status.replace("_", " ")}${ownerNote ? ` — ${ownerNote}` : ""}.`,
      link: "/my-bookings",
      refId: issue._id,
      refType: "Booking",
      meta: { status, category: issue.category, propertyTitle: issue.property?.title },
    });

    res.json(issue);
  } catch (err) {
    console.error("issues.updateStatus:", err);
    res.status(500).json({ message: "Failed" });
  }
};
