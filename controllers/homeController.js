// controllers/homeController.js
const Property = require('../models/Property');
const Testimonial = require('../models/Testimonial');
const { escapeRegex } = require('../utils/escapeRegex');

const TOP_AREAS = [
  { name: "Palasia", icon: "🏙️" }, 
  { name: "Vijay Nagar", icon: "🌇" },
  { name: "Sudama Nagar", icon: "🏢" },
  { name: "Bhawarkua", icon: "🏘️" },
  { name: "Geeta Bhavan", icon: "🏛️" }
];

const BENEFITS = [
  { icon: "🤝", title: "Trusted Connections", desc: "Directly connect with verified owners." },
  { icon: "🔎", title: "Smart Search", desc: "Filter by rent, area, type to find your home fast." },
  { icon: "💰", title: "Commission-Free", desc: "No hidden fees or agent commissions." },
  { icon: "📞", title: "Local Support", desc: "Indore based support team ready to help." },
];

const HOW_IT_WORKS = [
  "Search & Filter listings easily",
  "View detailed property info & images",
  "Contact owner/landlord directly",
  "Move in with peace of mind",
];

exports.getHomeData = async (req, res, next) => {
  try {
    const [latestProperties, testimonials] = await Promise.all([
      Property.find({ approved: true, rejected: false })
        .sort({ createdAt: -1 })
        .limit(6)
        .select('title price images location point location point createdAt') // keep light
        .populate('user', 'name ownerKYC')
        .lean(),
      Testimonial.find().sort({ createdAt: -1 }).limit(3).lean(),
    ]);

    res.json({
      topAreas: TOP_AREAS,
      benefits: BENEFITS,
      howItWorks: HOW_IT_WORKS,
      latestProperties,
      testimonials,
    });
  } catch (err) {
    next(err);
  }
};


// GET /api/home/areas/popular?limit=10
exports.getPopularAreas = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);

    const agg = await Property.aggregate([
      { $match: { approved: true, rejected: false, 'location.locality': { $exists: true, $ne: '' } } },
      { $group: { _id: '$location.locality', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
      { $project: { name: '$_id', count: 1, _id: 0 } },
    ]);

    res.json({ areas: agg });
  } catch (err) {
    next(err);
  }
};

// GET /api/home/search/suggest?q=vi&limit=7
exports.getSuggest = async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();
    const limit = Math.min(parseInt(req.query.limit || "7", 10), 20);
    if (!q) return res.json([]); // return plain array

    // Word-boundary prefix match (case-insensitive)
    const rx = new RegExp(`\\b${escapeRegex(q)}`, "i"); // [3][4]

    // Match both flat and nested paths to be schema-agnostic
    const match = {
      approved: true,
      $or: [
        { city: { $regex: rx } },
        { locality: { $regex: rx } },
        { "location.city": { $regex: rx } },
        { "location.locality": { $regex: rx } },
        { title: { $regex: rx } },
      ],
    };

    const pipeline = [
      { $match: match },
      {
        $project: {
          list: [
            { label: "$city", type: "city" },
            { label: "$locality", type: "locality" },
            { label: "$location.city", type: "city" },
            { label: "$location.locality", type: "locality" },
            { label: "$title", type: "title" },
          ],
        },
      },
      { $unwind: "$list" },
      // keep only strings that match the regex
      {
        $match: {
          "list.label": { $type: "string", $regex: rx },
        },
      },
      { $group: { _id: { label: "$list.label", type: "$list.type" } } },
      { $project: { _id: 0, label: "$_id.label", type: "$_id.type" } },
      { $limit: limit },
    ];

    const out = await Property.aggregate(pipeline);
    return res.json(out);
  } catch (err) {
    next(err);
  }
};

// GET /api/home/counters
exports.getHomeCounters = async (req, res, next) => {
  try {
    const [verifiedProperties, localities] = await Promise.all([
      Property.countDocuments({ approved: true, rejected: false }),
      Property.distinct('location.locality', { approved: true }),
    ]);

    // tenants counter is a business metric; mock or compute from bookings if you add that
    res.json({
      tenants: 5000, // placeholder/business metric
      verifiedProperties,
      localities: localities.filter(Boolean).length,
    });
  } catch (err) {
    next(err);
  }
};
