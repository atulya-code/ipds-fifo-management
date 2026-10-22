
const mongoose = require("mongoose");

const requireAssignedGodown = (req, res, next) => {
  const user = req.user;

  if (!user || !user.isActive) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  // Admin can access all godowns.
  // Use isAuthenticated separately on protected routes.
  if (user.role === "admin") {
    return next();
  }

  if (!user.assignedGodown) {
    return res.status(403).json({
      success: false,
      message: "No godown is assigned to your account",
    });
  }

  const requestedGodownId =
    req.params.godownId ||
    req.body.godown ||
    req.query.godownId;

  // If route doesn't specify a godown, attach the user's assigned godown.
  if (!requestedGodownId) {
    req.godownId = user.assignedGodown;
    return next();
  }

  if (!mongoose.Types.ObjectId.isValid(requestedGodownId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid godown ID",
    });
  }

  if (user.assignedGodown.toString() !== requestedGodownId.toString()) {
    return res.status(403).json({
      success: false,
      message: "You do not have access to this godown",
    });
  }

  req.godownId = user.assignedGodown;

  next();
};

module.exports = { requireAssignedGodown };
