
const mongoose = require("mongoose");

const allocationSchema = new mongoose.Schema(
  {
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockBatch",
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
  },
  { _id: false }
);

const challanItemSchema = new mongoose.Schema(
  {
    commodity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Commodity",
      required: true,
    },

    requestedQuantity: {
      type: Number,
      required: true,
      min: 0.001,
    },

    unit: {
      type: String,
      enum: ["kg", "quintal", "tonne", "litre"],
      required: true,
    },

    // Normal FIFO allocation
    allocations: {
      type: [allocationSchema],
      validate: {
        validator: function (allocations) {
          return allocations.length > 0;
        },
        message:
          "Each challan item must have at least one batch allocation.",
      },
    },

    // Proposed allocation when requesting an exception to FIFO
    exceptionAllocations: {
      type: [allocationSchema],
      default: [],
    },
  },
  { _id: false }
);

const deliveryChallanSchema = new mongoose.Schema(
  {
    challanNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },

    godown: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Godown",
      required: true,
    },

    fps: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FPS",
      required: true,
    },

    items: {
      type: [challanItemSchema],
      required: true,
      validate: {
        validator: function (items) {
          return items.length > 0;
        },
        message:
          "A delivery challan must contain at least one item.",
      },
    },

    status: {
      type: String,
      enum: [
        "draft",
        "approved",
        "dispatched",
        "delivered",
        "cancelled",
      ],
      default: "draft",
    },

    // Exception request details
    exceptionReason: {
      type: String,
      trim: true,
      default: "",
    },

    exceptionStatus: {
      type: String,
      enum: [
        "not_requested",
        "pending",
        "approved",
        "rejected",
      ],
      default: "not_requested",
    },

    exceptionRequestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    exceptionRequestedAt: {
      type: Date,
      default: null,
    },

    exceptionReviewedAt: {
      type: Date,
      default: null,
    },

    exceptionReviewNote: {
      type: String,
      trim: true,
      default: "",
    },

    exceptionApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Challan creator
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Dispatch and delivery timestamps
    dispatchedAt: {
      type: Date,
      default: null,
    },

    deliveredAt: {
      type: Date,
      default: null,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "DeliveryChallan",
  deliveryChallanSchema
);
