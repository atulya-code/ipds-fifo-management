
const mongoose = require("mongoose");

const DeliveryChallan = require("../models/DeliveryChallan");
const StockBatch = require("../models/StockBatch");
const StockMovement = require("../models/StockMovement");
const Commodity = require("../models/Commodity");
const Godown = require("../models/Godown");
const FPS = require("../models/FPS");
const { allocateFIFO } = require("../services/fifoServices");

// 1. Create draft challan. Stock is NOT deducted here.
const createChallan = async (req, res) => {
  try {
    const { godown, fps, items, notes } = req.body;
    
    if (notes !== undefined && typeof notes !== "string") {
  return res.status(400).json({
    success: false,
    message: "Notes must be a string",
  });
}

    if (
      !godown ||
      !fps ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Godown, FPS and at least one item are required",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(godown) ||
      !mongoose.Types.ObjectId.isValid(fps)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid godown or FPS ID",
      });
    }

    if (
      req.user.role !== "admin" &&
      String(req.user.assignedGodown) !== String(godown)
    ) {
      return res.status(403).json({
        success: false,
        message: "You cannot create a challan for this godown",
      });
    }

    const godownDoc = await Godown.findById(godown);
    const fpsDoc = await FPS.findById(fps);

    if (!godownDoc || !godownDoc.isActive) {
      return res.status(404).json({
        success: false,
        message: "Godown not found or inactive",
      });
    }

    if (!fpsDoc || !fpsDoc.isActive) {
      return res.status(404).json({
        success: false,
        message: "FPS not found or inactive",
      });
    }

    const commodityIds = items.map((item) =>
      String(item.commodity || "")
    );

    if (
      commodityIds.some(
        (id) => !mongoose.Types.ObjectId.isValid(id)
      ) ||
      new Set(commodityIds).size !== commodityIds.length
    ) {
      return res.status(400).json({
        success: false,
        message: "Use valid, unique commodity IDs in each challan",
      });
    }

    const challanItems = [];

    for (const item of items) {
      if (
        !Number.isFinite(item.requestedQuantity) ||
        item.requestedQuantity <= 0 ||
        !item.unit
      ) {
        return res.status(400).json({
          success: false,
          message: "Each item needs a positive quantity and unit",
        });
      }

      const commodity = await Commodity.findById(item.commodity);

      if (!commodity || !commodity.isActive) {
        return res.status(400).json({
          success: false,
          message: "Commodity not found or inactive",
        });
      }

      if (item.unit !== commodity.defaultUnit) {
        return res.status(400).json({
          success: false,
          message: `Unit for ${commodity.name} must be ${commodity.defaultUnit}`,
        });
      }

      // Preview eligible FIFO batches without changing stock.
      const batches = await StockBatch.find({
        godown,
        commodity: item.commodity,
        qualityStatus: "approved",
        status: "available",
        unit: item.unit,
        remainingQuantity: { $gt: 0 },
      }).sort({ receiptDate: 1, createdAt: 1, _id: 1 });

      let quantityLeft = item.requestedQuantity;
      const allocations = [];

      for (const batch of batches) {
        if (quantityLeft <= 0) break;

        const quantity = Math.min(
          batch.remainingQuantity,
          quantityLeft
        );

        allocations.push({
          batch: batch._id,
          quantity,
          unit: item.unit,
        });

        quantityLeft -= quantity;
      }

      if (quantityLeft > 0) {
        return res.status(400).json({
          success: false,
          message: `Insufficient eligible ${commodity.name} stock. Short by ${quantityLeft} ${item.unit}`,
        });
      }

      challanItems.push({
        commodity: item.commodity,
        requestedQuantity: item.requestedQuantity,
        unit: item.unit,
        allocations,
      });
    }

    const challan = await DeliveryChallan.create({
      challanNumber:
        `CH-${new mongoose.Types.ObjectId().toString().toUpperCase()}`,
      godown,
      fps,
      items: challanItems,
      status: "draft",
      createdBy: req.user._id,
      notes: notes || "",
    });

    return res.status(201).json({
      success: true,
      message: "Draft challan created. Stock has not been deducted.",
      challan,
    });
  } catch (error) {
    console.error("Create challan error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create challan",
    });
  }
};

// 2. Approve a draft challan.

