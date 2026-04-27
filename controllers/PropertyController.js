const Property = require("../models/Property");
const User = require("../models/User");
const axios = require("axios");
const { escapeRegex } = require('../utils/escapeRegex');


// --- Geocoding function using OpenCage ---
const geocodeWithOpenCage = async (address) => {
  try {
    const response = await axios.get("https://api.opencagedata.com/geocode/v1/json", {
      params: {
        q: address,
        key: process.env.OPENCAGE_API_KEY,
        limit: 1,
        countrycode: "in",
      },
    });

    if (response.data.results && response.data.results.length > 0) {
      const { lng, lat } = response.data.results[0].geometry;
      return [lng, lat]; // [longitude, latitude]
    }
    return null;
  } catch (error) {
    console.error(`OpenCage geocoding failed for "${address}":`, error.message);
    return null;
  }
};

exports.postProperty = async (req, res) => {
  try {

    const userId = req.user._id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { address, city, pincode, locality } = req.body;
    const fullAddress = `${address}, ${locality}, ${city}, ${pincode}, India`;
    const coordinates = await geocodeWithOpenCage(fullAddress);

    const ownerIdFile = req.files?.ownerIdFile?.[0]?.path || null;
    const ownershipProofFile = req.files?.ownershipProofFile?.[0]?.path || null;


    const newPropertyData = {
      user: userId,
      title: req.body.title,
      description: req.body.description,
      availableFor: req.body.availableFor,
      preferredTenants: req.body.preferredTenants,
      availableFrom: req.body.availableFrom,
      occupancyType: req.body.occupancyType,
      sharingCount: req.body.sharingCount,
      bedrooms: req.body.bedrooms,
      attachedBathroom: req.body.attachedBathroom,
      attachedBalcony: req.body.attachedBalcony,
      furnishing: req.body.furnishing,
      ageOfProperty: req.body.ageOfProperty,
      totalFloors: req.body.totalFloors,
      propertyOnFloor: req.body.propertyOnFloor,
      price: req.body.price,
      deposit: req.body.deposit,
      maintenance: req.body.maintenance,
      maintenanceFreq: req.body.maintenanceFreq,
      earlyLeavingCharges: req.body.earlyLeavingCharges,
      minContractDuration: req.body.minContractDuration,
      noticePeriod: req.body.noticePeriod,
      commonAreaFacilities: req.body.commonAreaFacilities,
      pgAmenities: req.body.pgAmenities,
      images: req.files?.images?.map((file) => file.path) || [],
      location: { city, locality, address, pincode },
    };

    if (coordinates) {
      newPropertyData.location.point = { type: "Point", coordinates };
    }

    const newProperty = new Property(newPropertyData);
    const savedProperty = await newProperty.save();

    if (user.role !== "owner") user.role = "owner";
    user.ownerKYC = {
      ownerName: req.body.ownerName,
      ownerEmail: req.body.ownerEmail,
      ownerPhone: req.body.ownerPhone,
      ownerIdType: req.body.ownerIdType,
      ownerIdNumber: req.body.ownerIdNumber,
      ownerIdFile,
      ownershipProofType: req.body.ownershipProofType,
      ownershipProofDocNumber: req.body.ownershipProofDocNumber,
      ownershipProofFile,
    };
    await user.save();

    res.status(201).json(savedProperty);
  } catch (error) {
    console.error("Error in postProperty:", error);
    res.status(500).json({ message: "An error occurred while posting the property.", error: error.message });
  }
};

exports.getAllProperties = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const query = { approved: true, active: { $ne: false } };
    const [properties, total] = await Promise.all([
      Property.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Property.countDocuments(query),
    ]);
    res.json({ properties, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch properties", error: error.message });
  }
};

