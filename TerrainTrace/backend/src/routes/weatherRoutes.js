const express = require("express");

const {
  getWeatherForecast,
} = require("../services/weatherForecastService");

const {
  getRiskForecast,
} = require("../services/riskForecastService");

const router = express.Router();

const LAT_MIN = 21;
const LAT_MAX = 34;
const LON_MIN = 75;
const LON_MAX = 98;

function validateCoordinate(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

function validateNERLocation(
  lat,
  lon
) {
  return (
    lat >= LAT_MIN &&
    lat <= LAT_MAX &&
    lon >= LON_MIN &&
    lon <= LON_MAX
  );
}

router.get(
  "/forecast",
  async (req, res) => {
    try {
      const lat = Number(
        req.query.lat
      );

      const lon = Number(
        req.query.lon
      );

      if (
        !validateCoordinate(lat) ||
        !validateCoordinate(lon)
      ) {
        return res.status(400).json({
          error:
            "lat and lon must be valid numbers",
        });
      }

      if (
        !validateNERLocation(
          lat,
          lon
        )
      ) {
        return res.status(400).json({
          error:
            "Location is outside the supported NER region",
        });
      }

      const weather =
        await getWeatherForecast(
          lat,
          lon
        );

      return res.json(weather);
    } catch (error) {
      console.error(
        "Weather forecast error:",
        error.response?.data ||
          error.message
      );

      return res.status(500).json({
        error:
          "Failed to fetch weather forecast",
      });
    }
  }
);

router.get(
  "/risk-forecast",
  async (req, res) => {
    try {
      const lat = Number(
        req.query.lat
      );

      const lon = Number(
        req.query.lon
      );

      if (
        !validateCoordinate(lat) ||
        !validateCoordinate(lon)
      ) {
        return res.status(400).json({
          error:
            "lat and lon must be valid numbers",
        });
      }

      if (
        !validateNERLocation(
          lat,
          lon
        )
      ) {
        return res.status(400).json({
          error:
            "Location is outside the supported NER region",
        });
      }

      console.log(
        `Generating 7-day risk forecast for ${lat},${lon}`
      );

      const forecast =
        await getRiskForecast(
          lat,
          lon
        );

      return res.json(forecast);
    } catch (error) {
      console.error(
        "Risk forecast error:",
        error.response?.data ||
          error.message
      );

      return res.status(500).json({
        error:
          error.message ||
          "Failed to generate landslide risk forecast",
      });
    }
  }
);

module.exports = router;