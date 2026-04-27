const MaintenanceIssue = require("../models/MaintenanceIssue");
const Booking = require("../models/Booking");
const { notify } = require("../utils/notify");
const { getIO } = require("../socket");

const POPULATE = [
  { path: "property", select: "title location" },
  { path: "tenant",   select: "name email" },
  { path: "comments.author", select: "name" },
];

function isOwner(issue, user)  { return issue.owner.toString()  === user._id.toString(); }
function isTenant(issue, user) { return issue.tenant.toString() === user._id.toString(); }

// Push the freshly-populated issue to both parties' personal socket rooms.
function emitIssueUpdate(issue) {
  try {
    const io = getIO();
    if (!io || !issue) return;
    const tenantId = String(issue.tenant?._id || issue.tenant);
    const ownerId  = String(issue.owner?._id  || issue.owner);
    if (tenantId) io.to(`user_${tenantId}`).emit("issue:updated", issue);
    if (ownerId  && ownerId !== tenantId) io.to(`user_${ownerId}`).emit("issue:updated", issue);
  } catch (e) {
    console.error("emitIssueUpdate failed:", e.message);
  }
}

// POST /api/issues  — tenant
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

    const images = (req.files || []).map((f) => f.path).slice(0, 5);

    const issue = await MaintenanceIssue.create({
      property: booking.property._id,
      tenant:   booking.user,
      owner:    booking.owner,
      booking:  booking._id,
      category,
      description: description.trim(),
      priority: priority || "medium",
      images,
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

    const populated = await MaintenanceIssue.findById(issue._id).populate(POPULATE).lean();
    emitIssueUpdate(populated);
    res.status(201).json(populated);
  } catch (err) {
    console.error("issues.create:", err);
    res.status(500).json({ message: "Failed to create issue" });
  }
};

// GET /api/issues/my  — tenant
exports.listMine = async (req, res) => {
  try {
    const items = await MaintenanceIssue.find({ tenant: req.user._id })
      .populate(POPULATE)
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
      .populate(POPULATE)
      .sort({ createdAt: -1 })
      .lean();
    res.json(items);
  } catch (err) {
    console.error("issues.listForOwner:", err);
    res.status(500).json({ message: "Failed" });
  }
};

