// routes/wishlistRoutes.js
const express = require("express");
const { addToWishlist, removeFromWishlist, getWishlist } = require("../controllers/wishlistController");
const { protect } = require("../middlewares/authMiddleware");

const router = express.Router();

router.post("/:id", protect, addToWishlist);    // Save
router.delete("/:id", protect, removeFromWishlist); // Remove
router.get("/", protect, getWishlist); // Get all saved properties

module.exports = router;
