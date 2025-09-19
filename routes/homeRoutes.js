// routes/homeRoutes.js
const express = require('express');
const router = express.Router();
const { getHomeData, getPopularAreas, getSuggest, getHomeCounters } = require('../controllers/homeController');



router.get('/home', getHomeData);
// Popular areas for chips/cards
router.get('/home/areas/popular', getPopularAreas);
// Typeahead suggestions for hero search    
router.get('/home/search/suggest', getSuggest);
// Counters like verified properties, localities etc.
router.get('/home/counters', getHomeCounters);

module.exports = router;
