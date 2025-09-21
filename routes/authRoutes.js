const express = require('express');
const { registerUser,
    loginUser,
    checkUserExists,
    upgradeUserRole,
    sendOtp,
    verifyOtp,
    setPassword, } = require('../controllers/authController');
const { protect } = require("../middlewares/authMiddleware");


const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/check-user', checkUserExists); // NEW route
router.put("/upgrade-role", protect, upgradeUserRole);
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/set-password", setPassword);

module.exports = router;
