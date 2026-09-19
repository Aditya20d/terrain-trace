const fs = require("fs");
const path = require("path");

const STATIC_FILE = path.join(
  __dirname,
  "../../data/static-features/ne_static_terrain.json"
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
    return null;
  }

  staticData = JSON.parse(
    fs.readFileSync(
      STATIC_FILE,
      "utf8"
    )
  );

  if (
    !Number.isFinite(
      staticData.step
    ) ||
    !Number.isFinite(
      staticData.originLat
    ) ||
    !Number.isFinite(
      staticData.originLon
    ) ||
    !Array.isArray(
      staticData.points
    )
  ) {
    throw new Error(
      `Invalid static terrain grid: ${STATIC_FILE}`
    );
  }

  staticMap = new Map();

  for (const point of staticData.points) {
    staticMap.set(
      pointKey(
        point.row,
        point.col
      ),
      point
    );
  }

  console.log(
    `Loaded static terrain grid: ${staticData.points.length} points`
  );

  return staticData;
}

function getStaticTerrain(
  lat,
  lon
) {
  const data =
    loadStaticData();

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

  return (
    staticMap.get(
      pointKey(row, col)
    ) || null
  );
}

function getStaticTerrainBatch(
  points
) {
  const data =
    loadStaticData();

  if (!data) {
    return {
      available: false,
      results: null,
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
      const staticPoint =
        getStaticTerrain(
          point.lat,
          point.lon
        );

      if (!staticPoint) {
        missingIndices.push(
          index
        );
        return;
      }

      results[index] = {
        elevation_m:
          staticPoint.elevation_m,
        slope_deg:
          staticPoint.slope_deg,
        fault_distance_m:
          staticPoint.fault_distance_m,
      };
    }
  );

  return {
    available: true,
    results,
    missingIndices,
  };
}

function getStaticTerrainStatus() {
  const data =
    loadStaticData();

  return {
    available: Boolean(data),
    file: STATIC_FILE,
    pointCount:
      data?.points?.length || 0,
    step: data?.step || null,
    generatedAt:
      data?.generatedAt || null,
  };
}

module.exports = {
  getStaticTerrain,
  getStaticTerrainBatch,
  getStaticTerrainStatus,
};
