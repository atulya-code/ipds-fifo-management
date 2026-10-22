
const express = require("express");
const { getStockDashboard } = require("../controllers/dashboardController");
const { isAuthenticated } = require("../Middleware/authMiddleware");

const router = express.Router();

router.get("/", isAuthenticated, getStockDashboard);

module.exports = router;
