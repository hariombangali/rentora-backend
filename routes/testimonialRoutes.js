// routes/testimonialRoutes.js
const express = require('express');
const Testimonial = require('../models/Testimonial');

const router = express.Router();

// GET /api/testimonials?limit=6&page=1
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '6', 10), 50);
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Testimonial.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Testimonial.countDocuments(),
    ]);
    res.json({ data: items, meta: { page, totalPages: Math.ceil(total / limit), total } });
  } catch (err) {
    next(err);
  }
});

module.exports = router; 