exports.getPropertyById = async (req, res) => {
  try {
    const property = await Property.findOneAndUpdate(
      { _id: req.params.id, approved: true },
      { $inc: { views: 1 } },
      { new: true }
    ).populate(
      "user",
      "ownerKYC.ownerName ownerKYC.ownerEmail ownerKYC.ownerPhone name createdAt ownerVerified"
    );

    if (!property) return res.status(404).json({ message: "Property not found or not approved" });

    res.json(property);
  } catch (error) {
    console.error("Error fetching property by id:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/properties/:id/similar
exports.getSimilarProperties = async (req, res) => {
  try {
    const base = await Property.findOne({ _id: req.params.id, approved: true })
      .select("price bedrooms location")
      .lean();
    if (!base) return res.status(404).json({ message: "Property not found" });

    const locality = base.location?.locality;
    const basePrice = Number(base.price) || 0;
    const minP = Math.floor(basePrice * 0.6);
    const maxP = Math.ceil(basePrice * 1.5);

    const common = {
      _id: { $ne: base._id },
      approved: true,
      rejected: false,
      active: { $ne: false },
    };

    // 1) Same locality
    let list = locality
      ? await Property.find({ ...common, "location.locality": locality })
          .sort({ featured: -1, createdAt: -1 })
          .limit(6)
          .lean()
      : [];

    // 2) Fallback: similar price band + same bedrooms
    if (list.length < 4) {
      const ids = list.map((p) => p._id);
      const extra = await Property.find({
        ...common,
        _id: { $nin: [base._id, ...ids] },
        price: { $gte: minP, $lte: maxP },
        ...(base.bedrooms ? { bedrooms: base.bedrooms } : {}),
      })
        .sort({ featured: -1, createdAt: -1 })
        .limit(6 - list.length)
        .lean();
      list = [...list, ...extra];
    }

    // 3) Final fallback: newest approved
    if (list.length < 4) {
      const ids = list.map((p) => p._id);
      const extra = await Property.find({
        ...common,
        _id: { $nin: [base._id, ...ids] },
      })
        .sort({ createdAt: -1 })
        .limit(6 - list.length)
        .lean();
      list = [...list, ...extra];
    }

    res.set("Cache-Control", "public, max-age=300");
    res.json(list.slice(0, 6));
  } catch (err) {
    console.error("getSimilarProperties:", err);
    res.status(500).json({ message: "Failed to fetch similar properties" });
  }
};

exports.getMyProperties = async (req, res) => {
  try {
    const userId = req.user._id;
    const properties = await Property.find({ user: userId }).sort({ createdAt: -1 });

    const result = properties.map((p) => ({
      _id: p._id,
      title: p.title,
      price: p.price,
      createdAt: p.createdAt,
      images: p.images,
      approved: p.approved,
      rejected: p.rejected,
      rejectionReason: p.rejectionReason,
      active: p.active,
      status: p.approved ? "Approved" : p.rejected ? "Rejected" : "Pending",
    }));

    res.json(result);
  } catch (error) {
    console.error("Error fetching my properties:", error);
    res.status(500).json({ message: "Failed to fetch your properties" });
  }
};

exports.getMapLocations = async (req, res) => {
  try {
    const properties = await Property.find({ approved: true, "location.point": { $exists: true } }).select(
      "_id title price location.point.coordinates location.locality location.city images"
    );

    res.json(
      properties.map((p) => ({
        _id: p._id,
        title: p.title,
        price: p.price,
        images: p.images,
        location: {
          coordinates: p.location.point.coordinates,
          locality: p.location.locality,
          city: p.location.city,
        },
      }))
    );
  } catch (error) {
    console.error("Error fetching map locations:", error);
    res.status(500).json({ message: "Failed to fetch map locations" });
  }
};

exports.getFeaturedProperties = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "10", 10), 30);
    const base = { approved: true, rejected: false };

    let properties = await Property.find({ ...base, featured: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("title price images location.point.coordinates")
      .lean();

    if (!properties.length) {
      properties = await Property.find({
        ...base,
        images: { $exists: true, $ne: [] },
        "location.point.coordinates": { $exists: true, $ne: [] },
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select("title price images location.point.coordinates")
        .lean();
    }

    res.set('Cache-Control', 'public, max-age=300');
    res.json(properties);
  } catch (err) {
    next(err);
  }
};

exports.getLatestProperties = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "6", 10), 50);
    const properties = await Property.find({ approved: true, rejected: false })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("title price images location.point coordinates")
      .lean();
    res.set('Cache-Control', 'public, max-age=300');
    res.json(properties);
  } catch (err) {
    next(err);
  }
};

