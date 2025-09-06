// controllers/homeController.js
const Property = require('../models/Property');
const Testimonial = require('../models/Testimonial');

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
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit || '7', 10), 20);
    if (q.length < 2) return res.json({ suggestions: [] });

    // Distinct locality and city suggestions using regex i
    const [localities, cities] = await Promise.all([
      Property.distinct('location.locality', { 'location.locality': { $regex: q, $options: 'i' }, approved: true }),
      Property.distinct('location.city', { 'location.city': { $regex: q, $options: 'i' }, approved: true }),
    ]);

    const suggestions = [
      ...localities.map((l) => ({ label: l, type: 'locality' })),
      ...cities.map((c) => ({ label: c, type: 'city' })),
    ]
      .filter((s) => s.label)
      .slice(0, limit);

    res.json({ suggestions });
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