const approveChallan = async (req, res) => {
  try {
    const { challanId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(challanId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid challan ID",
      });
    }

    const filter = {
      _id: challanId,
      status: "draft",
      exceptionStatus: { $ne: "pending" },
    };

    // Non-admin users can only approve challans
    // belonging to their assigned godown.
    if (req.user.role !== "admin") {
      if (!req.user.assignedGodown) {
        return res.status(403).json({
          success: false,
          message: "No godown is assigned to your account",
        });
      }

      filter.godown = req.user.assignedGodown;
    }

    const challan = await DeliveryChallan.findOneAndUpdate(
      filter,
      {
        $set: { status: "approved" },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!challan) {
      return res.status(409).json({
        success: false,
        message:
          "Challan not found, already processed, or its exception request is pending",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Challan approved successfully",
      challan,
    });
  } catch (error) {
    console.error("Approve challan error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to approve challan",
    });
  }
};

// 3. Dispatch approved challan and deduct stock atomically.

const dispatchChallan = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { challanId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(challanId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid challan ID",
      });
    }

    let dispatchedChallan;

    await session.withTransaction(async () => {
      const challan = await DeliveryChallan.findOne({
        _id: challanId,
        status: "approved",
      }).session(session);

      if (!challan) {
        throw new Error(
          "Challan not found or has not been approved"
        );
      }

      if (
        req.user.role !== "admin" &&
        String(req.user.assignedGodown) !==
          String(challan.godown)
      ) {
        throw new Error(
          "You cannot dispatch stock from this godown"
        );
      }

      // Pending exception must never be dispatched.
      if (challan.exceptionStatus === "pending") {
        throw new Error(
          "Exception request is pending approval"
        );
      }

      for (const item of challan.items) {
        let allocations;

        if (challan.exceptionStatus === "approved") {
          // Use the batches specifically approved by the approver.
          const proposed = item.exceptionAllocations || [];

          if (proposed.length === 0) {
            throw new Error(
              "Approved exception has no saved batch allocations"
            );
          }

          const total = proposed.reduce(
            (sum, allocation) => sum + allocation.quantity,
            0
          );

          if (
            Math.abs(total - item.requestedQuantity) > 0.000001
          ) {
            throw new Error(
              "Exception allocation does not match requested quantity"
            );
          }

          const seenBatches = new Set();
          allocations = [];

          for (const allocation of proposed) {
            const batchId = String(allocation.batch);

            if (seenBatches.has(batchId)) {
              throw new Error(
                "Duplicate batch found in exception allocations"
              );
            }

            seenBatches.add(batchId);

            if (
              allocation.unit !== item.unit ||
              !Number.isFinite(allocation.quantity) ||
              allocation.quantity <= 0
            ) {
              throw new Error(
                "Invalid approved exception allocation"
              );
            }

            // Atomic stock check and deduction inside the transaction.
            const updatedBatch = await StockBatch.findOneAndUpdate(
              {
                _id: allocation.batch,
                godown: challan.godown,
                commodity: item.commodity,
                unit: item.unit,
                qualityStatus: "approved",
                status: "available",
                remainingQuantity: {
                  $gte: allocation.quantity,
                },
              },
              {
                $inc: {
                  remainingQuantity: -allocation.quantity,
                },
              },
              {
                new: true,
                runValidators: true,
                session,
              }
            );

            if (!updatedBatch) {
              throw new Error(
                "An approved exception batch is no longer eligible or has insufficient stock"
              );
            }

            if (updatedBatch.remainingQuantity === 0) {
              updatedBatch.status = "depleted";
              await updatedBatch.save({ session });
            }

            allocations.push({
              batch: updatedBatch._id,
              quantity: allocation.quantity,
              unit: allocation.unit,
            });
          }
        } else {
          // No approved exception: use standard FIFO.
          allocations = await allocateFIFO({
            godownId: challan.godown,
            commodityId: item.commodity,
            requestedQuantity: item.requestedQuantity,
            unit: item.unit,
            session,
          });
        }

        item.allocations = allocations;

        await StockMovement.create(
          allocations.map((allocation) => ({
            movementType: "dispatch",
            batch: allocation.batch,
            commodity: item.commodity,
            godown: challan.godown,
            quantity: allocation.quantity,
            unit: allocation.unit,
            direction: "out",
            challan: challan._id,
            performedBy: req.user._id,
            reason:
              challan.exceptionStatus === "approved"
                ? "Approved exception challan dispatch"
                : "Approved delivery challan dispatch",
          })),
          { session }
        );
      }

      // Prevent duplicate dispatches.
      const updated = await DeliveryChallan.findOneAndUpdate(
        {
          _id: challan._id,
          status: "approved",
          exceptionStatus: challan.exceptionStatus,
        },
        {
          $set: {
            status: "dispatched",
            dispatchedAt: new Date(),
            items: challan.items,
          },
        },
        {
          new: true,
          runValidators: true,
          session,
        }
      );

      if (!updated) {
        throw new Error(
          "Challan status changed. Please retry."
        );
      }

      dispatchedChallan = updated;
    });

    return res.status(200).json({
      success: true,
      message:
        "Challan dispatched and stock updated successfully",
      challan: dispatchedChallan,
    });
  } catch (error) {
    console.error("Dispatch challan error:", error);

    const clientError =
      /not found|approved|cannot dispatch|assigned|Insufficient|Stock changed|Invalid|status changed|exception|allocation|batch|eligible|quantity|duplicate/i.test(
        error.message
      );

    return res.status(clientError ? 400 : 500).json({
      success: false,
      message: error.message || "Failed to dispatch challan",
    });
  } finally {
    await session.endSession();
  }
};

