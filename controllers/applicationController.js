const Application = require("../models/Application");
const Property = require("../models/Property");
const User = require("../models/User");
const Booking = require("../models/Booking");
const { sendNewBookingEmail, sendBookingStatusEmail } = require("../utils/sendEmail");

// Fire-and-forget email
const fireEmail = (fn, ...args) => fn(...args).catch((e) => console.error("Email send failed:", e.message));

// Convert duration string ("11 months", "2+ years", "1 year") to an end-Date
function computeCheckOut(startDate, duration) {
  const d = new Date(startDate);
  if (!duration) return null;
  const m = String(duration).toLowerCase();
  if (m.includes("6 month")) d.setMonth(d.getMonth() + 6);
  else if (m.includes("11 month")) d.setMonth(d.getMonth() + 11);
  else if (m.includes("1 year") || m.includes("12 month")) d.setFullYear(d.getFullYear() + 1);
  else if (m.includes("2") && m.includes("year")) d.setFullYear(d.getFullYear() + 2);
  else d.setMonth(d.getMonth() + 11);
  return d;
}

// POST /api/applications
exports.createApplication = async (req, res) => {
  try {
    const {
      propertyId, name, phone, email, occupation, employer, monthlyIncome,
      moveInDate, duration, occupantCount, occupantType, hasPets,
      idType, idNumber, previousAddress, referenceName, referencePhone, aboutMe,
    } = req.body;

    if (!propertyId) return res.status(400).json({ message: "propertyId is required" });

    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ message: "Property not found" });
    if (!property.approved || property.rejected || property.active === false) {
      return res.status(400).json({ message: "This property isn't accepting applications" });
    }
    if (String(property.user) === String(req.user._id)) {
      return res.status(400).json({ message: "You can't apply to your own listing" });
    }

    const existing = await Application.findOne({
      property: propertyId,
      user: req.user._id,
      status: { $in: ["pending", "reviewing", "approved"] },
    });
    if (existing) {
      return res.status(409).json({
        message: "You already have an active application for this home",
        applicationId: existing._id,
      });
    }

    const app = await Application.create({
      property: propertyId,
      user: req.user._id,
      owner: property.user,
      name, phone, email,
      occupation,
      employer: employer || "",
      monthlyIncome: monthlyIncome ? Number(monthlyIncome) : null,
      moveInDate,
      duration,
      occupantCount: String(occupantCount),
      occupantType: occupantType || "Self",
      hasPets: Boolean(hasPets),
      idType,
      idNumber,
      previousAddress: previousAddress || "",
      referenceName: referenceName || "",
      referencePhone: referencePhone || "",
      aboutMe: aboutMe || "",
    });

    // Notify owner
    const owner = await User.findById(property.user).select("email name").lean();
    if (owner?.email) {
      fireEmail(sendNewBookingEmail, owner.email, {
        bookingType: "rental application",
        propertyTitle: property.title,
        seekerName: name || req.user.name,
      });
    }

    res.status(201).json(app);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "You already have an active application for this home" });
    }
    console.error("createApplication error:", err);
    res.status(500).json({ message: "Failed to create application" });
  }
};

// GET /api/applications/my
exports.getMyApplications = async (req, res) => {
  try {
    const apps = await Application.find({ user: req.user._id })
      .populate({ path: "property", select: "title price images location" })
      .populate({ path: "owner", select: "name email" })
      .populate({ path: "booking", select: "type status checkIn checkOut priceQuoted" })
      .sort({ createdAt: -1 })
      .lean();
    res.json(apps);
  } catch (err) {
    console.error("getMyApplications:", err);
    res.status(500).json({ message: "Failed to load applications" });
  }
};

// GET /api/applications/owner
exports.getOwnerApplications = async (req, res) => {
  try {
    const { status, propertyId } = req.query;
    const q = { owner: req.user._id };
    if (status) q.status = status;
    if (propertyId) q.property = propertyId;

    const apps = await Application.find(q)
      .populate({ path: "property", select: "title price images location" })
      .populate({ path: "user", select: "name email" })
      .populate({ path: "booking", select: "type status checkIn checkOut priceQuoted" })
      .sort({ createdAt: -1 })
      .lean();
    res.json(apps);
  } catch (err) {
    console.error("getOwnerApplications:", err);
    res.status(500).json({ message: "Failed to load applications" });
  }
};

