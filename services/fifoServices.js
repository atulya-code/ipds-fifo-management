
const mongoose = require("mongoose");
const StockBatch = require("../models/StockBatch");

// Allocate stock from oldest eligible batches first.
// This function MUST run inside an existing MongoDB transaction.
const allocateFIFO = async ({
  godownId,
  commodityId,
  requestedQuantity,
  unit,
  session,
}) => {
  if (
    !mongoose.Types.ObjectId.isValid(godownId) ||
    !mongoose.Types.ObjectId.isValid(commodityId)
  ) {
    throw new Error("Invalid godown or commodity ID");
  }

  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
    throw new Error("Requested quantity must be greater than zero");
  }

  if (!unit || typeof unit !== "string") {
    throw new Error("A valid stock unit is required");
  }

  if (!session || !session.inTransaction()) {
    throw new Error("An active MongoDB transaction is required");
  }

  // Fetch only eligible batches, in FIFO order.
  const batches = await StockBatch.find({
    godown: godownId,
    commodity: commodityId,
    unit,
    qualityStatus: "approved",
    status: "available",
    remainingQuantity: { $gt: 0 },
  })
    .sort({ receiptDate: 1, createdAt: 1, _id: 1 })
    .session(session);

  let quantityLeft = requestedQuantity;
  const allocations = [];

  for (const batch of batches) {
    if (quantityLeft <= 0) break;

    const quantityToAllocate = Math.min(
      batch.remainingQuantity,
      quantityLeft
    );

    if (quantityToAllocate <= 0) continue;

    // Atomically deduct stock only if the batch is still eligible
    // and belongs to the expected godown, commodity and unit.
    const updatedBatch = await StockBatch.findOneAndUpdate(
      {
        _id: batch._id,
        godown: godownId,
        commodity: commodityId,
        unit,
        qualityStatus: "approved",
        status: "available",
        remainingQuantity: { $gte: quantityToAllocate },
      },
      {
        $inc: {
          remainingQuantity: -quantityToAllocate,
        },
      },
      {
        new: true,
        session,
        runValidators: true,
      }
    );

    if (!updatedBatch) {
      throw new Error(
        "Stock changed during FIFO allocation. Retry the operation."
      );
    }

    // Mark the batch depleted when no stock remains.
    if (updatedBatch.remainingQuantity === 0) {
      updatedBatch.status = "depleted";
      await updatedBatch.save({ session });
    }

    allocations.push({
      batch: updatedBatch._id,
      quantity: quantityToAllocate,
      unit,
    });

    quantityLeft -= quantityToAllocate;
  }

  // Throwing causes the caller to abort the entire transaction.
  // This prevents partial deductions when stock is insufficient.
  if (quantityLeft > 0) {
    throw new Error(
      `Insufficient eligible stock. Short by ${quantityLeft} ${unit}.`
    );
  }

  return allocations;
};

module.exports = { allocateFIFO };