exports.updateProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: "Property not found" });

    if (property.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to edit this property" });
    }

    const body = req.body || {};

    // Helper: repeated key -> array
    const toArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

    // Arrays (support both plain and bracketed)
    const pgAmenities = toArray(body.pgAmenities ?? body["pgAmenities[]"]);
    const commonAreaFacilities = toArray(body.commonAreaFacilities ?? body["commonAreaFacilities[]"]);
    const retained = toArray(body.retainedImages ?? body["retainedImages[]"]);

    // Coercions
    const num = (v) => (v === "" || v == null ? undefined : Number(v));
    const dateOrUndef = (v) => (v ? new Date(v) : undefined);

    // Map primitives
    property.title = body.title ?? property.title;
    property.description = body.description ?? property.description;
    property.availableFor = body.availableFor ?? property.availableFor;
    property.preferredTenants = body.preferredTenants ?? property.preferredTenants;
    property.occupancyType = body.occupancyType ?? property.occupancyType;
    property.sharingCount = body.sharingCount ?? property.sharingCount;
    property.bedrooms = num(body.bedrooms) ?? property.bedrooms;
    property.attachedBathroom = body.attachedBathroom ?? property.attachedBathroom;
    property.attachedBalcony = body.attachedBalcony ?? property.attachedBalcony;
    property.furnishing = body.roomFurnishing ?? body.furnishing ?? property.furnishing; // frontend sends furnishing too
    property.ageOfProperty = body.ageOfProperty ?? property.ageOfProperty;
    property.totalFloors = num(body.totalFloors) ?? property.totalFloors;
    property.propertyOnFloor = num(body.propertyOnFloor) ?? property.propertyOnFloor;

    property.price = num(body.price) ?? property.price;
    property.deposit = num(body.deposit) ?? property.deposit;
    property.maintenance = num(body.maintenance) ?? property.maintenance;
    property.maintenanceFreq = body.maintenanceFreq ?? property.maintenanceFreq;
    property.earlyLeavingCharges = num(body.earlyLeavingCharges) ?? property.earlyLeavingCharges;
    property.minContractDuration = body.minContractDuration ?? property.minContractDuration;
    property.noticePeriod = body.noticePeriod ?? property.noticePeriod;

    const availableFrom = dateOrUndef(body.availableFrom);
    if (availableFrom) property.availableFrom = availableFrom;

    // Merge location per-path (preserve required locality)
    property.set('location.address', body.address ?? property.location?.address);
    property.set('location.city', body.city ?? property.location?.city);
    property.set('location.locality', body.locality ?? property.location?.locality);
    property.set('location.pincode', body.pincode ?? property.location?.pincode);

    // Arrays (only replace if provided)
    if (pgAmenities.length) property.pgAmenities = pgAmenities;
    if (commonAreaFacilities.length) property.commonAreaFacilities = commonAreaFacilities;

    // Images: retained + new uploads
    let newUploads = [];
    if (Array.isArray(req.files)) newUploads = req.files.map((f) => f.path);
    else if (req.files?.images) newUploads = req.files.images.map((f) => f.path);


    if (retained.length || newUploads.length) {
      property.images = [...retained, ...newUploads];
    }

    // Reset moderation flags on edit
    property.approved = false;
    property.rejected = false;
    property.rejectionReason = "";

    const saved = await property.save();
    res.json(saved);
  } catch (error) {
    console.error("Error updating property:", error);
    res.status(500).json({ message: "Failed to update property", error: error.message });
  }
};

exports.softDeleteProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: "Property not found" });

    if (property.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to delete this property" });
    }

    property.active = false;
    await property.save();

    res.json({ message: "Property deactivated (soft deleted)" });
  } catch (error) {
    console.error("Error deleting property:", error);
    res.status(500).json({ message: "Failed to delete property", error: error.message });
  }
};

exports.toggleActive = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: "Property not found" });

    if (property.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to update this property" });
    }

    const { active } = req.body;
    property.active = typeof active === "boolean" ? active : !property.active;

    await property.save();
    res.json({ _id: property._id, active: property.active });
  } catch (error) {
    console.error("Error toggling active:", error);
    res.status(500).json({ message: "Failed to update property status", error: error.message });
  }
};

exports.searchProperties = async (req, res) => {
  try {
    const raw = (req.query.search || req.query.query || "").trim().slice(0, 200);
    const tokens = raw.match(/"([^"]+)"|(\S+)/g)?.map(t => t.replace(/^"|"$/g, "")) || [];
    if (!tokens.length) return res.json([]);

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);

    const fields = ["title", "location.city", "city", "location.locality", "locality", "location.address", "address"];
    const andClauses = tokens.map(tok => {
      const rx = new RegExp(`\\b${escapeRegex(tok)}`, "i");
      return { $or: fields.map(f => ({ [f]: { $regex: rx } })) };
    });

    const query = { approved: true, active: { $ne: false }, $and: andClauses };
    const [properties, total] = await Promise.all([
      Property.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Property.countDocuments(query),
    ]);
    return res.json({ properties, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Error searching properties:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// FILTERED LIST (Hero + sidebar) — GET /api/properties?area=&occupancyType=&minRent=&maxRent=&approved=
exports.getFilteredProperties = async (req, res) => {
  try {
    const { area, occupancyType, minRent, maxRent, approved } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);

    const and = [];

    and.push(typeof approved !== "undefined" ? { approved: approved === "true" } : { approved: true });
    and.push({ active: { $ne: false } });

    if (area && area.trim()) {
      const rx = new RegExp(escapeRegex(area.trim()), "i");
      and.push({
        $or: [
          { "location.city": { $regex: rx } },
          { "location.locality": { $regex: rx } },
        ],
      });
    }

    if (occupancyType) and.push({ occupancyType });

    if (minRent || maxRent) {
      const price = {};
      if (minRent) price.$gte = Number(minRent);
      if (maxRent) price.$lte = Number(maxRent);
      and.push({ price });
    }

    const query = { $and: and };
    const [properties, total] = await Promise.all([
      Property.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Property.countDocuments(query),
    ]);
    return res.json({ properties, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Error fetching filtered properties:", error);
    res.status(500).json({ message: "Server error" });
  }
};
