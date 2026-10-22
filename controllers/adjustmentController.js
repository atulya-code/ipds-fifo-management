
const mongoose = require("mongoose");
const StockBatch = require("../models/StockBatch");
const StockMovement = require("../models/StockMovement");

const adjustStock = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { batchId } = req.params;
    const { direction, quantity, reason, notes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(batchId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock batch ID",
      });
    }

    if (
      !["in", "out"].includes(direction) ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      typeof reason !== "string" ||
      !reason.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid direction, positive quantity and reason are required",
      });
    }

    let updatedBatch;

    await session.withTransaction(async () => {
      const batch = await StockBatch.findById(batchId).session(session);

      if (!batch) {
        throw new Error("Stock batch not found");
      }

      if (
        req.user.role !== "admin" &&
        (
          !req.user.assignedGodown ||
          String(req.user.assignedGodown) !== String(batch.godown)
        )
      ) {
        throw new Error("You do not have access to this godown");
      }

      if (
        batch.status === "blocked" ||
        batch.qualityStatus === "rejected"
      ) {
        throw new Error("Blocked or rejected stock cannot be adjusted");
      }

      if (
        direction === "out" &&
        quantity > batch.remainingQuantity
      ) {
        throw new Error("Adjustment exceeds available batch quantity");
      }

      const update =
        direction === "in"
          ? { $inc: { remainingQuantity: quantity } }
          : { $inc: { remainingQuantity: -quantity } };

      // Conditional update prevents stock from becoming negative
      // and detects a concurrent change to the batch quantity.
      const filter = {
        _id: batch._id,
        remainingQuantity:
          direction === "out"
            ? { $gte: quantity }
            : batch.remainingQuantity,
      };

      updatedBatch = await StockBatch.findOneAndUpdate(
        filter,
        update,
        {
          new: true,
          session,
          runValidators: true,
        }
      );

      if (!updatedBatch) {
        throw new Error("Stock changed during adjustment. Retry.");
      }

      // Keep batch status consistent with its quality and quantity.
      if (updatedBatch.remainingQuantity === 0) {
        updatedBatch.status = "depleted";
      } else if (updatedBatch.qualityStatus === "approved") {
        updatedBatch.status = "available";
      } else {
        updatedBatch.status = "blocked";
      }

      await updatedBatch.save({ session });

      // Record the stock movement in the same transaction.
      await StockMovement.create(
        [
          {
            movementType: "adjustment",
            batch: batch._id,
            commodity: batch.commodity,
            godown: batch.godown,
            quantity,
            unit: batch.unit,
            direction,
            performedBy: req.user._id,
            reason: reason.trim(),
            notes: typeof notes === "string" ? notes.trim() : "",
          },
        ],
        { session }
      );
    });

    return res.status(200).json({
      success: true,
      message: "Stock adjustment recorded successfully",
      batch: updatedBatch,
    });
  } catch (error) {
    console.error("Stock adjustment error:", error);

    const clientError =
      /not found|access to this godown|exceeds|cannot be adjusted|Stock changed/i.test(
        error.message
      );

    return res.status(clientError ? 400 : 500).json({
      success: false,
      message: error.message || "Failed to adjust stock",
    });
  } finally {
    await session.endSession();
  }
};

module.exports = { adjustStock };
