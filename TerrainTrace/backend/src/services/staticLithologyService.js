const fs = require("fs");
const path = require("path");

const STATIC_FILE = path.join(
  __dirname,
  "../../data/static-features/ne_static_lithology.json"
);

let staticData = null;
let staticMap = null;

function pointKey(row, col) {
  return `${row}:${col}`;
}

function loadStaticData() {
  if (staticData) {
    return staticData;
  }

  if (!fs.existsSync(STATIC_FILE)) {
    console.warn(
      `Static lithology file not found: ${STATIC_FILE}`
    );

    return null;
  }

  staticData = JSON.parse(
    fs.readFileSync(STATIC_FILE, "utf8")
  );

  if (
    !Number.isFinite(staticData.step) ||
    !Number.isFinite(staticData.originLat) ||
    !Number.isFinite(staticData.originLon) ||
    !Array.isArray(staticData.points)
  ) {
    throw new Error(
      `Invalid static lithology grid: ${STATIC_FILE}`
    );
  }

  staticMap = new Map();

  for (const point of staticData.points) {
    staticMap.set(
      pointKey(point.row, point.col),
      point
    );
  }

  console.log(
    `Loaded static lithology grid: ${staticData.points.length} points`
  );

  return staticData;
}

function getStaticLithology(lat, lon) {
  const data = loadStaticData();

  if (!data) {
    return null;
  }

  const row = Math.round(
    (lat - data.originLat) /
      data.step
  );

  const col = Math.round(
    (lon - data.originLon) /
      data.step
  );

  const point = staticMap.get(
    pointKey(row, col)
  );

  if (!point) {
    return null;
  }

  return {
    lithology:
      String(point.lithology || "unknown")
        .trim()
        .toLowerCase(),
  };
}

function getStaticLithologyBatch(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return {
      available: false,
      results: [],
      missingIndices: [],
    };
  }

  const data = loadStaticData();

  if (!data) {
    return {
      available: false,
      results: new Array(points.length),
      missingIndices: points.map(
        (_, index) => index
      ),
    };
  }

  const results =
    new Array(points.length);

  const missingIndices = [];

  points.forEach(
    (point, index) => {
      const lithology =
        getStaticLithology(
          point.lat,
          point.lon
        );

      if (!lithology) {
        missingIndices.push(index);
        return;
      }

      results[index] = lithology;
    }
  );

  return {
    available: true,
    results,
    missingIndices,
  };
}

function getStaticLithologyStatus() {
  const data = loadStaticData();

  return {
    available: Boolean(data),
    file: STATIC_FILE,
    pointCount:
      data?.points?.length || 0,
    step:
      data?.step || null,
    generatedAt:
      data?.generatedAt || null,
  };
}

module.exports = {
  getStaticLithology,
  getStaticLithologyBatch,
  getStaticLithologyStatus,
};
