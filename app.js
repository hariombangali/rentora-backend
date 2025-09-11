const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db'); // MongoDB connection
const { errorHandler } = require('./middlewares/errorHandler');
const testimonialRoutes = require('./routes/testimonialRoutes');
const messageRoutes = require("./routes/messageRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");

dotenv.config();
const app = express();

// Connect to MongoDB
connectDB();

// ✅ Allowed Origins (production + localhost + any vercel preview)
const allowedOrigins = [
  process.env.CLIENT_URL,        // production frontend
  "http://localhost:5173",       // dev
  /\.vercel\.app$/               // all vercel preview domains
];

// Middlewares
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow mobile/curl/postman without origin
      if (
        allowedOrigins.some((o) => {
          if (o instanceof RegExp) return o.test(origin);
          return o === origin;
        })
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS: " + origin));
      }
    },
    credentials: true,
  })
);

app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/properties', require('./routes/PropertyRoutes'));
app.use('/api', require('./routes/homeRoutes'));
app.use('/api/testimonials', testimonialRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/wishlist", wishlistRoutes);

// Error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