// 4. Mark a dispatched challan as delivered.
const deliverChallan = async (req, res) => {
  try {
    const { challanId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(challanId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid challan ID",
      });
    }

    const filter = {
      _id: challanId,
      status: "dispatched",
    };

    if (req.user.role !== "admin") {
      if (!req.user.assignedGodown) {
        return res.status(403).json({
          success: false,
          message: "No godown is assigned to your account",
        });
      }

      filter.godown = req.user.assignedGodown;
    }

    const challan = await DeliveryChallan.findOneAndUpdate(
      filter,
      {
        $set: {
          status: "delivered",
          deliveredAt: new Date(),
        },
      },
      { new: true, runValidators: true }
    );

    if (!challan) {
      return res.status(409).json({
        success: false,
        message: "Challan not found or is not dispatched",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Challan marked as delivered",
      challan,
    });
  } catch (error) {
    console.error("Deliver challan error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to mark challan as delivered",
    });
  }
};

const requestChallanException = async (req, res) => {
  try {
    const { challanId } = req.params;
    const { exceptionReason, items } = req.body;

    if (!mongoose.Types.ObjectId.isValid(challanId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid challan ID",
      });
    }

    if (
      typeof exceptionReason !== "string" ||
      !exceptionReason.trim() ||
      exceptionReason.trim().length > 1000
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid exception reason (max 1000 characters) is required",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Proposed allocations are required for each challan item",
      });
    }

    const filter = {
      _id: challanId,
      status: "draft",
      exceptionStatus: "not_requested",
    };

    if (req.user.role !== "admin") {
      if (!req.user.assignedGodown) {
        return res.status(403).json({
          success: false,
          message: "No godown is assigned to your account",
        });
      }

      filter.godown = req.user.assignedGodown;
    }

    const challan = await DeliveryChallan.findOne(filter);

    if (!challan) {
      return res.status(409).json({
        success: false,
        message: "Draft challan not found or an exception was already requested",
      });
    }

    if (items.length !== challan.items.length) {
      return res.status(400).json({
        success: false,
        message: "Proposed allocations must match all challan items",
      });
    }

    const proposedByCommodity = new Map();

    for (const item of items) {
      if (
        !item ||
        !mongoose.Types.ObjectId.isValid(item.commodity) ||
        !Array.isArray(item.allocations) ||
        item.allocations.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Each item needs a valid commodity and batch allocations",
        });
      }

      const commodityKey = String(item.commodity);

      if (proposedByCommodity.has(commodityKey)) {
        return res.status(400).json({
          success: false,
          message: "Duplicate commodity in proposed allocations",
        });
      }

      proposedByCommodity.set(commodityKey, item.allocations);
    }

    const proposedItems = [];

    for (const challanItem of challan.items) {
      const commodityKey = String(challanItem.commodity);
      const proposed = proposedByCommodity.get(commodityKey);

      if (!proposed) {
        return res.status(400).json({
          success: false,
          message: "A challan commodity is missing from proposed allocations",
        });
      }

      let totalQuantity = 0;
      const seenBatches = new Set();
      const validatedAllocations = [];

      for (const allocation of proposed) {
        if (
          !allocation ||
          !mongoose.Types.ObjectId.isValid(allocation.batch) ||
          !Number.isFinite(allocation.quantity) ||
          allocation.quantity <= 0 ||
          allocation.unit !== challanItem.unit
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid proposed batch, quantity, or unit",
          });
        }

        const batchId = String(allocation.batch);

        if (seenBatches.has(batchId)) {
          return res.status(400).json({
            success: false,
            message: "A batch cannot be repeated for the same item",
          });
        }

        seenBatches.add(batchId);

        const batch = await StockBatch.findOne({
          _id: allocation.batch,
          godown: challan.godown,
          commodity: challanItem.commodity,
          unit: challanItem.unit,
          qualityStatus: "approved",
          status: "available",
          remainingQuantity: { $gt: 0 },
        });

        if (!batch) {
          return res.status(400).json({
            success: false,
            message: "A proposed batch is not eligible for this challan",
          });
        }

        if (allocation.quantity > batch.remainingQuantity) {
          return res.status(400).json({
            success: false,
            message: "Proposed quantity exceeds current batch stock",
          });
        }

        totalQuantity += allocation.quantity;

        validatedAllocations.push({
          batch: batch._id,
          quantity: allocation.quantity,
          unit: allocation.unit,
        });
      }

      if (Math.abs(totalQuantity - challanItem.requestedQuantity) > 0.000001) {
        return res.status(400).json({
          success: false,
          message: "Proposed quantities must equal the requested quantity",
        });
      }

      proposedItems.push({
        commodity: challanItem.commodity,
        allocations: validatedAllocations,
      });
    }

    // Atomic conditional update prevents duplicate exception requests.
    const updatedChallan = await DeliveryChallan.findOneAndUpdate(
      {
        _id: challan._id,
        status: "draft",
        exceptionStatus: "not_requested",
      },
      {
        $set: {
          exceptionReason: exceptionReason.trim(),
          exceptionStatus: "pending",
          exceptionRequestedBy: req.user._id,
          exceptionRequestedAt: new Date(),
          exceptionReviewedAt: null,
          exceptionReviewNote: "",
          exceptionApprovedBy: null,
          items: challan.items.map((item) => {
            const proposed = proposedItems.find(
              (entry) =>
                String(entry.commodity) === String(item.commodity)
            );

            return {
              ...item.toObject(),
              exceptionAllocations: proposed.allocations,
            };
          }),
        },
      },
      { new: true, runValidators: true }
    );

    if (!updatedChallan) {
      return res.status(409).json({
        success: false,
        message: "Challan changed while submitting the exception request",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Exception request submitted for approval",
      challan: updatedChallan,
    });
  } catch (error) {
    console.error("Request challan exception error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to submit exception request",
    });
  }
};





