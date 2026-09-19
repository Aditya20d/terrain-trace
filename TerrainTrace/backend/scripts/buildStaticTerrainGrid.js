const fs = require("fs");
const path = require("path");

const {
  getElevationAndSlopeBatch,
} = require("../src/services/environmental/demService");

const {
  getFaultDistanceBatch,
} = require("../src/services/environmental/faultService");

// Static grid resolution.
// 0.05° gives roughly 4x the grid density of the previous 0.1° grid.
const GRID_STEP = Number(
  process.env.STATIC_GRID_STEP || 0.05
);

const BOUNDARY_FILE = path.join(
  __dirname,
  "../../frontend/public/data/northeast_states.geojson"
);

const OUTPUT_DIR = path.join(
  __dirname,
  "../data/static-features"
);

const OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  "ne_static_terrain.json"
);

const TEMP_FILE = path.join(
  OUTPUT_DIR,
  "ne_static_terrain.partial.json"
);

// Process the grid in manageable chunks.
const CHUNK_SIZE = 500;

function pointInRing(lon, lat, ring) {
  let inside = false;

  for (
    let i = 0, j = ring.length - 1;
    i < ring.length;
    j = i++
  ) {
    const xi = ring[i][0];
    const yi = ring[i][1];

    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersects =
      yi > lat !== yj > lat &&
      lon <
        ((xj - xi) * (lat - yi)) /
          (yj - yi || Number.EPSILON) +
          xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInPolygon(lon, lat, rings) {
  if (
    !Array.isArray(rings) ||
    rings.length === 0
  ) {
    return false;
  }

  // Point must be inside the outer ring.
  if (
    !pointInRing(
      lon,
      lat,
      rings[0]
    )
  ) {
    return false;
  }

  // Point must not be inside any hole.
  for (
    let i = 1;
    i < rings.length;
    i += 1
  ) {
    if (
      pointInRing(
        lon,
        lat,
        rings[i]
      )
    ) {
      return false;
    }
  }

  return true;
}

function pointInGeometry(
  lon,
  lat,
  geometry
) {
  if (!geometry) {
    return false;
  }

  if (
    geometry.type ===
    "Polygon"
  ) {
    return pointInPolygon(
      lon,
      lat,
      geometry.coordinates
    );
  }

  if (
    geometry.type ===
    "MultiPolygon"
  ) {
    return geometry.coordinates.some(
      (polygon) =>
        pointInPolygon(
          lon,
          lat,
          polygon
        )
    );
  }

  return false;
}

function pointInsideNE(
  lon,
  lat,
  geojson
) {
  return geojson.features.some(
    (feature) =>
      pointInGeometry(
        lon,
        lat,
        feature.geometry
      )
  );
}

function walkCoordinates(
  coordinates,
  callback
) {
  if (
    typeof coordinates[0] ===
    "number"
  ) {
    callback(coordinates);
    return;
  }

  for (
    const child of coordinates
  ) {
    walkCoordinates(
      child,
      callback
    );
  }
}

function getBoundaryBBox(
  geojson
) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (
    const feature of
      geojson.features
  ) {
    walkCoordinates(
      feature.geometry.coordinates,
      ([lon, lat]) => {
        minLon = Math.min(
          minLon,
          lon
        );

        minLat = Math.min(
          minLat,
          lat
        );

        maxLon = Math.max(
          maxLon,
          lon
        );

        maxLat = Math.max(
          maxLat,
          lat
        );
      }
    );
  }

  return {
    minLon,
    minLat,
    maxLon,
    maxLat,
  };
}

function buildGrid(
  bbox,
  boundary
) {
  /*
   * The boundary minimum becomes the grid origin.
   * This keeps row/col indexing deterministic.
   */
  const originLat =
    bbox.minLat;

  const originLon =
    bbox.minLon;

  const points = [];

  const rows =
    Math.floor(
      (bbox.maxLat -
        originLat) /
        GRID_STEP
    );

  const cols =
    Math.floor(
      (bbox.maxLon -
        originLon) /
        GRID_STEP
    );

  for (
    let row = 0;
    row <= rows;
    row += 1
  ) {
    const lat =
      originLat +
      row *
        GRID_STEP;

    if (
      lat >
      bbox.maxLat
    ) {
      continue;
    }

    for (
      let col = 0;
      col <= cols;
      col += 1
    ) {
      const lon =
        originLon +
        col *
          GRID_STEP;

      if (
        lon >
        bbox.maxLon
      ) {
        continue;
      }

      if (
        pointInsideNE(
          lon,
          lat,
          boundary
        )
      ) {
        points.push({
          row,
          col,
          lat: Number(
            lat.toFixed(6)
          ),
          lon: Number(
            lon.toFixed(6)
          ),
        });
      }
    }
  }

  return {
    originLat,
    originLon,
    points,
  };
}

function featureKey(point) {
  return `${point.row}:${point.col}`;
}

function loadPartial() {
  if (
    !fs.existsSync(
      TEMP_FILE
    )
  ) {
    return null;
  }

  try {
    return JSON.parse(
      fs.readFileSync(
        TEMP_FILE,
        "utf8"
      )
    );
  } catch (error) {
    console.warn(
      "Partial file is invalid; starting over."
    );

    return null;
  }
}

function savePartial(
  metadata,
  points
) {
  fs.writeFileSync(
    TEMP_FILE,
    JSON.stringify({
      ...metadata,
      points,
    })
  );
}

async function main() {
  if (
    !Number.isFinite(
      GRID_STEP
    ) ||
    GRID_STEP <= 0
  ) {
    throw new Error(
      "STATIC_GRID_STEP must be a positive number"
    );
  }

  if (
    !fs.existsSync(
      BOUNDARY_FILE
    )
  ) {
    throw new Error(
      `Northeast boundary not found: ${BOUNDARY_FILE}`
    );
  }

  fs.mkdirSync(
    OUTPUT_DIR,
    {
      recursive: true,
    }
  );

  const boundary =
    JSON.parse(
      fs.readFileSync(
        BOUNDARY_FILE,
        "utf8"
      )
    );

  const bbox =
    getBoundaryBBox(
      boundary
    );

  const grid =
    buildGrid(
      bbox,
      boundary
    );

  console.log(
    `NE boundary: ${bbox.minLat.toFixed(4)}..${bbox.maxLat.toFixed(4)} N, ${bbox.minLon.toFixed(4)}..${bbox.maxLon.toFixed(4)} E`
  );

  console.log(
    `Static grid spacing: ${GRID_STEP}°`
  );

  console.log(
    `Candidate NE points: ${grid.points.length}`
  );

  const metadata = {
    version: "v2",
    source:
      "TerrainTrace static terrain/fault preprocessing",
    step: GRID_STEP,
    originLat:
      grid.originLat,
    originLon:
      grid.originLon,
    boundaryFile:
      BOUNDARY_FILE,
  };

  const existing =
    loadPartial();

  const processed =
    new Map();

  /*
   * Resume only when the partial file belongs to
   * the same grid resolution.
   */
  if (
    existing &&
    existing.step ===
      GRID_STEP &&
    Array.isArray(
      existing.points
    )
  ) {
    for (
      const point of
        existing.points
    ) {
      processed.set(
        featureKey(point),
        point
      );
    }

    console.log(
      `Resuming partial grid: ${processed.size} points already complete`
    );
  }

  for (
    let start = 0;
    start < grid.points.length;
    start += CHUNK_SIZE
  ) {
    const chunk =
      grid.points.slice(
        start,
        start + CHUNK_SIZE
      );

    const missing =
      chunk.filter(
        (point) =>
          !processed.has(
            featureKey(point)
          )
      );

    if (
      missing.length === 0
    ) {
      console.log(
        `Skipping chunk ${start}..${start + chunk.length - 1} (already complete)`
      );

      continue;
    }

    console.log(
      `Processing ${start + 1}-${Math.min(
        start + CHUNK_SIZE,
        grid.points.length
      )} / ${grid.points.length}`
    );

    /*
     * Terrain and fault-distance calculations
     * run in parallel.
     */
    const [
      terrain,
      faults,
    ] = await Promise.all([
      getElevationAndSlopeBatch(
        missing
      ),

      getFaultDistanceBatch(
        missing
      ),
    ]);

    for (
      let i = 0;
      i < missing.length;
      i += 1
    ) {
      const point =
        missing[i];

      const terrainResult =
        terrain[i];

      const faultResult =
        faults[i];

      if (
        !terrainResult ||
        !faultResult ||
        !Number.isFinite(
          terrainResult.elevation_m
        ) ||
        !Number.isFinite(
          terrainResult.slope_deg
        ) ||
        !Number.isFinite(
          faultResult.fault_distance_m
        )
      ) {
        console.warn(
          `Skipping invalid point: ${point.lat}, ${point.lon}`
        );

        continue;
      }

      processed.set(
        featureKey(point),
        {
          row: point.row,
          col: point.col,
          lat: point.lat,
          lon: point.lon,
          elevation_m:
            terrainResult.elevation_m,
          slope_deg:
            terrainResult.slope_deg,
          fault_distance_m:
            faultResult.fault_distance_m,
        }
      );
    }

    savePartial(
      metadata,
      Array.from(
        processed.values()
      )
    );

    console.log(
      `Saved partial grid: ${processed.size} points`
    );
  }

  const output = {
    ...metadata,
    generatedAt:
      new Date().toISOString(),
    points:
      Array.from(
        processed.values()
      ),
  };

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      output
    )
  );

  if (
    fs.existsSync(
      TEMP_FILE
    )
  ) {
    fs.unlinkSync(
      TEMP_FILE
    );
  }

  console.log(
    `Static terrain grid written: ${OUTPUT_FILE}`
  );

  console.log(
    `Valid points: ${output.points.length}/${grid.points.length}`
  );

  console.log(
    "Preprocessing complete."
  );
}

main().catch(
  (error) => {
    console.error(
      error.response?.data ||
        error.message ||
        error
    );

    process.exit(1);
  }
);