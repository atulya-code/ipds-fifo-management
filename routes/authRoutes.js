
const express = require("express");
const bcrypt = require("bcrypt");
const passport = require("../config/passport");
const User = require("../models/User");
const { isAuthenticated } = require("../Middleware/authMiddleware.js");

const router = express.Router();

// POST /auth/signup
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // 1. Check required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password and role are required",
      });
    }

    // 2. Validate input data types
    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof role !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password and role must be valid strings",
      });
    }

    // 3. Reject empty values
    if (!name.trim() || !email.trim() || !password.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password cannot be empty",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 4. Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    // 5. Validate password length
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    // 6. Public signup cannot create privileged accounts
    if (!["operator", "godown_manager"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "This role cannot be assigned through public signup",
      });
    }

    // 7. Check duplicate email
    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    // 8. Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // 9. Create user
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role,
    });

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    // Handle duplicate email race condition
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    console.error("Signup error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create account",
    });
  }
});

// POST /auth/login
router.post("/login", (req, res, next) => {
  const { email, password } = req.body || {};

  // 1. Validate login inputs
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password.trim()
  ) {
    return res.status(400).json({
      success: false,
      message: "Valid email and password are required",
    });
  }

  // 2. Authenticate user using Passport Local
  passport.authenticate("local", (error, user, info) => {
    if (error) {
      return next(error);
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: info?.message || "Login failed",
      });
    }

    // 3. Create login session
    req.logIn(user, (loginError) => {
      if (loginError) {
        return next(loginError);
      }

      return res.status(200).json({
        success: true,
        message: "Login successful",
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          assignedGodown: user.assignedGodown,
        },
      });
    });
  })(req, res, next);
});

// POST /auth/logout
router.post("/logout", isAuthenticated, (req, res, next) => {
  req.logout((logoutError) => {
    if (logoutError) {
      return next(logoutError);
    }

    req.session.destroy((sessionError) => {
      if (sessionError) {
        return next(sessionError);
      }

      res.clearCookie("ipds.sid", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });

      return res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    });
  });
});

module.exports = router;
