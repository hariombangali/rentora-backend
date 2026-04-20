const Notification = require("../models/Notification");

// GET /api/notifications?limit=20&before=<iso>
exports.list = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 50);
    const q = { user: req.user._id };
    if (req.query.before) q.createdAt = { $lt: new Date(req.query.before) };
    const items = await Notification.find(q).sort({ createdAt: -1 }).limit(limit).lean();
    res.json(items);
  } catch (err) {
    console.error("notifications.list:", err);
    res.status(500).json({ message: "Failed to load notifications" });
  }
};

// GET /api/notifications/unread-count
exports.unreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ user: req.user._id, read: false });
    res.json({ count });
  } catch (err) {
    console.error("notifications.unreadCount:", err);
    res.status(500).json({ message: "Failed to fetch count" });
  }
};

// PATCH /api/notifications/:id/read
exports.markRead = async (req, res) => {
  try {
    const n = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true },
      { new: true }
    );
    if (!n) return res.status(404).json({ message: "Notification not found" });
    res.json(n);
  } catch (err) {
    console.error("notifications.markRead:", err);
    res.status(500).json({ message: "Failed" });
  }
};

// PATCH /api/notifications/read-all
exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
    res.json({ ok: true });
  } catch (err) {
    console.error("notifications.markAllRead:", err);
    res.status(500).json({ message: "Failed" });
  }
};

// DELETE /api/notifications/:id
exports.remove = async (req, res) => {
  try {
    await Notification.deleteOne({ _id: req.params.id, user: req.user._id });
    res.json({ ok: true });
  } catch (err) {
    console.error("notifications.remove:", err);
    res.status(500).json({ message: "Failed" });
  }
};
