
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const passport = require("./config/passport");

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const stockRoutes = require("./routes/stockRoutes");
const challanRoutes = require("./routes/challanRoutes");
const adjustmentRoutes = require("./routes/adjustmentRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const movementRoutes = require("./routes/movementRoutes");

const app = express();

const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === "production";

// Validate required environment configuration
if (
  !process.env.SESSION_SECRET ||
  process.env.SESSION_SECRET ===
    "replace_this_with_a_long_random_secret"
) {
  throw new Error(
    "Set a strong, unique SESSION_SECRET in your environment configuration."
  );
}

if (!process.env.MONGO_URI) {
  throw new Error("MONGO_URI is missing from environment configuration.");
}

// Required when deployed behind a trusted reverse proxy using HTTPS.
// Configure this according to your hosting platform.
if (isProduction) {
  app.set("trust proxy", 1);
}

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

// Session middleware: store sessions in MongoDB
app.use(
  session({
    name: "ipds.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,

    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
      ttl: 8 * 60 * 60,
      autoRemove: "native",
    }),

    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

// Passport middleware must run after session middleware
app.use(passport.initialize());
app.use(passport.session());

// Health check
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "iPDS FIFO Management API is running",
  });
});

// Current authenticated user
app.get("/auth/me", (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({
      success: false,
      message: "Not authenticated",
    });
  }

  return res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      assignedGodown: req.user.assignedGodown,
    },
  });
});

// API routes
app.use("/auth", authRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/challans", challanRoutes);
app.use("/api/adjustments", adjustmentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/movements", movementRoutes);

// Connect database before starting server
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    });
  })
  .catch((error) => {
    console.error("Failed to connect to MongoDB:", error);
    process.exit(1);
  });
