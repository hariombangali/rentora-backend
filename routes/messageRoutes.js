const express = require("express");
const router = express.Router();
const { sendMessage } = require("../controllers/messageController");
const { getConversations, getMessagesByUser, getConversationsCount } = require("../controllers/messageController");
const { protect } = require("../middlewares/authMiddleware");

// Send message
router.post("/", protect, sendMessage);

// Get all conversations (inbox)
router.get("/conversations", protect, getConversations);

// Get messages with a specific user
router.get("/:partnerId", protect, getMessagesByUser);

router.get("/conversations/count", protect, getConversationsCount);

module.exports = router;
