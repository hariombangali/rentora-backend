// controllers/messageController.js
const Message = require("../models/Message");
const User = require("../models/User");
const Property = require("../models/Property");

// Send message (unchanged with tiny hardening)
const sendMessage = async (req, res) => {
  try {
    const { propertyId, receiverId, content } = req.body;
    if (!receiverId || !content?.trim()) {
      return res.status(400).json({ message: "receiverId and content are required" });
    }
    const message = await Message.create({
      property: propertyId || null,
      sender: req.user._id,
      receiver: receiverId,
      content: content.trim(),
    });
    const populatedMessage = await message.populate([
      { path: "sender", select: "name email ownerKYC.ownerName" },
      { path: "receiver", select: "name email ownerKYC.ownerName" },
      { path: "property", select: "title" },
    ]);
    return res.status(201).json(populatedMessage);
  } catch (error) {
    console.error("Error sending message:", error);
    return res.status(500).json({ message: "Failed to send message", error: error.message });
  }
};

// Conversations list OR single conversation by query
const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    const { partnerId, propertyId } = req.query || {};

    // Single conversation fetch/create for deep-link
    if (partnerId && propertyId) {
      // Most recent message between both for this property
      const last = await Message.findOne({
        property: propertyId,
        $or: [
          { sender: userId, receiver: partnerId },
          { sender: partnerId, receiver: userId },
        ],
      })
        .populate("sender", "name email ownerKYC.ownerName")
        .populate("receiver", "name email ownerKYC.ownerName")
        .populate("property", "title")
        .sort({ createdAt: -1 });

      if (last) {
        const partner =
          last.sender._id.toString() === userId.toString() ? last.receiver : last.sender;
        return res.json({
          partner,
          property: last.property || null,
          lastMessage: last.content,
          lastTime: last.createdAt,
          updatedAt: last.createdAt,
          unreadCount: 0,
        });
      }

      // No messages yet: synthesize a conversation stub
      const partnerDoc = await User.findById(partnerId).select("name email ownerKYC.ownerName");
      const propertyDoc = await Property.findById(propertyId).select("title");
      if (!partnerDoc || !propertyDoc) {
        return res.status(404).json({ message: "Partner or property not found" });
      }
      return res.json({
        partner: partnerDoc,
        property: propertyDoc,
        lastMessage: "",
        lastTime: null,
        updatedAt: new Date(),
        unreadCount: 0,
      });
    }

    // Full list
    const messages = await Message.find({
      $or: [{ sender: userId }, { receiver: userId }],
    })
      .populate("sender", "name email ownerKYC.ownerName")
      .populate("receiver", "name email ownerKYC.ownerName")
      .populate("property", "title")
      .sort({ createdAt: -1 });

    const conversationsMap = new Map();
    messages.forEach((msg) => {
      const partner =
        msg.sender._id.toString() === userId.toString() ? msg.receiver : msg.sender;
      const convKey = `${partner._id}_${msg.property?._id || "noProperty"}`;
      if (!conversationsMap.has(convKey)) {
        conversationsMap.set(convKey, {
          partner,
          property: msg.property || null,
          lastMessage: msg.content,
          lastTime: msg.createdAt,
          updatedAt: msg.createdAt,
          unreadCount: 0,
        });
      }
    });

    res.json([...conversationsMap.values()]);
  } catch (error) {
    console.error("getConversations err", error);
    res.status(500).json({ message: "Failed to fetch conversations", error: error.message });
  }
};

// Partner history (property-scoped when provided)
const getMessagesByUser = async (req, res) => {
  try {
    const userId = req.user._id;
    const partnerId = req.params.partnerId;
    const { propertyId } = req.query || {};

    const filter = {
      $or: [
        { sender: userId, receiver: partnerId },
        { sender: partnerId, receiver: userId },
      ],
    };
    if (propertyId) filter.property = propertyId;

    const messages = await Message.find(filter)
      .populate("sender", "name email ownerKYC.ownerName")
      .populate("receiver", "name email ownerKYC.ownerName")
      .populate("property", "title")
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
};

const getConversationsCount = async (req, res) => {
  try {
    const userId = req.user._id;
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [{ sender: userId }, { receiver: userId }],
        },
      },
      {
        $group: {
          _id: {
            partner: {
              $cond: [{ $eq: ["$sender", userId] }, "$receiver", "$sender"],
            },
            property: "$property",
          },
        },
      },
    ]);
    res.json({ count: conversations.length });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch conversations count" });
  }
};

module.exports = {
  sendMessage,
  getConversations,
  getMessagesByUser,
  getConversationsCount,
};
