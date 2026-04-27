const express = require("express");
const {
  postProperty,
  getAllProperties,
  getPropertyById,
  getMyProperties,
  getMapLocations,
  getFeaturedProperties,
  getLatestProperties,
  updateProperty,
  softDeleteProperty,
  toggleActive,
  searchProperties,
  getFilteredProperties,
  getSimilarProperties,
} = require("../controllers/propertyController");

const { protect } = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const upload = require("../middlewares/upload"); // 👈 Cloudinary Multer

const router = express.Router();

// Upload fields config (Cloudinary)
const propertyUpload = upload.fields([
  { name: "images", maxCount: 8 },
  { name: "ownerIdFile", maxCount: 1 },
  { name: "ownershipProofFile", maxCount: 1 },
]);

// Routes
router.post(
  "/",
  protect,
  roleMiddleware("user", "owner"),
  propertyUpload,
  postProperty
);

// Named GET routes — must appear before /:id to avoid shadowing
router.get("/map-locations", getMapLocations);
router.get("/featured", getFeaturedProperties);
router.get("/latest", getLatestProperties);
router.get("/search", searchProperties);
router.get(
  "/my-properties",
  protect,
  roleMiddleware("owner"),
  getMyProperties
);
// GET / handles both "all" and filtered (via query params)
router.get("/", getFilteredProperties);
router.get("/:id/similar", getSimilarProperties);
router.get("/:id", getPropertyById);

router.put(
  "/:id",
  protect,
  roleMiddleware("owner"),
  upload.fields([{ name: "images", maxCount: 8 }]),
  updateProperty
);
router.delete("/:id", protect, roleMiddleware("owner"), softDeleteProperty);
router.put("/:id/toggle", protect, roleMiddleware("owner"), toggleActive);


module.exports = router;