// PATCH /api/issues/:id/status  — owner
// body: { status, ownerNote?, scheduledFor? }
exports.updateStatus = async (req, res) => {
  try {
    const { status, ownerNote, scheduledFor } = req.body;
    if (!MaintenanceIssue.STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const issue = await MaintenanceIssue.findById(req.params.id).populate("property", "title");
    if (!issue) return res.status(404).json({ message: "Not found" });
    if (!isOwner(issue, req.user)) {
      return res.status(403).json({ message: "Only the owner can update" });
    }

    issue.status = status;
    if (ownerNote != null) issue.ownerNote = ownerNote;
    if (scheduledFor !== undefined) issue.scheduledFor = scheduledFor || null;

    if (status === "resolved") {
      issue.resolvedAt = new Date();
      issue.awaitingTenantConfirm = true;
    }
    if (status === "closed") {
      issue.resolvedAt = issue.resolvedAt || new Date();
      issue.awaitingTenantConfirm = false;
    }
    if (status === "open" || status === "acknowledged" || status === "in_progress") {
      issue.awaitingTenantConfirm = false;
    }
    await issue.save();

    const titleByStatus = {
      acknowledged: "Owner acknowledged your issue",
      in_progress:  "Owner is working on your issue",
      resolved:     "Owner marked your issue as fixed",
      closed:       "Issue closed",
      open:         "Issue update",
    };

    notify({
      user: issue.tenant,
      kind: "booking_status",
      title: titleByStatus[status] || "Issue update",
      body: `${issue.category} at ${issue.property?.title || "your home"} is now ${status.replace("_", " ")}${ownerNote ? ` — ${ownerNote}` : ""}.`,
      link: "/my-bookings",
      refId: issue._id,
      refType: "Booking",
      meta: { status, category: issue.category, propertyTitle: issue.property?.title, awaitingTenantConfirm: issue.awaitingTenantConfirm },
    });

    const populated = await MaintenanceIssue.findById(issue._id).populate(POPULATE).lean();
    emitIssueUpdate(populated);
    res.json(populated);
  } catch (err) {
    console.error("issues.updateStatus:", err);
    res.status(500).json({ message: "Failed" });
  }
};

// PATCH /api/issues/:id/schedule  — owner
// body: { scheduledFor: ISO date string | null }
exports.setSchedule = async (req, res) => {
  try {
    const { scheduledFor } = req.body;
    const issue = await MaintenanceIssue.findById(req.params.id).populate("property", "title");
    if (!issue) return res.status(404).json({ message: "Not found" });
    if (!isOwner(issue, req.user)) return res.status(403).json({ message: "Forbidden" });

    issue.scheduledFor = scheduledFor || null;
    await issue.save();

    if (scheduledFor) {
      const when = new Date(scheduledFor).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
      notify({
        user: issue.tenant,
        kind: "booking_status",
        title: "Maintenance visit scheduled",
        body: `Owner scheduled a visit for ${issue.category} on ${when} at ${issue.property?.title || "your home"}.`,
        link: "/my-bookings",
        refId: issue._id,
        refType: "Booking",
        meta: { scheduledFor, category: issue.category },
      });
    }

    const populated = await MaintenanceIssue.findById(issue._id).populate(POPULATE).lean();
    emitIssueUpdate(populated);
    res.json(populated);
  } catch (err) {
    console.error("issues.setSchedule:", err);
    res.status(500).json({ message: "Failed" });
  }
};

// POST /api/issues/:id/comments  — tenant or owner
// body: { text }
exports.addComment = async (req, res) => {
  try {
    const text = (req.body?.text || "").trim();
    if (!text) return res.status(400).json({ message: "Comment text is required" });
    if (text.length > 1000) return res.status(400).json({ message: "Comment too long" });

    const issue = await MaintenanceIssue.findById(req.params.id).populate("property", "title");
    if (!issue) return res.status(404).json({ message: "Not found" });

    const isT = isTenant(issue, req.user);
    const isO = isOwner(issue, req.user);
    if (!isT && !isO) return res.status(403).json({ message: "Forbidden" });

    const role = isT ? "tenant" : "owner";
    issue.comments.push({ author: req.user._id, authorRole: role, text });
    await issue.save();

    const recipient = isT ? issue.owner : issue.tenant;
    notify({
      user: recipient,
      kind: "booking_status",
      title: `New comment on your maintenance issue`,
      body: `${req.user.name || (isT ? "Tenant" : "Owner")}: ${text.length > 80 ? text.slice(0, 80) + "…" : text}`,
      link: isT ? "/owner/issues" : "/my-bookings",
      refId: issue._id,
      refType: "Booking",
      meta: { category: issue.category, propertyTitle: issue.property?.title },
    });

    const populated = await MaintenanceIssue.findById(issue._id).populate(POPULATE).lean();
    emitIssueUpdate(populated);
    res.status(201).json(populated);
  } catch (err) {
    console.error("issues.addComment:", err);
    res.status(500).json({ message: "Failed" });
  }
};

// PATCH /api/issues/:id/confirm  — tenant confirms a resolved issue → closed
exports.tenantConfirm = async (req, res) => {
  try {
    const issue = await MaintenanceIssue.findById(req.params.id).populate("property", "title");
    if (!issue) return res.status(404).json({ message: "Not found" });
    if (!isTenant(issue, req.user)) return res.status(403).json({ message: "Forbidden" });
    if (issue.status !== "resolved") {
      return res.status(400).json({ message: "Only resolved issues can be confirmed" });
    }

    issue.status = "closed";
    issue.awaitingTenantConfirm = false;
    issue.tenantConfirmedAt = new Date();
    await issue.save();

    notify({
      user: issue.owner,
      kind: "booking_status",
      title: "Tenant confirmed the fix",
      body: `${issue.category} at ${issue.property?.title || "your property"} is now closed.`,
      link: "/owner/issues",
      refId: issue._id,
      refType: "Booking",
      meta: { category: issue.category },
    });

    const populated = await MaintenanceIssue.findById(issue._id).populate(POPULATE).lean();
    emitIssueUpdate(populated);
    res.json(populated);
  } catch (err) {
    console.error("issues.tenantConfirm:", err);
    res.status(500).json({ message: "Failed" });
  }
};

// PATCH /api/issues/:id/reopen  — tenant reopens a resolved issue
// body: { reason? }
exports.tenantReopen = async (req, res) => {
  try {
    const reason = (req.body?.reason || "").trim();
    const issue = await MaintenanceIssue.findById(req.params.id).populate("property", "title");
    if (!issue) return res.status(404).json({ message: "Not found" });
    if (!isTenant(issue, req.user)) return res.status(403).json({ message: "Forbidden" });
    if (issue.status !== "resolved" && issue.status !== "closed") {
      return res.status(400).json({ message: "Only resolved/closed issues can be reopened" });
    }

    issue.status = "open";
    issue.awaitingTenantConfirm = false;
    issue.tenantConfirmedAt = null;
    issue.resolvedAt = null;
    issue.reopenCount = (issue.reopenCount || 0) + 1;

    if (reason) {
      issue.comments.push({
        author: req.user._id,
        authorRole: "tenant",
        text: `Reopened: ${reason}`,
      });
    }
    await issue.save();

    notify({
      user: issue.owner,
      kind: "booking_status",
      title: "Tenant reopened a maintenance issue",
      body: `${issue.category} at ${issue.property?.title || "your property"} was reopened${reason ? ` — ${reason}` : ""}.`,
      link: "/owner/issues",
      refId: issue._id,
      refType: "Booking",
      meta: { category: issue.category, reason },
    });

    const populated = await MaintenanceIssue.findById(issue._id).populate(POPULATE).lean();
    emitIssueUpdate(populated);
    res.json(populated);
  } catch (err) {
    console.error("issues.tenantReopen:", err);
    res.status(500).json({ message: "Failed" });
  }
};
