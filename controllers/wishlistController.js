// controllers/wishlistController.js
const User = require("../models/User");
const Property = require("../models/Property");

// Add property to wishlist
exports.addToWishlist = async (req, res) => {
  try {
    const userId = req.user.id; // from auth middleware
    const propertyId = req.params.id;

    // Check if property exists
    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ message: "Property not found" });

    // Add if not already saved
    const user = await User.findById(userId);
    if (!user.wishlist.includes(propertyId)) {
      user.wishlist.push(propertyId);
      await user.save();
    }

    res.json({ message: "Property saved", wishlist: user.wishlist });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Remove property from wishlist
exports.removeFromWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const propertyId = req.params.id;

    const user = await User.findById(userId);
    user.wishlist = user.wishlist.filter(
      (id) => id.toString() !== propertyId
    );
    await user.save();

    res.json({ message: "Property removed", wishlist: user.wishlist });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get user's wishlist
exports.getWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).populate("wishlist");

    res.json(user.wishlist);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
