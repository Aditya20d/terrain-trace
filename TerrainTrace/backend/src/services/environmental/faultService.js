const axios = require("axios");
const fs = require("fs");
const path = require("path");
const proj4 = require("proj4");
const RBush = require("rbush").default;

const FAULT_URL =
  "https://raw.githubusercontent.com/GEMScienceTools/gem-global-active-faults/master/geojson/gem_active_faults.geojson";

const CACHE_DIR = path.join(
  __dirname,
  "../../../data/faults"
);

const CACHE_FILE = path.join(
  CACHE_DIR,
  "gem_active_faults.geojson"
);

const WGS84 =
  "+proj=longlat +datum=WGS84 +no_defs";
const UTM45N =
  "+proj=utm +zone=45 +datum=WGS84 +units=m +no_defs";

let faultIndex = null;
let faultLoadPromise = null;

function ensureCacheDirectory() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

async function loadFaults() {
  if (faultIndex) return;
  if (faultLoadPromise) return faultLoadPromise;

  faultLoadPromise = initializeFaultIndex().finally(() => {
    faultLoadPromise = null;
  });

  return faultLoadPromise;
}

async function initializeFaultIndex() {
  const start = Date.now();
  ensureCacheDirectory();

  let geojson;

  if (fs.existsSync(CACHE_FILE)) {
    console.log("Loading GEM faults from cache...");
    geojson = JSON.parse(
      await fs.promises.readFile(CACHE_FILE, "utf8")
    );
  } else {
    console.log("Downloading GEM active faults...");
    const response = await axios.get(FAULT_URL, {
      timeout: 60000,
    });
    geojson = response.data;
    await fs.promises.writeFile(
      CACHE_FILE,
      JSON.stringify(geojson)
    );
    console.log("GEM faults cached.");
  }

  const tree = new RBush();
  const segments = [];
  const features = geojson.features || [];

  console.log(
    `Preparing ${features.length} fault features...`
  );

  for (const fault of features) {
    if (!fault.geometry) continue;

    if (fault.geometry.type === "LineString") {
      addLineSegments(
        fault.geometry.coordinates,
        segments
      );
    } else if (
      fault.geometry.type === "MultiLineString"
    ) {
      for (const line of fault.geometry.coordinates) {
        addLineSegments(line, segments);
      }
    }
  }

  console.log(
    `Building fault spatial index from ${segments.length} segments...`
  );
  tree.load(segments);
  faultIndex = tree;

  console.log(
    `Fault spatial index ready with ${segments.length} segments.`
  );
  console.log(
    `Fault initialization: ${Date.now() - start}ms`
  );
}

function toUtm(lon, lat) {
  return proj4(WGS84, UTM45N, [lon, lat]);
}

function addLineSegments(coordinates, segments) {
  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const [x1, y1] = toUtm(
      coordinates[i][0],
      coordinates[i][1]
    );
    const [x2, y2] = toUtm(
      coordinates[i + 1][0],
      coordinates[i + 1][1]
    );

    segments.push({
      minX: Math.min(x1, x2),
      minY: Math.min(y1, y2),
      maxX: Math.max(x1, x2),
      maxY: Math.max(y1, y2),
      x1,
      y1,
      x2,
      y2,
    });
  }
}

function pointToSegmentDistance(
  px,
  py,
  x1,
  y1,
  x2,
  y2
) {
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    return Math.sqrt(
      (px - x1) ** 2 + (py - y1) ** 2
    );
  }

  const t =
    ((px - x1) * dx +
      (py - y1) * dy) /
    (dx * dx + dy * dy);

  const clampedT = Math.max(
    0,
    Math.min(1, t)
  );

  const closestX = x1 + clampedT * dx;
  const closestY = y1 + clampedT * dy;

  return Math.sqrt(
    (px - closestX) ** 2 +
      (py - closestY) ** 2
  );
}

function findFaultDistance(lat, lon) {
  const [px, py] = toUtm(lon, lat);
  const radii = [5000, 10000, 25000, 50000, 100000];

  for (const radius of radii) {
    const candidates = faultIndex.search({
      minX: px - radius,
      minY: py - radius,
      maxX: px + radius,
      maxY: py + radius,
    });

    if (candidates.length === 0) continue;

    let minimumDistance = Infinity;

    for (const segment of candidates) {
      const distance = pointToSegmentDistance(
        px,
        py,
        segment.x1,
        segment.y1,
        segment.x2,
        segment.y2
      );

      if (distance < minimumDistance) {
        minimumDistance = distance;
      }
    }

    return {
      fault_distance_m: Number.isFinite(minimumDistance)
        ? minimumDistance
        : null,
    };
  }

  return { fault_distance_m: null };
}

async function getFaultDistance(lat, lon) {
  await loadFaults();
  return findFaultDistance(lat, lon);
}

async function getFaultDistanceBatch(points) {
  await loadFaults();
  return points.map((point) =>
    findFaultDistance(point.lat, point.lon)
  );
}

async function warmupFaults() {
  await loadFaults();
}

module.exports = {
  getFaultDistance,
  getFaultDistanceBatch,
  warmupFaults,
};
