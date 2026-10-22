
const express = require("express");

const {
  createChallan,
  approveChallan,
  dispatchChallan,
  deliverChallan,
  requestChallanException,
   reviewChallanException,
} = require("../controllers/challanController");

const {
  isAuthenticated,
  authorizeRoles,
} = require("../Middleware/authMiddleware");

const { requireAssignedGodown } = require("../Middleware/godownAccess");

const router = express.Router();

router.post(
  "/",
  isAuthenticated,
  authorizeRoles("admin", "godown_manager", "operator"),
  requireAssignedGodown,
  createChallan
);

router.patch(
  "/:challanId/approve",
  isAuthenticated,
  authorizeRoles("admin", "approver"),
  approveChallan
);

router.patch(
  "/:challanId/dispatch",
  isAuthenticated,
  authorizeRoles("admin", "godown_manager"),
  requireAssignedGodown,
  dispatchChallan
);

router.patch(
  "/:challanId/deliver",
  isAuthenticated,
  authorizeRoles("admin", "godown_manager", "operator"),
  deliverChallan
);



router.post(
  "/:challanId/exception",
  isAuthenticated,
  authorizeRoles("admin", "operator", "godown_manager"),
  requestChallanException
);

router.patch(
  "/:challanId/exception/review",
  isAuthenticated,
  authorizeRoles("approver", "admin"),
  reviewChallanException
);

module.exports = router;
