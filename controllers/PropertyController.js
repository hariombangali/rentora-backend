const Property = require("../models/Property");
const User = require("../models/User");

exports.postProperty = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);

    if (!user) return res.status(404).json({ message: "User not found" });

    // Parse amenities as array directly (no need for split)
    const amenities = Array.isArray(req.body.amenities)
      ? req.body.amenities
      : [];

    // Flattened field parsing
    const location = {
      city: req.body["location.city"],
      locality: req.body["location.locality"],
      address: req.body["location.address"],
      pincode: req.body["location.pincode"],
    };

    const ownerKYC = {
      ownerName: req.body["ownerKYC.ownerName"],
      ownerEmail: req.body["ownerKYC.ownerEmail"],
      ownerPhone: req.body["ownerKYC.ownerPhone"],
      ownerIdType: req.body["ownerKYC.ownerIdType"],
      ownerIdNumber: req.body["ownerKYC.ownerIdNumber"],
      ownerIdFile: req.files?.kycDocument?.[0]?.filename || "", // optional chaining
    };

    const ownershipProof = {
      ownershipProofType: req.body["ownershipProof.ownershipProofType"],
      ownershipProofDocNumber: req.body["ownershipProof.ownershipProofDocNumber"],
      ownershipProofFile: req.files?.ownershipProof?.[0]?.filename || "",
    };

    user.ownerKYC = ownerKYC;
    user.ownershipProof = ownershipProof;
    user.ownerVerified = false;    // always reset to false on new property post (or only on first post)
    user.ownerRejected = false;
    user.ownerRejectionReason = "";
    await user.save();

    const propertyImages = req.files?.propertyImages?.map(file => file.filename) || [];

    // Create the property
    const property = new Property({
      user: userId,
      title: req.body.title,
      description: req.body.description,
      price: req.body.price,
      deposit: req.body.deposit,
      type: req.body.type,
      furnishing: req.body.furnishing,
      tenants: req.body.tenants,
      availableFrom: req.body.availableFrom,
      amenities,
      location,
      images: propertyImages,
      rejected: false,
      rejectionReason: "",
      approved: false,
    });

    // Save the property
    const createdProperty = await property.save();

    // If it's user's first property, upgrade role
    if (user.role !== "owner") {
      user.role = "owner";
      await user.save();
    }

    res.status(201).json(createdProperty);
  } catch (error) {
    console.error("Post property error:", error);
    res.status(500).json({
      message: "Something went wrong",
      error: error.message,
    });
  }
};

exports.getAllProperties = async (req, res) => {
  try {
    // Always return only approved properties for normal users
    const properties = await Property.find({ approved: true });
    res.json(properties);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch properties", error: error.message });
  }
};

exports.getPropertyById = async (req, res) => {
  const { id } = req.params;

  try {
    // MongoDB _id field ke saath find karna
    const property = await Property.findOne({ _id: id, approved: true });

    if (!property) {
      return res.status(404).json({ message: "Property not found or not approved" });
    }

    res.json(property);
  } catch (error) {
    console.error("Error fetching property by id:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getMyProperties = async (req, res) => {
  try {
    const userId = req.user._id;

    // Sare properties fetch karo, saare statuses ke saath
    const properties = await Property.find({ user: userId }).sort({ createdAt: -1 });

    // Ye mapping optional hai. Agar aap simple JSON bhejte ho toh frontend handle kar sakta hai.
    // Lekin agar kuch field rename karna ya extra status banana ho toh aise bhi kar sakte ho:

    // const propertiesWithStatus = properties.map((p) => ({
    //   ...p.toObject(),
    //   status: p.approved ? "Approved" : p.rejected ? "Rejected" : "Pending",
    // }));

    res.json(properties);
  } catch (error) {
    console.error("Error fetching my properties:", error);
    res.status(500).json({ message: "Failed to fetch your properties" });
  }
};
