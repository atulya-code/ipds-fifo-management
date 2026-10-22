
const mongoose = require("mongoose");

const stockBatchSchema = new mongoose.Schema(
  {
    batchNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    commodity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Commodity",
      required: true,
    },

    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
    },

    godown: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Godown",
      required: true,
    },

    receiptDate: {
      type: Date,
      required: true,
    },

    quantityReceived: {
      type: Number,
      required: true,
      min: 0.001,
    },

    remainingQuantity: {
      type: Number,
      required: true,
      min: 0,
    },

    unit: {
      type: String,
      enum: ["kg", "quintal", "tonne", "litre"],
      required: true,
    },

    expiryDate: {
      type: Date,
      default: null,
    },

    qualityStatus: {
      type: String,
      enum: ["pending", "approved", "hold", "rejected"],
      default: "pending",
    },

    status: {
      type: String,
      enum: ["available", "depleted", "blocked"],
      default: "available",
    },

    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

stockBatchSchema.index(
  { godown: 1, batchNumber: 1 },
  { unique: true }
);

stockBatchSchema.index({
  godown: 1,
  commodity: 1,
  qualityStatus: 1,
  status: 1,
  receiptDate: 1,
});

module.exports = mongoose.model("StockBatch", stockBatchSchema);
