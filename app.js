require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const connectDB = require('./config/db');
const { errorHandler } = require('./middlewares/errorHandler');
const testimonialRoutes = require('./routes/testimonialRoutes');
const messageRoutes = require("./routes/messageRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const { initSocket } = require('./socket');
const app = express();

connectDB();

// Security headers
app.use(helmet());

// Gzip compression
app.use(compression());

// Allowed Origins
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.CLIENT_URL_PROD,
  "http://localhost:5173",
  /\.vercel\.app$/,
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.some((o) => {
          if (!o) return false;
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

// Body size limit
app.use(express.json({ limit: '1mb' }));

// Rate limiting — strict on auth, lenient on general API
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter);
app.use('/api', generalLimiter);

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/properties', require('./routes/PropertyRoutes'));
app.use('/api', require('./routes/homeRoutes'));
app.use('/api/testimonials', testimonialRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api", bookingRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/applications", require("./routes/applicationRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/rent-payments", require("./routes/rentPaymentRoutes"));
app.use("/api/issues", require("./routes/maintenanceRoutes"));

// Error handler
app.use(errorHandler);

// HTTP server + Socket.io
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
initSocket(server);

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
