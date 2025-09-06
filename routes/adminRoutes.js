const express = require('express');
const { getAllPendingProperties, approveProperty, getAllProperties, getDashboardStats, rejectProperty, getOwnerVerification, getOwnersList, approveOwnerVerification, rejectOwnerVerification, deleteProperty, getUsers, getUserById, updateUser, deleteUser, featureProperty } = require('../controllers/adminController');
const { protect } = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const router = express.Router();

router.get('/pending-properties', protect, roleMiddleware('admin'), getAllPendingProperties);

router.put('/approve-property/:id', protect, roleMiddleware('admin'), approveProperty);

router.get('/all-properties', protect, roleMiddleware('admin'), getAllProperties);

router.get('/dashboard-stats', protect, roleMiddleware('admin'), getDashboardStats);

router.post('/reject-property/:id',protect, roleMiddleware('admin'),rejectProperty);

router.get('/owner/:ownerId', protect, roleMiddleware("admin"), getOwnerVerification);

router.get("/owners", protect, roleMiddleware("admin"), getOwnersList);

router.put('/owner/approve/:ownerId', protect, roleMiddleware('admin'), approveOwnerVerification);

router.put('/owner/reject/:ownerId', protect, roleMiddleware('admin'), rejectOwnerVerification);

router.delete("/delete-property/:id", protect, roleMiddleware("admin"), deleteProperty);

router.get("/users", protect, roleMiddleware("admin"), getUsers);

router.get("/users/:id", protect, roleMiddleware("admin"), getUserById);

router.put("/users/:id", protect, roleMiddleware("admin"), updateUser);

router.delete("/users/:id", protect, roleMiddleware("admin"), deleteUser);

router.put('/properties/:id/feature', protect, roleMiddleware('admin'), featureProperty);


module.exports = router;
