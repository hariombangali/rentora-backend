const Message = require("../models/Message");

const sendMessage = async (req, res) => {
  try {
    const { propertyId, receiverId, content } = req.body;

    const message = await Message.create({
      property: propertyId,
      sender: req.user._id,   // current logged-in user
      receiver: receiverId,   // property owner
      content,
    });

    const populatedMessage = await message.populate([
      { path: "sender", select: "name email" },
      { path: "receiver", select: "name email" },
      { path: "property", select: "title" }
    ]);

    return res.status(201).json(populatedMessage);
  } catch (error) {
    console.error("Error sending message:", error);
    return res.status(500).json({
      message: "Failed to send message",
      error: error.message,
    });
  }
};

// ✅ 1. Get all conversations of logged-in user
const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;

    const messages = await Message.find({
      $or: [{ sender: userId }, { receiver: userId }],
    })
      .populate("sender", "name email")
      .populate("receiver", "name email")
      .populate("property", "title") // 👈 property bhi include karenge
      .sort({ createdAt: -1 });

    const conversationsMap = new Map();

    messages.forEach((msg) => {
      const partner =
        msg.sender._id.toString() === userId.toString()
          ? msg.receiver
          : msg.sender;

      // Unique conversation (partner + property)
      const convKey = `${partner._id}_${msg.property?._id || "noProperty"}`;

      if (!conversationsMap.has(convKey)) {
        conversationsMap.set(convKey, {
          partner,
          property: msg.property || null,
          lastMessage: msg.content,
          lastTime: msg.createdAt,
        });
      }
    });

    res.json([...conversationsMap.values()]);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch conversations", error: error.message });
  }
};

// ✅ 2. Get all messages with a specific user (chat history)
const getMessagesByUser = async (req, res) => {
  try {
    const userId = req.user._id;
    const partnerId = req.params.partnerId;

    const messages = await Message.find({
      $or: [
        { sender: userId, receiver: partnerId },
        { sender: partnerId, receiver: userId },
      ],
    })
      .populate("sender", "name email")
      .populate("receiver", "name email")
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
    res
      .status(500)
      .json({ message: "Failed to fetch conversations count" });
  }
};

module.exports = {
  sendMessage,
  getConversations,
  getMessagesByUser,
  getConversationsCount,
};
