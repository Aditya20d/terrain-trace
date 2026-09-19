const fs = require("fs");
const path = require("path");
const axios = require("axios");

const INPUT_FILE = path.join(
  __dirname,
  "../data/static-features/ne_static_terrain.json"
);

const OUTPUT_FILE = path.join(
  __dirname,
  "../data/static-features/ne_static_lithology.json"
);

const MACROSTRAT_URL =
  "https://macrostrat.org/api/v2/geologic_units/map";

const CONCURRENCY = 5;
const SAVE_EVERY = 50;
const REQUEST_TIMEOUT = 15000;
const MAX_RETRIES = 3;

function pointKey(point) {
  return `${Number(point.lat).toFixed(4)},${Number(point.lon).toFixed(4)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLithology(lat, lon) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(MACROSTRAT_URL, {
        params: {
          lat,
          lng: lon,
        },
        timeout: REQUEST_TIMEOUT,
      });

      const data = response.data?.success?.data;

      if (!Array.isArray(data) || data.length === 0) {
        return "unknown";
      }

      return String(data[0]?.lith || "unknown")
        .trim()
        .toLowerCase();
    } catch (error) {
      const status = error.response?.status;

      console.warn(
        `Lithology failed ${lat},${lon} ` +
          `(attempt ${attempt}/${MAX_RETRIES})` +
          (status ? ` HTTP ${status}` : "")
      );

      if (attempt < MAX_RETRIES) {
        await sleep(1000 * attempt);
      }
    }
  }

  return "unknown";
}

function writeOutput(points, metadata, complete) {
  const output = {
    version: "v1",
    source: "Macrostrat",
    step: metadata.step,
    originLat: metadata.originLat,
    originLon: metadata.originLon,
    boundaryFile: metadata.boundaryFile,
    generatedAt: new Date().toISOString(),
    complete,
    points,
  };

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(output),
    "utf8"
  );
}

async function main() {
  console.log("Loading static terrain grid...");

  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Input file not found: ${INPUT_FILE}`);
  }

  const terrain = JSON.parse(
    fs.readFileSync(INPUT_FILE, "utf8")
  );

  if (!Array.isArray(terrain.points)) {
    throw new Error("terrain.points is not an array");
  }

  const terrainPoints = terrain.points;

  console.log(`Terrain points: ${terrainPoints.length}`);

  // Resume from an existing partial/static file.
  let existingPoints = [];

  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const existing = JSON.parse(
        fs.readFileSync(OUTPUT_FILE, "utf8")
      );

      if (Array.isArray(existing.points)) {
        existingPoints = existing.points;
        console.log(
          `Existing lithology points found: ${existingPoints.length}`
        );
      }
    } catch (error) {
      console.warn(
        "Existing lithology file could not be parsed. Starting fresh."
      );
    }
  }

  const completed = new Map();

  for (const point of existingPoints) {
    completed.set(pointKey(point), point);
  }

  const missing = terrainPoints.filter(
    (point) => !completed.has(pointKey(point))
  );

  console.log(`Already completed: ${completed.size}`);
  console.log(`Remaining: ${missing.length}`);

  let nextIndex = 0;
  let processedSinceSave = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;

      if (index >= missing.length) {
        return;
      }

      const point = missing[index];
      const key = pointKey(point);

      console.log(
        `[${index + 1}/${missing.length}] ` +
          `Fetching lithology: ${key}`
      );

      const lithology = await fetchLithology(
        point.lat,
        point.lon
      );

      completed.set(key, {
        row: point.row,
        col: point.col,
        lat: point.lat,
        lon: point.lon,
        lithology,
      });

      processedSinceSave++;

      if (processedSinceSave >= SAVE_EVERY) {
        processedSinceSave = 0;

        writeOutput(
          Array.from(completed.values()),
          terrain,
          false
        );

        console.log(
          `Checkpoint saved: ${completed.size}/${terrainPoints.length}`
        );
      }
    }
  }

  const workerCount = Math.min(
    CONCURRENCY,
    missing.length
  );

  await Promise.all(
    Array.from(
      { length: workerCount },
      () => worker()
    )
  );

  const finalPoints = terrainPoints.map((point) => {
    return (
      completed.get(pointKey(point)) || {
        row: point.row,
        col: point.col,
        lat: point.lat,
        lon: point.lon,
        lithology: "unknown",
      }
    );
  });

  writeOutput(finalPoints, terrain, true);

  const counts = {};

  for (const point of finalPoints) {
    counts[point.lithology] =
      (counts[point.lithology] || 0) + 1;
  }

  console.log("");
  console.log("======================================");
  console.log("Static lithology preprocessing complete");
  console.log("======================================");
  console.log(`Total points: ${finalPoints.length}`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log("");
  console.log("Lithology counts:");

  for (const [name, count] of Object.entries(counts)) {
    console.log(`  ${name}: ${count}`);
  }
}

main().catch((error) => {
  console.error("");
  console.error("Static lithology preprocessing failed:");
  console.error(error);
  process.exit(1);
});