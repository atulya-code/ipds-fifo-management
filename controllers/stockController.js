
const mongoose = require("mongoose");

const StockBatch = require("../models/StockBatch");
const StockMovement = require("../models/StockMovement");
const Commodity = require("../models/Commodity");
const Supplier = require("../models/Supplier");
const Godown = require("../models/Godown");

// POST /api/stock/receipt
const createStockReceipt = async (req, res) => {
  const dbSession = await mongoose.startSession();

  try {
    const {
      batchNumber,
      commodity,
      supplier,
      godown,
      receiptDate,
      quantityReceived,
      unit,
      expiryDate,
      notes,
    } = req.body;

    if (
      typeof batchNumber !== "string" ||
      !batchNumber.trim() ||
      !commodity ||
      !supplier ||
      !godown ||
      !receiptDate ||
      quantityReceived === undefined ||
      !unit
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required stock receipt fields",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(commodity) ||
      !mongoose.Types.ObjectId.isValid(supplier) ||
      !mongoose.Types.ObjectId.isValid(godown)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid commodity, supplier, or godown ID",
      });
    }

    const quantity = Number(quantityReceived);
    const parsedReceiptDate = new Date(receiptDate);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Received quantity must be greater than zero",
      });
    }

    if (Number.isNaN(parsedReceiptDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid receipt date",
      });
    }

    if (
      expiryDate &&
      Number.isNaN(new Date(expiryDate).getTime())
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid expiry date",
      });
    }

    if (
      expiryDate &&
      new Date(expiryDate) < parsedReceiptDate
    ) {
      return res.status(400).json({
        success: false,
        message: "Expiry date cannot be before receipt date",
      });
    }

    if (notes !== undefined && typeof notes !== "string") {
      return res.status(400).json({
        success: false,
        message: "Notes must be a string",
      });
    }

    const normalizedBatchNumber = batchNumber.trim().toUpperCase();

    const [commodityDoc, supplierDoc, godownDoc] = await Promise.all([
      Commodity.findById(commodity),
      Supplier.findById(supplier),
      Godown.findById(godown),
    ]);

    if (!commodityDoc || !commodityDoc.isActive) {
      return res.status(404).json({
        success: false,
        message: "Commodity not found or inactive",
      });
    }

    if (!supplierDoc || !supplierDoc.isActive) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found or inactive",
      });
    }

    if (!godownDoc || !godownDoc.isActive) {
      return res.status(404).json({
        success: false,
        message: "Godown not found or inactive",
      });
    }

    if (unit !== commodityDoc.defaultUnit) {
      return res.status(400).json({
        success: false,
        message: `This commodity uses ${commodityDoc.defaultUnit} as its default unit`,
      });
    }

    if (req.user.role !== "admin") {
      if (!req.user.assignedGodown) {
        return res.status(403).json({
          success: false,
          message: "No godown is assigned to your account",
        });
      }

      if (
        req.user.assignedGodown.toString() !== String(godown)
      ) {
        return res.status(403).json({
          success: false,
          message: "You cannot receive stock into this godown",
        });
      }
    }

    const existingBatch = await StockBatch.findOne({
      godown,
      batchNumber: normalizedBatchNumber,
    });

    if (existingBatch) {
      return res.status(409).json({
        success: false,
        message: "This batch number already exists in the selected godown",
      });
    }

    let createdBatch;

    await dbSession.withTransaction(async () => {
      [createdBatch] = await StockBatch.create(
        [
          {
            batchNumber: normalizedBatchNumber,
            commodity,
            supplier,
            godown,
            receiptDate: parsedReceiptDate,
            quantityReceived: quantity,
            remainingQuantity: quantity,
            unit,
            expiryDate: expiryDate ? new Date(expiryDate) : null,
            qualityStatus: "pending",
            status: "blocked",
            receivedBy: req.user._id,
            notes: notes ? notes.trim() : "",
          },
        ],
        { session: dbSession }
      );

      await StockMovement.create(
        [
          {
            movementType: "receipt",
            batch: createdBatch._id,
            commodity,
            godown,
            quantity,
            unit,
            direction: "in",
            performedBy: req.user._id,
            reason: "Stock received from supplier",
            notes: notes ? notes.trim() : "",
          },
        ],
        { session: dbSession }
      );
    });

    return res.status(201).json({
      success: true,
      message: "Stock receipt recorded successfully",
      batch: createdBatch,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This batch number already exists in the selected godown",
      });
    }

    console.error("Stock receipt error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to record stock receipt",
    });
  } finally {
    await dbSession.endSession();
  }
};

