const {
  getWeatherFeatures,
  getWeatherFeaturesBatch,
} = require("./environmental/weatherService");
const {
  getElevationAndSlope,
  getElevationAndSlopeBatch,
} = require("./environmental/demService");
const {
  getFaultDistance,
  getFaultDistanceBatch,
} = require("./environmental/faultService");
const {
  getLithology,
  getLithologyBatch,
} = require("./environmental/lithologyService");

function pointKey(lat, lon) {
  return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
}

async function getLandslideFeatures(lat, lon) {
  const [weather, terrain, fault, geology] =
    await Promise.all([
      getWeatherFeatures(lat, lon),
      getElevationAndSlope(lat, lon),
      getFaultDistance(lat, lon),
      getLithology(lat, lon),
    ]);

  return {
    elevation_m: terrain.elevation_m,
    slope_deg: terrain.slope_deg,
    fault_distance_m: fault.fault_distance_m,
    rainfall_3d_mm: weather.rainfall_3d_mm,
    rainfall_24h_mm: weather.rainfall_24h_mm,
    soil_moisture_pct: weather.soil_moisture_pct,
    lithology: geology.lithology,
  };
}

async function getLandslideFeaturesBatch(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }

  const uniquePoints = [];
  const seen = new Set();

  for (const point of points) {
    const key = pointKey(point.lat, point.lon);
    if (!seen.has(key)) {
      seen.add(key);
      uniquePoints.push(point);
    }
  }

  const start = Date.now();

  const [weatherMap, terrainResults, faultResults, geologyMap] =
    await Promise.all([
      getWeatherFeaturesBatch(uniquePoints),
      getElevationAndSlopeBatch(uniquePoints),
      getFaultDistanceBatch(uniquePoints),
      getLithologyBatch(uniquePoints),
    ]);

  const terrainMap = new Map();
  const faultMap = new Map();

  uniquePoints.forEach((point, index) => {
    const key = pointKey(point.lat, point.lon);
    terrainMap.set(key, terrainResults[index]);
    faultMap.set(key, faultResults[index]);
  });

  const featureMap = new Map();

  for (const point of uniquePoints) {
    const key = pointKey(point.lat, point.lon);
    const weather = weatherMap.get(key);
    const terrain = terrainMap.get(key);
    const fault = faultMap.get(key);
    const geology = geologyMap.get(key);

    if (!weather || !terrain || !fault || !geology) {
      throw new Error(
        `Incomplete feature vector for ${point.lat}, ${point.lon}`
      );
    }

    featureMap.set(key, {
      elevation_m: terrain.elevation_m,
      slope_deg: terrain.slope_deg,
      fault_distance_m: fault.fault_distance_m,
      rainfall_3d_mm: weather.rainfall_3d_mm,
      rainfall_24h_mm: weather.rainfall_24h_mm,
      soil_moisture_pct: weather.soil_moisture_pct,
      lithology: geology.lithology,
    });
  }

  console.log(
    `Feature batch complete: ${points.length} points, ${uniquePoints.length} unique, ${Date.now() - start}ms`
  );

  return points.map((point) =>
    featureMap.get(
      pointKey(point.lat, point.lon)
    )
  );
}

module.exports = {
  getLandslideFeatures,
  getLandslideFeaturesBatch,
};
