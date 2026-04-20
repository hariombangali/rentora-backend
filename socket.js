const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

let io;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: [
        process.env.CLIENT_URL,
        process.env.CLIENT_URL_PROD,
        "http://localhost:5173",
      ],
      credentials: true,
    },
  });

  // Soft auth: if a valid JWT is provided, auto-join the user's personal room.
  // Messaging/typing events still work without auth for backward compatibility.
  io.use((socket, next) => {
    try {
      const token = socket.handshake?.auth?.token;
      if (token && process.env.JWT_SECRET) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded?.id) {
          socket.data.userId = String(decoded.id);
        }
      }
    } catch (e) { /* invalid token — continue unauth'd */ }
    next();
  });

  io.on("connection", (socket) => {
    // Auto-join personal room for notifications
    if (socket.data.userId) {
      socket.join(`user_${socket.data.userId}`);
    }

    // Explicit join (fallback if token parsing failed client-side)
    socket.on("auth:join", ({ userId }) => {
      if (userId) socket.join(`user_${String(userId)}`);
    });

    // Conversation rooms (existing messaging)
    socket.on("join_room", ({ senderId, receiverId, propertyId }) => {
      const room = getRoomKey(senderId, receiverId, propertyId);
      socket.join(room);
    });

    socket.on("typing", ({ senderId, receiverId, propertyId }) => {
      const room = getRoomKey(senderId, receiverId, propertyId);
      socket.to(room).emit("user_typing", { senderId });
    });

    socket.on("stop_typing", ({ senderId, receiverId, propertyId }) => {
      const room = getRoomKey(senderId, receiverId, propertyId);
      socket.to(room).emit("user_stop_typing", { senderId });
    });

    socket.on("disconnect", () => {});
  });
}

function getRoomKey(senderId, receiverId, propertyId) {
  const parts = [String(senderId), String(receiverId)];
  if (propertyId) parts.push(String(propertyId));
  return `conv_${parts.sort().join("_")}`;
}

function getIO() {
  return io;
}

module.exports = { initSocket, getRoomKey, getIO };
