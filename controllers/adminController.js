const Property = require('../models/Property');
const User = require('../models/User');

exports.getAllPendingProperties = async (req, res) => {
  try {
    const pending = await Property.find({ approved: false, rejected: { $ne: true } }).populate({
      path: 'user',
      match: { ownerVerified: true },  // only verified owners
      select: 'ownerKYC ownerVerified', // jo fields chahiye wo lelo
    });

    // Properties jinka user populate nahi hua (ownerVerified false) unhe filter karo
    const filteredPending = pending.filter(p => p.user != null);

    res.json(filteredPending);
  } catch (err) {
    res.status(500).json({ message: "Error fetching pending properties" });
  }
};

exports.approveProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: "Property not found" });

    property.approved = true;
    await property.save();

    res.json({ message: "Property approved", property });
  } catch (err) {
    res.status(500).json({ message: "Error approving property" });
  }
};

exports.getAllProperties = async (req, res) => {
  try {
    const properties = await Property.find({})
      .populate('user', 'name email ownerKYC ownershipProof ownerVerified ownerRejected ownerRole'); // Select fields needed
    res.json(properties);
  } catch (err) {
    res.status(500).json({ message: "Error fetching properties", error: err.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    // Count all types
    const totalProperties = await Property.countDocuments();
    const pendingProps = await Property.countDocuments({ approved: false });
    const owners = await User.countDocuments({ role: "owner" });
    const users = await User.countDocuments({ role: "user" });

    res.json({ totalProperties, pendingProps, owners, users });
  } catch (err) {
    res.status(500).json({ message: "Error fetching dashboard stats" });
  }
};

exports.rejectProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: "Property not found" });

    property.rejected = true;
    property.rejectionReason = req.body.reason || "";
    // Optionally, record admin and/or timestamp:
    // property.rejectedAt = new Date();
    await property.save();

    res.json({ message: "Property rejected successfully", property });
  } catch (err) {
    console.error("Error rejecting property:", err);
    res.status(500).json({ message: "Error rejecting property" });
  }
};

exports.getOwnerVerification = async (req, res) => {
  try {
    const owner = await User.findById(req.params.ownerId).select('ownerKYC ownershipProof role');

    if (!owner || owner.role !== "owner") {
      return res.status(404).json({ message: "Owner not found" });
    }

    res.json(owner);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch owner verification data" });
  }
};

exports.getOwnersList = async (req, res) => {
  try {
    // Optionally check req.query.status = 'pending' | 'verified' | 'rejected'
    // For now, returning all owners
    const owners = await User.find({ role: "owner" }).select("name ownerVerified ownerRejected ownerRejectionReason ownerKYC.email");
    res.json(owners);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch owners list" });
  }
};

exports.approveOwnerVerification = async (req, res) => {
  try {
    const owner = await User.findById(req.params.ownerId);
    if (!owner) return res.status(404).json({ message: "Owner not found" });

    owner.ownerVerified = true;
    owner.ownerRejected = false;
    owner.ownerRejectionReason = "";
    await owner.save();

    res.json({ message: "Owner verification approved" });
  } catch (err) {
    res.status(500).json({ message: "Error approving owner verification" });
  }
};

exports.rejectOwnerVerification = async (req, res) => {
  try {
    const owner = await User.findById(req.params.ownerId);
    if (!owner) return res.status(404).json({ message: "Owner not found" });

    owner.ownerVerified = false;
    owner.ownerRejected = true;
    owner.ownerRejectionReason = req.body.reason || "";
    await owner.save();

    res.json({ message: "Owner verification rejected", ownerRejectionReason: owner.ownerRejectionReason });
  } catch (err) {
    res.status(500).json({ message: "Error rejecting owner verification" });
  }
};

exports.deleteProperty = async (req, res) => {
  try {
    const propertyId = req.params.id;
    const userId = req.user._id; // assume authentication middleware sets req.user

    // Find property by id
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    // Optional: Check if requester has right to delete
    // For admin you may skip user check; for owner check:
    if (property.user.toString() !== userId.toString() && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized to delete this property" });
    }

    // Delete property from database
    await Property.findByIdAndDelete(propertyId);

    // Optionally, delete uploaded images and documents from server storage (if needed)
    // Implement your file cleanup logic here if required

    res.json({ message: "Property deleted successfully" });
  } catch (error) {
    console.error("Delete property error:", error);
    res.status(500).json({ message: "Server error while deleting property" });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", role = "" } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    if (role) {
      filter.role = role;
    }

    // Only non-deleted users
    filter.deleted = { $ne: true };

    const users = await User.find(filter)
      .select("name email role active createdAt")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(filter);

    res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password -__v");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch user details" });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { role, active } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (role) user.role = role;
    if (typeof active === "boolean") user.active = active;

    await user.save();
    res.json({ message: "User updated successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Failed to update user" });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    user.deleted = true;
    await user.save();
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete user" });
  }
};
// PUT /admin/properties/:id/feature
exports.featureProperty = async (req, res) => {
  try {
    const { featured } = req.body; // boolean
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: 'Property not found' });

    // Only approved properties should be featured
    if (!property.approved || property.rejected) {
      return res.status(400).json({ message: 'Only approved properties can be featured' });
    }

    property.featured = !!featured;
    await property.save();
    res.json({ message: `Property ${featured ? 'featured' : 'unfeatured'} successfully`, property });
  } catch (err) {
    console.error('Feature toggle error:', err);
    res.status(500).json({ message: 'Error updating featured status' });
  }
};
