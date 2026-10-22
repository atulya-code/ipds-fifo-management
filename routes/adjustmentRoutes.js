
const express = require("express");
const { adjustStock } = require("../controllers/adjustmentController");
const {
  isAuthenticated,
  authorizeRoles,
} = require("../Middleware/authMiddleware");
const {
  requireAssignedGodown,
} = require("../Middleware/godownAccess");

const router = express.Router();

router.patch(
  "/:batchId",
  isAuthenticated,
  authorizeRoles("admin", "godown_manager"),
  requireAssignedGodown,
  adjustStock
);

module.exports = router;
