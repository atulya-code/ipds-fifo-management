
const express = require("express");
const { getStockMovements } = require("../controllers/movementController");
const { isAuthenticated } = require("../Middleware/authMiddleware");

const router = express.Router();

router.get("/", isAuthenticated, getStockMovements);

module.exports = router;
