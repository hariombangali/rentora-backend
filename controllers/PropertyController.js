const Property = require("../models/Property");
const User = require("../models/User");
const axios = require('axios');



// --- NEW: Geocoding function using OpenCage ---
const geocodeWithOpenCage = async (address) => {
  try {
    const response = await axios.get('https://api.opencagedata.com/geocode/v1/json', {
      params: {
        q: address,
        key: process.env.OPENCAGE_API_KEY, // Use the API key from your .env file
        limit: 1,
        countrycode: 'in' // Prioritize results in India
      }
    });

    if (response.data.results && response.data.results.length > 0) {
      const { lng, lat } = response.data.results[0].geometry;
      // Return in [longitude, latitude] format
      return [lng, lat];
    }
    return null;
  } catch (error) {
    console.error(`OpenCage geocoding failed for address "${address}":`, error.message);
    return null;
  }
};

exports.postProperty = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // --- Geocoding with Nominatim ---
    const { address, city, pincode, locality } = req.body;
    const fullAddress = `${address}, ${locality}, ${city}, ${pincode},  India`;
    const coordinates = await geocodeWithOpenCage(fullAddress);

    // --- File Handling ---
    // const imageFiles = req.files?.images?.map(file => file.filename) || [];
    const ownerIdFile = req.files?.ownerIdFile?.[0]?.filename || null;
    const ownershipProofFile = req.files?.ownershipProofFile?.[0]?.filename || null;

    // --- Prepare Property Data ---
  // --- THIS IS THE FIX: Construct the data object carefully ---
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
      images: req.files?.images?.map(file => file.filename) || [],
      // Create the nested location object correctly
      location: {
        city,
        locality,
        address,
        pincode,
      }
    };

    // Only add the location field if geocoding was successful
    if (coordinates) {
      newPropertyData.location.point = {
        type: 'Point',
        coordinates: coordinates,
      };
    } else {
      console.warn(`Property is being saved without coordinates for address: ${fullAddress}`);
    }

    const newProperty = new Property(newPropertyData);
    const savedProperty = await newProperty.save();

    // --- Update User Role and KYC ---
    if (user.role !== 'owner') {
      user.role = 'owner';
    }
    
    user.ownerKYC = {
      ownerName: req.body.ownerName,
      ownerEmail: req.body.ownerEmail,
      ownerPhone: req.body.ownerPhone,
      ownerIdType: req.body.ownerIdType,
      ownerIdNumber: req.body.ownerIdNumber,
      ownerIdFile: ownerIdFile,
      ownershipProofType: req.body.ownershipProofType,
      ownershipProofDocNumber: req.body.ownershipProofDocNumber,
      ownershipProofFile: ownershipProofFile,
    };
    
    await user.save();

    res.status(201).json(savedProperty);

  } catch (error) {
    console.error("Error in postProperty controller:", error);
    res.status(500).json({
      message: "An error occurred while posting the property.",
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
    const property = await Property.findOne({ _id: id, approved: true }).populate("user", "ownerKYC.ownerName ownerKYC.ownerEmail ownerKYC.ownerPhone");

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

exports.getMapLocations = async (req, res) => {
    try {
        const properties = await Property.find({ 
            approved: true, 
            'location.point': { $exists: true } // Check for the nested 'point' object
        }).select('_id title price location.point.coordinates images'); // Select the nested coordinates

        // Remap the data for the frontend to keep the same structure
        const remappedProperties = properties.map(p => ({
            _id: p._id,
            title: p.title,
            price: p.price,
            images: p.images,
            location: {
                coordinates: p.location.point.coordinates
            }
        }));

        res.json(remappedProperties);
    } catch (error) {
        console.error("Error fetching map locations:", error);
        res.status(500).json({ message: "Failed to fetch map locations" });
    }
};

exports.getFeaturedProperties = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 30);
    const base = { approved: true, rejected: false };

    let properties = await Property.find({ ...base, featured: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('title price images location.point.coordinates')
      .lean();

    if (!properties.length) {
      properties = await Property.find({
        ...base,
        images: { $exists: true, $ne: [] },
        'location.point.coordinates': { $exists: true, $ne: [] },
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('title price images location.point.coordinates')
      .lean();
    }

    res.json(properties);
  } catch (err) { next(err); }
};

exports.getLatestProperties = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '6', 10), 50);
    const properties = await Property.find({ approved: true, rejected: false })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('title price images location.point coordinates')
      .lean();
    res.json(properties);
  } catch (err) {
    next(err);
  }
};