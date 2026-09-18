const express = require("express");
const cors = require("cors");
require("dotenv").config();

const riskRoutes = require("./routes/riskRoutes");
const {
  warmupFaults,
} = require("./services/environmental/faultService");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "TerrainTrace Backend",
  });
});

app.use("/api/risk", riskRoutes);

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    console.log("Warming GEM fault spatial index...");
    await warmupFaults();
  } catch (error) {
    console.error(
      "Fault index warmup failed:",
      error.message
    );
  }

  app.listen(PORT, () => {
    console.log(
      `Backend running on http://localhost:${PORT}`
    );
  });
}

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

startServer();
