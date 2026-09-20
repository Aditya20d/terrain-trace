const express = require("express");
const cors = require("cors");
require("dotenv").config();

const riskRoutes = require("./routes/riskRoutes");
const weatherRoutes = require("./routes/weatherRoutes");
const roadRoutes = require("./routes/roadRoutes");

const {
  getStaticTerrainStatus,
} = require("./services/staticFeatureService");

const {
  getFaultDistance,
} = require("./services/environmental/faultService");

const app = express();

const configuredOrigin =
  process.env.FRONTEND_ORIGIN;

app.use(
  cors(
    configuredOrigin
      ? {
          origin: configuredOrigin,
        }
      : undefined
  )
);

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "TerrainTrace Backend",
    staticTerrain:
      getStaticTerrainStatus(),
  });
});

app.use(
  "/api/risk",
  riskRoutes
);

app.use(
  "/api/weather",
  weatherRoutes
);

app.use("/api/roads", roadRoutes);

const PORT =
  Number(process.env.PORT) || 5000;

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Backend running on port ${PORT}`
    );

    // Warm the fault index once so the first request
    // does not pay the initialization cost.
    if (
      process.env.WARM_FAULT_INDEX !==
      "false"
    ) {
      console.log(
        "Warming GEM fault spatial index..."
      );

      getFaultDistance(
        27.25,
        86.75
      ).catch(
        (error) => {
          console.error(
            "Fault index warm-up failed:",
            error.message
          );
        }
      );
    }
  }
);