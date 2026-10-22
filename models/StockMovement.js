
const mongoose = require("mongoose");

const stockMovementSchema = new mongoose.Schema(
  {
    movementType: {
      type: String,
      enum: ["receipt", "dispatch", "adjustment", "return"],
      required: true,
    },

    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockBatch",
      required: true,
    },

    commodity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Commodity",
      required: true,
    },

    godown: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Godown",
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0.001,
    },

    unit: {
      type: String,
      enum: ["kg", "quintal", "tonne", "litre"],
      required: true,
    },

    direction: {
      type: String,
      enum: ["in", "out"],
      required: true,
    },

    challan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryChallan",
      default: null,
    },

    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    reason: {
      type: String,
      trim: true,
      default: "",
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

stockMovementSchema.index({ godown: 1, commodity: 1, createdAt: -1 });
stockMovementSchema.index({ batch: 1, createdAt: -1 });
stockMovementSchema.index({ challan: 1 });

module.exports = mongoose.model("StockMovement", stockMovementSchema);
