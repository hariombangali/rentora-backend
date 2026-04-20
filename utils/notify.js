const Notification = require("../models/Notification");
const { getIO } = require("../socket");

// Creates a notification AND emits a socket event to the user's room.
// Fire-and-forget: errors are logged, never thrown to the caller.
async function notify({ user, kind, title, body, link, refId, refType, meta }) {
  try {
    if (!user) return null;
    const doc = await Notification.create({
      user, kind, title,
      body: body || "",
      link: link || "",
      refId: refId || null,
      refType: refType || null,
      meta: meta || {},
    });

    const io = getIO();
    if (io) {
      io.to(`user_${String(user)}`).emit("notification:new", doc.toObject());
    }
    return doc;
  } catch (err) {
    console.error("notify failed:", err.message);
    return null;
  }
}

module.exports = { notify };
