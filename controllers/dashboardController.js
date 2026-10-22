
const mongoose = require("mongoose");
const StockBatch = require("../models/StockBatch");

const getStockDashboard = async (req, res) => {
  try {
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

    const match = {
      godown: new mongoose.Types.ObjectId(godownId),
      qualityStatus: "approved",
      status: "available",
      remainingQuantity: { $gt: 0 },
    };

    const [
      commoditySummary,
      totalSummary,
      ageingBatches,
      lowStockBatches,
    ] = await Promise.all([
      StockBatch.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$commodity",
            totalQuantity: { $sum: "$remainingQuantity" },
            unit: { $first: "$unit" },
            batchCount: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: "commodities",
            localField: "_id",
            foreignField: "_id",
            as: "commodity",
          },
        },
        { $unwind: "$commodity" },
        {
          $project: {
            _id: 0,
            commodityId: "$commodity._id",
            commodityName: "$commodity.name",
            totalQuantity: 1,
            unit: 1,
            batchCount: 1,
          },
        },
        { $sort: { commodityName: 1 } },
      ]),

      StockBatch.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalBatches: { $sum: 1 },
            totalQuantity: { $sum: "$remainingQuantity" },
          },
        },
      ]),

      StockBatch.find(match)
        .sort({ receiptDate: 1, _id: 1 })
        .limit(10)
        .populate("commodity", "name")
        .select(
          "batchNumber commodity receiptDate remainingQuantity unit expiryDate"
        ),

      StockBatch.find(match)
        .sort({ remainingQuantity: 1, _id: 1 })
        .limit(10)
        .populate("commodity", "name")
        .select(
          "batchNumber commodity remainingQuantity unit receiptDate"
        ),
    ]);

    const now = Date.now();

    const ageing = ageingBatches.map((batch) => ({
      ...batch.toObject(),
      ageInDays: Math.max(
        0,
        Math.floor(
          (now - new Date(batch.receiptDate).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      ),
    }));

    return res.status(200).json({
      success: true,
      godownId,
      summary: totalSummary[0] || {
        totalBatches: 0,
        totalQuantity: 0,
      },
      commoditySummary,
      oldestBatches: ageing,
      lowestQuantityBatches: lowStockBatches,
    });
  } catch (error) {
    console.error("Dashboard error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load stock dashboard",
    });
  }
};

module.exports = { getStockDashboard };
