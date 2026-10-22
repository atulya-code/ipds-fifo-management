
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcrypt");

const User = require("../models/User");

// Login strategy: email and password verify karna
passport.use(
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    async (email, password, done) => {
      try {
        const user = await User.findOne({
          email: email.toLowerCase().trim(),
        }).select("+password");

        if (!user) {
          return done(null, false, {
            message: "Invalid email or password",
          });
        }

        if (!user.isActive) {
          return done(null, false, {
            message: "Your account is inactive",
          });
        }

        const isPasswordValid = await bcrypt.compare(
          password,
          user.password
        );

        if (!isPasswordValid) {
          return done(null, false, {
            message: "Invalid email or password",
          });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);

// Login ke baad session mein user ki ID store hogi
passport.serializeUser((user, done) => {
  done(null, user._id);
});

// Har authenticated request par session ID se user fetch hoga
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);

    if (!user || !user.isActive) {
      return done(null, false);
    }

    return done(null, user);
  } catch (error) {
    return done(error);
  }
});

module.exports = passport;
