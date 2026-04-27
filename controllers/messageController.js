const Message = require("../models/Message");
const User = require("../models/User");
const Property = require("../models/Property");
const { getIO, getRoomKey } = require("../socket");
const { notify } = require("../utils/notify");

const sendMessage = async (req, res) => {
  try {
    const { propertyId, receiverId, content } = req.body;
    if (!receiverId || !content?.trim()) {
      return res.status(400).json({ message: "receiverId and content are required" });
    }
    if (content.trim().length > 2000) {
      return res.status(400).json({ message: "Message must be 2000 characters or less" });
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

    // Emit real-time events
    const io = getIO();
    if (io) {
      // 1. Conversation room — used when the receiver has this conversation OPEN
      const room = getRoomKey(req.user._id, receiverId, propertyId);
      io.to(room).emit("receive_message", populatedMessage);

      // 2. Receiver's personal room — used to update the sidebar preview / unread badge
      //    even when a different conversation is open.
      io.to(`user_${String(receiverId)}`).emit("message:preview", {
        partner: populatedMessage.sender,   // from the receiver's POV the partner = sender
        property: populatedMessage.property || null,
        lastMessage: populatedMessage.content,
        updatedAt: populatedMessage.createdAt,
        messageId: populatedMessage._id,
      });
    }

    // Create a notification for the receiver
    const preview = content.trim().length > 90 ? content.trim().slice(0, 87) + "…" : content.trim();
    notify({
      user: receiverId,
      kind: "message_new",
      title: `New message from ${req.user.name || "someone"}`,
      body: preview,
      link: "/inbox",
      refId: populatedMessage._id,
      refType: "Message",
      meta: { senderName: req.user.name, propertyTitle: populatedMessage.property?.title },
    });

    return res.status(201).json(populatedMessage);
  } catch (error) {
    console.error("Error sending message:", error);
    return res.status(500).json({ message: "Failed to send message" });
  }
};

const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    const { partnerId, propertyId } = req.query || {};

    // Single conversation fetch/create for deep-link
    if (partnerId && propertyId) {
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
        const unreadCount = await Message.countDocuments({
          property: propertyId,
          sender: partnerId,
          receiver: userId,
          isRead: false,
        });
        return res.json({
          partner,
          property: last.property || null,
          lastMessage: last.content,
          lastTime: last.createdAt,
          updatedAt: last.createdAt,
          unreadCount,
        });
      }

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

    // Full list — paginated
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);

    const messages = await Message.find({
      $or: [{ sender: userId }, { receiver: userId }],
    })
      .populate("sender", "name email ownerKYC.ownerName")
      .populate("receiver", "name email ownerKYC.ownerName")
      .populate("property", "title")
      .sort({ createdAt: -1 })
      .lean();

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
      // Count unread for this conversation
      if (!msg.isRead && msg.receiver.toString() === userId.toString()) {
        const entry = conversationsMap.get(convKey);
        if (entry) entry.unreadCount += 1;
      }
    });

    const allConversations = [...conversationsMap.values()];
    const total = allConversations.length;
    const paginated = allConversations.slice((page - 1) * limit, page * limit);

    res.json({ conversations: paginated, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("getConversations err", error);
    res.status(500).json({ message: "Failed to fetch conversations" });
  }
};

const getMessagesByUser = async (req, res) => {
  try {
    const userId = req.user._id;
    const partnerId = req.params.partnerId;
    const { propertyId, before, limit: limitParam } = req.query || {};

    const filter = {
      $or: [
        { sender: userId, receiver: partnerId },
        { sender: partnerId, receiver: userId },
      ],
    };
    if (propertyId) filter.property = propertyId;
    if (before) filter.createdAt = { $lt: new Date(before) };

    const limit = Math.min(100, parseInt(limitParam) || 30);

    const messages = await Message.find(filter)
      .populate("sender", "name email ownerKYC.ownerName")
      .populate("receiver", "name email ownerKYC.ownerName")
      .populate("property", "title")
      .sort({ createdAt: before ? -1 : 1 })
      .limit(limit)
      .lean();

    // Mark fetched messages as read for current user (receiver)
    await Message.updateMany(
      { ...filter, receiver: userId, isRead: false },
      { $set: { isRead: true } }
    );

    res.json(before ? messages.reverse() : messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
};

const markMessagesRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const { partnerId, propertyId } = req.body;

    const filter = { receiver: userId, isRead: false };
    if (partnerId) filter.sender = partnerId;
    if (propertyId) filter.property = propertyId;

    await Message.updateMany(filter, { $set: { isRead: true } });
    res.json({ message: "Messages marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Failed to mark messages as read" });
  }
};

const getConversationsCount = async (req, res) => {
  try {
    const userId = req.user._id;
    const conversations = await Message.aggregate([
      { $match: { $or: [{ sender: userId }, { receiver: userId }] } },
      {
        $group: {
          _id: {
            partner: { $cond: [{ $eq: ["$sender", userId] }, "$receiver", "$sender"] },
            property: "$property",
          },
        },
      },
    ]);
    const unread = await Message.countDocuments({ receiver: userId, isRead: false });
    res.json({ count: conversations.length, unread });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch conversations count" });
  }
};

module.exports = {
  sendMessage,
  getConversations,
  getMessagesByUser,
  markMessagesRead,
  getConversationsCount,
};