// GET /api/applications/:id
exports.getApplicationById = async (req, res) => {
  try {
    const app = await Application.findById(req.params.id)
      .populate({ path: "property", select: "title price images location user" })
      .populate({ path: "user", select: "name email" })
      .populate({ path: "owner", select: "name email" })
      .populate({ path: "booking", select: "type status checkIn checkOut priceQuoted" });
    if (!app) return res.status(404).json({ message: "Application not found" });

    const isParty =
      String(app.user._id || app.user) === String(req.user._id) ||
      String(app.owner._id || app.owner) === String(req.user._id);
    if (!isParty) return res.status(403).json({ message: "Not authorized" });

    if (String(app.owner._id || app.owner) === String(req.user._id) && !app.isReadByOwner) {
      app.isReadByOwner = true;
      await app.save();
    } else if (String(app.user._id || app.user) === String(req.user._id) && !app.isReadByUser) {
      app.isReadByUser = true;
      await app.save();
    }

    res.json(app);
  } catch (err) {
    console.error("getApplicationById:", err);
    res.status(500).json({ message: "Failed to load application" });
  }
};

// PATCH /api/applications/:id/status  — owner-only
// Status transitions to `approved` automatically create a rental Booking.
exports.updateApplicationStatus = async (req, res) => {
  try {
    const { status, ownerNote } = req.body;
    const allowed = ["reviewing", "approved", "rejected"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const app = await Application.findById(req.params.id)
      .populate({ path: "property", select: "title price" })
      .populate({ path: "user", select: "name email" });
    if (!app) return res.status(404).json({ message: "Application not found" });
    if (String(app.owner) !== String(req.user._id)) {
      return res.status(403).json({ message: "Only the property owner can update status" });
    }

    app.status = status;
    if (ownerNote != null) app.ownerNote = ownerNote;
    app.decidedAt = new Date();
    app.isReadByUser = false;

    // BRIDGE: when application is approved, auto-create a rental Booking
    if (status === "approved" && !app.booking) {
      // Skip if an existing non-terminal rental Booking exists for this property+user
      const existing = await Booking.findOne({
        property: app.property._id,
        user: app.user._id,
        type: "rental",
        status: { $in: ["pending", "approved", "rescheduled"] },
      });
      if (existing) {
        app.booking = existing._id;
      } else {
        const checkIn = new Date(app.moveInDate);
        const checkOut = computeCheckOut(checkIn, app.duration);
        const booking = await Booking.create({
          property: app.property._id,
          user: app.user._id,
          owner: app.owner,
          type: "rental",
          status: "approved",
          message: ownerNote || "Rental approved via application",
          checkIn,
          checkOut,
          priceQuoted: app.property?.price || null,
          isReadByOwner: true,
          isReadByUser: false,
        });
        app.booking = booking._id;
      }
    }

    await app.save();

    // Notify applicant of decision
    if (app.user?.email && ["approved", "rejected"].includes(status)) {
      fireEmail(sendBookingStatusEmail, app.user.email, {
        bookingType: "rental application",
        status,
        propertyTitle: app.property?.title || "the property",
        reason: ownerNote || "",
        seekerName: app.user.name,
      });
    }

    res.json(app);
  } catch (err) {
    console.error("updateApplicationStatus:", err);
    res.status(500).json({ message: "Failed to update application" });
  }
};

// PATCH /api/applications/:id/withdraw  — tenant-only
exports.withdrawApplication = async (req, res) => {
  try {
    const app = await Application.findById(req.params.id)
      .populate({ path: "property", select: "title" })
      .populate({ path: "owner", select: "email name" });
    if (!app) return res.status(404).json({ message: "Application not found" });
    if (String(app.user) !== String(req.user._id)) {
      return res.status(403).json({ message: "Only the applicant can withdraw" });
    }
    if (["approved", "rejected", "withdrawn"].includes(app.status)) {
      return res.status(400).json({ message: `Application already ${app.status}` });
    }
    app.status = "withdrawn";
    app.decidedAt = new Date();
    await app.save();

    // Notify owner
    if (app.owner?.email) {
      fireEmail(sendBookingStatusEmail, app.owner.email, {
        bookingType: "rental application",
        status: "cancelled",
        propertyTitle: app.property?.title || "the property",
        reason: `Withdrawn by ${req.user.name || "applicant"}`,
        seekerName: app.owner.name,
      });
    }

    res.json(app);
  } catch (err) {
    console.error("withdrawApplication:", err);
    res.status(500).json({ message: "Failed to withdraw application" });
  }
};
