const express = require("express");

const {
  getActiveCommodities,
  getActiveFPS,
  getActiveSuppliers,
  getActiveGodowns,
} = require("../controllers/referenceController");

const { isAuthenticated } = require("../Middleware/authMiddleware");

const router = express.Router();

router.get("/commodities", isAuthenticated, getActiveCommodities);
router.get("/fps", isAuthenticated, getActiveFPS);
router.get("/suppliers", isAuthenticated, getActiveSuppliers);
router.get("/godowns", isAuthenticated, getActiveGodowns);

module.exports = router;