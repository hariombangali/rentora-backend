const { Server } = require("socket.io");

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

  io.on("connection", (socket) => {
    // Join a conversation room
    socket.on("join_room", ({ senderId, receiverId, propertyId }) => {
      const room = getRoomKey(senderId, receiverId, propertyId);
      socket.join(room);
    });

    // Typing indicators
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
