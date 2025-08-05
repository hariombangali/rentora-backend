// routes/homeRoutes.js
const express = require('express');
const router = express.Router();
const { getHomeData } = require('../controllers/homeController');

router.get('/home', getHomeData);

module.exports = router;