const reviewChallanException = async (req, res) => {
  try {
    const { challanId } = req.params;
    const { decision, reviewNote } = req.body;

    if (!mongoose.Types.ObjectId.isValid(challanId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid challan ID",
      });
    }

    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: "Decision must be approved or rejected",
      });
    }

    if (
      reviewNote !== undefined &&
      (typeof reviewNote !== "string" || reviewNote.length > 1000)
    ) {
      return res.status(400).json({
        success: false,
        message: "Review note must be a string of at most 1000 characters",
      });
    }

    const filter = {
  _id: challanId,
  status: "draft",
  exceptionStatus: "pending",
};

if (req.user.role !== "admin") {
  if (!req.user.assignedGodown) {
    return res.status(403).json({
      success: false,
      message: "No godown is assigned to your account",
    });
  }

  filter.godown = req.user.assignedGodown;
}


    const challan = await DeliveryChallan.findOneAndUpdate(
     filter,
      {
        $set: {
          exceptionStatus: decision,
          exceptionApprovedBy:
            decision === "approved" ? req.user._id : null,
          exceptionReviewedAt: new Date(),
          exceptionReviewNote: (reviewNote || "").trim(),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!challan) {
      return res.status(409).json({
        success: false,
        message: "Challan not found or its exception is no longer pending",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Exception request ${decision} successfully`,
      challan,
    });
  } catch (error) {
    console.error("Review challan exception error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to review exception request",
    });
  }
};


module.exports = {
  createChallan,
  approveChallan,
  dispatchChallan,
  deliverChallan,
  requestChallanException,
  reviewChallanException,
};
