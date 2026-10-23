
const Commodity = require("../models/Commodity");
const FPS = require("../models/FPS");
const Supplier = require("../models/Supplier");
const Godown = require("../models/Godown");

const getActiveCommodities = async (req, res) => {
  try {
    const commodities = await Commodity.find({ isActive: true })
      .select("name defaultUnit")
      .sort({ name: 1 });

    return res.status(200).json({
      success: true,
      commodities,
    });
  } catch (error) {
    console.error("Get commodities error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch commodities",
    });
  }
};

const getActiveFPS = async (req, res) => {
  try {
    const fpsList = await FPS.find({ isActive: true })
      .select("fpsCode name district state")
      .sort({ name: 1 });

    return res.status(200).json({
      success: true,
      fpsList,
    });
  } catch (error) {
    console.error("Get FPS error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch FPS shops",
    });
  }
};

const getActiveSuppliers = async (req, res) => {
  try {
    const suppliers = await Supplier.find({ isActive: true })
      .select("supplierCode name")
      .sort({ name: 1 });

    return res.status(200).json({
      success: true,
      suppliers,
    });
  } catch (error) {
    console.error("Get suppliers error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch suppliers",
    });
  }
};

const getActiveGodowns = async (req, res) => {
  try {
    const filter = { isActive: true };

    if (req.user.role !== "admin") {
      if (!req.user.assignedGodown) {
        return res.status(200).json({
          success: true,
          godowns: [],
        });
      }

      filter._id = req.user.assignedGodown;
    }

    const godowns = await Godown.find(filter)
      .select("godownCode name district state")
      .sort({ name: 1 });

    return res.status(200).json({
      success: true,
      godowns,
    });
  } catch (error) {
    console.error("Get godowns error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch godowns",
    });
  }
};

module.exports = {
  getActiveCommodities,
  getActiveFPS,
  getActiveSuppliers,
  getActiveGodowns,
};
