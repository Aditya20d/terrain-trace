const express = require("express");

const {
  getRoads,
} = require("../services/roadService");

const {
  getRoadRisk,
} = require("../services/roadRiskService");

const router = express.Router();

// Normal road data
router.get("/", async (req, res) => {
  try {
    const {
      north,
      south,
      east,
      west,
    } = req.query;

    const result = await getRoads({
      north,
      south,
      east,
      west,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error(
      "Road connectivity error:",
      error.message
    );

    res.status(400).json({
      success: false,
      error:
        error.message ||
        "Failed to fetch road network.",
    });
  }
});

// AI landslide risk along roads
router.get("/risk", async (req, res) => {
  try {
    const {
      north,
      south,
      east,
      west,
    } = req.query;

    const result = await getRoadRisk({
      north,
      south,
      east,
      west,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error(
      "Road risk error:",
      error.message
    );

    res.status(400).json({
      success: false,
      error:
        error.message ||
        "Failed to calculate road landslide risk.",
    });
  }
});

module.exports = router;