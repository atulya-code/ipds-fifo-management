
const mongoose = require("mongoose");

const godownSchema = new mongoose.Schema(
  {
    godownCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    address: {
      type: String,
      required: true,
      trim: true,
    },

    district: {
      type: String,
      required: true,
      trim: true,
    },

    state: {
      type: String,
      required: true,
      trim: true,
    },

    capacity: {
      type: Number,
      required: true,
      min: 0.001,
    },

    capacityUnit: {
      type: String,
      enum: ["kg", "quintal", "tonne"],
      default: "tonne",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Godown", godownSchema);
