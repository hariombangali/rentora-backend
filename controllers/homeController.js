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

exports.getHomeData = async (req, res) => {
  try {
    const latestProperties = await Property.find({ approved: true, rejected: false })
      .sort({ createdAt: -1 })
      .limit(6)
      .populate('user', 'ownerKYC name');

    const testimonials = await Testimonial.find().limit(3);

    res.json({
      topAreas: TOP_AREAS,
      benefits: BENEFITS,
      howItWorks: HOW_IT_WORKS,
      latestProperties,
      testimonials,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching home page data" });
  }
};
