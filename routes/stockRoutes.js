
const express = require("express");
const {
  createStockReceipt,
  getFifoEligibleBatches,
  updateBatchQuality,
   getStockBatchById,
    getAllStockBatches,
} = require("../controllers/stockController");


const {
  isAuthenticated,
  authorizeRoles,
} = require("../Middleware/authMiddleware");

const {
  requireAssignedGodown,
} = require("../Middleware/godownAccess");

const router = express.Router();

// POST /api/stock/receipt
router.post(
  "/receipt",
  isAuthenticated,
  authorizeRoles("admin", "godown_manager", "operator"),
  requireAssignedGodown,
  createStockReceipt
);
router.patch(
  "/batches/:batchId/quality",
  isAuthenticated,
  authorizeRoles("admin", "godown_manager", "approver"),
  requireAssignedGodown,
  updateBatchQuality
);

router.get(
  "/fifo-batches",
  isAuthenticated,
  authorizeRoles("admin", "godown_manager", "operator", "approver"),
  requireAssignedGodown,
  getFifoEligibleBatches
);

router.get(
  "/batches/:batchId",
  isAuthenticated,
  authorizeRoles("admin", "godown_manager", "operator", "approver"),
  getStockBatchById
);
router.get(
  "/batches",
  isAuthenticated,
  authorizeRoles("admin", "godown_manager", "operator", "approver"),
  requireAssignedGodown,
  getAllStockBatches
);
module.exports = router;
