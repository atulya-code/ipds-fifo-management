
const isAuthenticated = (req, res, next) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({
      success: false,
      message: "Please login to access this resource",
    });
  }

  if (!req.user || !req.user.isActive) {
    return res.status(401).json({
      success: false,
      message: "Your account is inactive or unavailable",
    });
  }

  next();
};

const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: "Please login to access this resource",
      });
    }

    if (!req.user || !req.user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Your account is inactive or unavailable",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action",
      });
    }

    next();
  };
};

module.exports = {
  isAuthenticated,
  authorizeRoles,
};
