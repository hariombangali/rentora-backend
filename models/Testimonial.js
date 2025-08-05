// models/Testimonial.js
const mongoose = require('mongoose');

const testimonialSchema = new mongoose.Schema({
  name: String,
  area: String,
  feedback: String,
});

module.exports = mongoose.model('Testimonial', testimonialSchema);
