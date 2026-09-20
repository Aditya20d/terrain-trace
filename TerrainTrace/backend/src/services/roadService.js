const fs = require("fs");
const path = require("path");

const ROAD_DATA_FILE = path.join(
  __dirname,
  "../../data/roads/northeast-roads.geojson"
);

const MIN_LAT = 21;
const MAX_LAT = 34;
const MIN_LON = 75;
const MAX_LON = 98;

const MAX_BBOX_SPAN = 1.5;

let roadIndex = null;
let roadLoadPromise = null;

function validateCoordinate(
  value,
  min,
  max
) {
  const number = Number(value);

  return (
    Number.isFinite(number) &&
    number >= min &&
    number <= max
  );
}

function normalizeBounds({
  north,
  south,
  east,
  west,
}) {
  const bounds = {
    north: Number(north),
    south: Number(south),
    east: Number(east),
    west: Number(west),
  };

  if (
    !validateCoordinate(
      bounds.north,
      MIN_LAT,
      MAX_LAT
    ) ||
    !validateCoordinate(
      bounds.south,
      MIN_LAT,
      MAX_LAT
    ) ||
    !validateCoordinate(
      bounds.east,
      MIN_LON,
      MAX_LON
    ) ||
    !validateCoordinate(
      bounds.west,
      MIN_LON,
      MAX_LON
    )
  ) {
    throw new Error(
      "Road map bounds are outside the supported Northeast India region."
    );
  }

  if (bounds.south >= bounds.north) {
    throw new Error(
      "South latitude must be smaller than north latitude."
    );
  }

  if (bounds.west >= bounds.east) {
    throw new Error(
      "West longitude must be smaller than east longitude."
    );
  }

  if (
    bounds.north - bounds.south >
      MAX_BBOX_SPAN ||
    bounds.east - bounds.west >
      MAX_BBOX_SPAN
  ) {
    throw new Error(
      `Road viewport is too large. Zoom in to a maximum ${MAX_BBOX_SPAN}° viewport.`
    );
  }

  return {
    north: Number(
      bounds.north.toFixed(4)
    ),
    south: Number(
      bounds.south.toFixed(4)
    ),
    east: Number(
      bounds.east.toFixed(4)
    ),
    west: Number(
      bounds.west.toFixed(4)
    ),
  };
}

function calculateGeometryBounds(
  coordinates
) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const coordinate of coordinates) {
    if (
      !Array.isArray(coordinate) ||
      coordinate.length < 2
    ) {
      continue;
    }

    const lon = Number(
      coordinate[0]
    );

    const lat = Number(
      coordinate[1]
    );

    if (
      !Number.isFinite(lon) ||
      !Number.isFinite(lat)
    ) {
      continue;
    }

    minLon = Math.min(
      minLon,
      lon
    );

    maxLon = Math.max(
      maxLon,
      lon
    );

    minLat = Math.min(
      minLat,
      lat
    );

    maxLat = Math.max(
      maxLat,
      lat
    );
  }

  if (
    !Number.isFinite(minLon) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLon) ||
    !Number.isFinite(maxLat)
  ) {
    return null;
  }

  return [
    minLon,
    minLat,
    maxLon,
    maxLat,
  ];
}

function normalizeFeature(
  feature
) {
  const coordinates =
    feature?.geometry?.coordinates;

  if (
    feature?.geometry?.type !==
      "LineString" ||
    !Array.isArray(coordinates) ||
    coordinates.length < 2
  ) {
    return null;
  }

  const geometryBounds =
    calculateGeometryBounds(
      coordinates
    );

  if (!geometryBounds) {
    return null;
  }

  return {
    type: "Feature",
    properties:
      feature.properties || {},
    geometry: {
      type: "LineString",
      coordinates,
    },
    _bbox: geometryBounds,
  };
}

async function loadRoadIndex() {
  if (roadIndex) {
    return roadIndex;
  }

  if (roadLoadPromise) {
    return roadLoadPromise;
  }

  roadLoadPromise = Promise.resolve().then(
    () => {
      console.log(
        "Loading local Northeast India road dataset..."
      );

      if (
        !fs.existsSync(
          ROAD_DATA_FILE
        )
      ) {
        throw new Error(
          `Road dataset not found: ${ROAD_DATA_FILE}`
        );
      }

      const startedAt =
        Date.now();

      const raw =
        fs.readFileSync(
          ROAD_DATA_FILE,
          "utf8"
        );

      const geojson =
        JSON.parse(raw);

      if (
        geojson?.type !==
          "FeatureCollection" ||
        !Array.isArray(
          geojson.features
        )
      ) {
        throw new Error(
          "Invalid road GeoJSON FeatureCollection."
        );
      }

      const features =
        geojson.features
          .map(normalizeFeature)
          .filter(Boolean);

      roadIndex = {
        features,
        total: features.length,
        loadedAt:
          new Date().toISOString(),
      };

      console.log(
        `Local road dataset loaded: ${features.length} roads`
      );

      console.log(
        `Road dataset load time: ${
          Date.now() - startedAt
        }ms`
      );

      return roadIndex;
    }
  );

  try {
    return await roadLoadPromise;
  } finally {
    roadLoadPromise = null;
  }
}

function bboxIntersects(
  roadBbox,
  bounds
) {
  const [
    roadMinLon,
    roadMinLat,
    roadMaxLon,
    roadMaxLat,
  ] = roadBbox;

  return !(
    roadMaxLon < bounds.west ||
    roadMinLon > bounds.east ||
    roadMaxLat < bounds.south ||
    roadMinLat > bounds.north
  );
}

function getRoadTypeCounts(
  roads
) {
  const counts = {};

  for (const road of roads) {
    const type =
      road.properties?.highway ||
      "unknown";

    counts[type] =
      (counts[type] || 0) + 1;
  }

  return counts;
}

async function getRoads(
  boundsInput
) {
  const bounds =
    normalizeBounds(
      boundsInput
    );

  const index =
    await loadRoadIndex();

  const matchedRoads =
    index.features.filter(
      (road) =>
        bboxIntersects(
          road._bbox,
          bounds
        )
    );

  const roads =
    matchedRoads.map(
      (road) => ({
        type: road.type,
        properties:
          road.properties,
        geometry:
          road.geometry,
      })
    );

  return {
    roads,
    total: roads.length,
    datasetTotal:
      index.total,
    highwayCounts:
      getRoadTypeCounts(
        roads
      ),
    fetchedAt:
      new Date().toISOString(),
    source:
      "OpenStreetMap / Geofabrik Northeast India extract",
  };
}

function getRoadStatus() {
  return {
    loaded:
      Boolean(roadIndex),
    total:
      roadIndex?.total || 0,
    dataFile:
      ROAD_DATA_FILE,
  };
}

module.exports = {
  getRoads,
  getRoadStatus,
};