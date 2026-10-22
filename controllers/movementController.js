
const mongoose = require("mongoose");
const StockMovement = require("../models/StockMovement");

const getStockMovements = async (req, res) => {
  try {
    const {
      batchId,
      commodityId,
      movementType,
      from,
      to,
      page = 1,
      limit = 20,
    } = req.query;

    const isAdmin = req.user.role === "admin";
    const godownId = isAdmin
      ? req.query.godownId
      : req.user.assignedGodown;

    if (!godownId) {
      return res.status(isAdmin ? 400 : 403).json({
        success: false,
        message: isAdmin
          ? "Please select a godown"
          : "No godown is assigned to your account",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(godownId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid godown ID",
      });
    }

    if (
      !isAdmin &&
      String(req.user.assignedGodown) !== String(godownId)
    ) {
      return res.status(403).json({
        success: false,
        message: "You cannot view this godown",
      });
    }

    const filter = {
      godown: godownId,
    };

    if (batchId) {
      if (!mongoose.Types.ObjectId.isValid(batchId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid batch ID",
        });
      }

      filter.batch = batchId;
    }

    if (commodityId) {
      if (!mongoose.Types.ObjectId.isValid(commodityId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid commodity ID",
        });
      }

      filter.commodity = commodityId;
    }

    if (movementType) {
      if (
        !["receipt", "dispatch", "adjustment", "return"].includes(
          movementType
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid movement type",
        });
      }

      filter.movementType = movementType;
    }

    if (from || to) {
      filter.createdAt = {};

      if (from) {
        const fromDate = new Date(from);

        if (Number.isNaN(fromDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid from date",
          });
        }

        filter.createdAt.$gte = fromDate;
      }

      if (to) {
        const toDate = new Date(to);

        if (Number.isNaN(toDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid to date",
          });
        }

        toDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = toDate;
      }

      if (
        filter.createdAt.$gte &&
        filter.createdAt.$lte &&
        filter.createdAt.$gte > filter.createdAt.$lte
      ) {
        return res.status(400).json({
          success: false,
          message: "From date cannot be after to date",
        });
      }
    }

    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      !Number.isInteger(limitNumber) ||
      limitNumber < 1 ||
      limitNumber > 100
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Page must be positive and limit must be between 1 and 100",
      });
    }

    const [movements, total] = await Promise.all([
      StockMovement.find(filter)
        .populate("batch", "batchNumber")
        .populate("commodity", "name")
        .populate("performedBy", "name email")
        .populate("challan", "challanNumber status")
        .sort({ createdAt: -1, _id: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),

      StockMovement.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      pagination: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
      movements,
    });
  } catch (error) {
    console.error("Movement history error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch stock movement history",
    });
  }
};

module.exports = { getStockMovements };