const getFifoEligibleBatches = async (req, res) => {
  try {
    const { commodityId } = req.query;

    const godownId =
      req.godownId ||
      (req.user.role === "admin" ? req.query.godownId : null);

    if (!godownId) {
      return res.status(400).json({
        success: false,
        message: "Please specify a godown",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(godownId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid godown ID",
      });
    }

    if (
      !commodityId ||
      !mongoose.Types.ObjectId.isValid(commodityId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid commodity ID",
      });
    }

    const batches = await StockBatch.find({
      godown: godownId,
      commodity: commodityId,
      qualityStatus: "approved",
      status: "available",
      remainingQuantity: { $gt: 0 },
    })
      .sort({ receiptDate: 1, createdAt: 1, _id: 1 })
      .populate("commodity", "name defaultUnit")
      .select(
        "batchNumber commodity supplier godown receiptDate quantityReceived remainingQuantity unit expiryDate qualityStatus status"
      );

    return res.status(200).json({
      success: true,
      count: batches.length,
      batches,
    });
  } catch (error) {
    console.error("FIFO batch lookup error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch FIFO eligible batches",
    });
  }
};

const updateBatchQuality = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { qualityStatus, notes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(batchId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid batch ID",
      });
    }

    const allowedStatuses = ["approved", "hold", "rejected"];

    if (!allowedStatuses.includes(qualityStatus)) {
      return res.status(400).json({
        success: false,
        message: "Quality status must be approved, hold, or rejected",
      });
    }

    if (notes !== undefined && typeof notes !== "string") {
      return res.status(400).json({
        success: false,
        message: "Notes must be a string",
      });
    }

    const batch = await StockBatch.findById(batchId);

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Stock batch not found",
      });
    }

    if (
      req.user.role !== "admin" &&
      (
        !req.user.assignedGodown ||
        req.user.assignedGodown.toString() !== batch.godown.toString()
      )
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this godown",
      });
    }

    if (
      batch.status === "depleted" &&
      qualityStatus === "approved"
    ) {
      return res.status(400).json({
        success: false,
        message: "A depleted batch cannot be made available by quality approval",
      });
    }

    batch.qualityStatus = qualityStatus;

    if (qualityStatus === "rejected" || qualityStatus === "hold") {
      batch.status = "blocked";
    } else if (batch.remainingQuantity > 0) {
      batch.status = "available";
    }

    if (notes !== undefined) {
      batch.notes = notes.trim();
    }

    await batch.save();

    return res.status(200).json({
      success: true,
      message: `Batch quality status updated to ${qualityStatus}`,
      batch,
    });
  } catch (error) {
    console.error("Update batch quality error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update batch quality status",
    });
  }
};

const getAllStockBatches = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      qualityStatus,
      status,
      commodityId,
    } = req.query;

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
        message: "Invalid pagination values",
      });
    }

    const filter = {};

    if (req.user.role === "admin") {
      const { godownId } = req.query;

      if (godownId) {
        if (!mongoose.Types.ObjectId.isValid(godownId)) {
          return res.status(400).json({
            success: false,
            message: "Invalid godown ID",
          });
        }

        filter.godown = godownId;
      }
    } else {
      if (!req.user.assignedGodown) {
        return res.status(403).json({
          success: false,
          message: "No godown is assigned to your account",
        });
      }

      filter.godown = req.user.assignedGodown;
    }

    if (qualityStatus) {
      const allowedQualityStatuses = [
        "pending",
        "approved",
        "hold",
        "rejected",
      ];

      if (!allowedQualityStatuses.includes(qualityStatus)) {
        return res.status(400).json({
          success: false,
          message: "Invalid quality status",
        });
      }

      filter.qualityStatus = qualityStatus;
    }

    if (status) {
      const allowedStatuses = ["available", "depleted", "blocked"];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid batch status",
        });
      }

      filter.status = status;
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

    const skip = (pageNumber - 1) * limitNumber;

    const [batches, total] = await Promise.all([
      StockBatch.find(filter)
        .populate("commodity", "name defaultUnit")
        .populate("supplier", "supplierCode name")
        .populate("godown", "godownCode name")
        .populate("receivedBy", "name email")
        .sort({ receiptDate: -1, _id: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),

      StockBatch.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      batches,
      pagination: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error("Get all stock batches error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch stock batches",
    });
  }
};

const getStockBatchById = async (req, res) => {
  try {
    const { batchId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(batchId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid batch ID",
      });
    }

    const batch = await StockBatch.findById(batchId)
      .populate("commodity", "name defaultUnit description")
      .populate("supplier", "supplierCode name contactPerson phone")
      .populate("godown", "godownCode name district state")
      .populate("receivedBy", "name email role")
      .lean();

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Stock batch not found",
      });
    }

    if (!batch.godown || !batch.godown._id) {
      return res.status(409).json({
        success: false,
        message: "The stock batch has no valid associated godown",
      });
    }

    if (
      req.user.role !== "admin" &&
      (
        !req.user.assignedGodown ||
        req.user.assignedGodown.toString() !==
          batch.godown._id.toString()
      )
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this godown",
      });
    }

    return res.status(200).json({
      success: true,
      batch,
    });
  } catch (error) {
    console.error("Get stock batch details error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch stock batch details",
    });
  }
};

module.exports = {
  createStockReceipt,
  getFifoEligibleBatches,
  updateBatchQuality,
  getAllStockBatches,
  getStockBatchById,
};
