
const mongoose = require("mongoose");

const commoditySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      enum: [
        "rice",
        "wheat",
        "salt",
        "sugar",
        "oil",
        "chana",
        "tuvar_dal",
      ],
    },

    defaultUnit: {
      type: String,
      enum: ["kg", "quintal", "tonne", "litre"],
      required: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Commodity", commoditySchema);
