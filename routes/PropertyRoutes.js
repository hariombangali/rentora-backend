const express = require('express');
const multer = require('multer');
const { postProperty, getAllProperties, getPropertyById, getMyProperties, getMapLocations, getFeaturedProperties, getLatestProperties } = require('../controllers/PropertyController');
const { protect } = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');


const router = express.Router();

// Multer Setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Make sure this folder exists
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({ storage });

// Upload fields config
const propertyUpload = upload.fields([
  { name: 'images', maxCount: 8 },
  { name: 'ownerIdFile', maxCount: 1 },
  { name: 'ownershipProofFile', maxCount: 1 },
]);
 
// Route
router.post('/',protect,roleMiddleware('user', 'owner'),propertyUpload,postProperty);
router.get('/map-locations', getMapLocations);
router.get('/', getAllProperties);
router.get('/my-properties', protect, roleMiddleware('owner'), getMyProperties);
router.get('/featured', getFeaturedProperties);
router.get('/latest', getLatestProperties);
router.get("/:id", getPropertyById); 



module.exports = router;
