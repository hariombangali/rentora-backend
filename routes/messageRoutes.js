// routes/messages.js
const express = require("express");
const router = express.Router();
const {
  sendMessage,
  getConversations,
  getMessagesByUser,
  getConversationsCount,
} = require("../controllers/messageController");
const { protect } = require("../middlewares/authMiddleware"); // ensure folder is 'middleware'

router.post("/", protect, sendMessage);

// Specific conversations listing or single (supports ?partnerId=&propertyId=)
router.get("/conversations", protect, getConversations);

// Keep count BEFORE param route to avoid shadowing
router.get("/conversations/count", protect, getConversationsCount);

// Property-scoped history: /messages/:partnerId?propertyId=...
router.get("/:partnerId", protect, getMessagesByUser);

module.exports = router;
