const {
  getWeatherFeaturesBatch,
} = require("./environmental/weatherService");

const {
  getElevationAndSlopeBatch,
} = require("./environmental/demService");

const {
  getFaultDistanceBatch,
} = require("./environmental/faultService");


const {
  getStaticLithologyBatch,
} = require("./staticLithologyService");


const {
  getStaticTerrainBatch,
} = require("./staticFeatureService");

function pointKey(lat, lon) {
  return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
}

async function getLandslideFeaturesBatch(
  points
) {
  if (
    !Array.isArray(points) ||
    points.length === 0
  ) {
    return [];
  }

  const uniquePoints = [];
  const seen = new Set();

  for (const point of points) {
    const key = pointKey(
      point.lat,
      point.lon
    );

    if (!seen.has(key)) {
      seen.add(key);
      uniquePoints.push(point);
    }
  }

  const start = Date.now();

  // Static terrain/fault data is used whenever the
  // precomputed grid covers the requested coordinate.
  const staticTerrain =
    getStaticTerrainBatch(
      uniquePoints
    );

  let terrainResults;
  let faultResults;

  if (
    staticTerrain.available &&
    staticTerrain.missingIndices
      .length === 0
  ) {
    terrainResults =
      staticTerrain.results.map(
        (item) => ({
          elevation_m:
            item.elevation_m,
          slope_deg:
            item.slope_deg,
        })
      );

    faultResults =
      staticTerrain.results.map(
        (item) => ({
          fault_distance_m:
            item.fault_distance_m,
        })
      );
  } else if (
    staticTerrain.available &&
    staticTerrain.missingIndices
      .length > 0
  ) {
    const missingPoints =
      staticTerrain.missingIndices.map(
        (index) =>
          uniquePoints[index]
      );

    const [
      dynamicTerrain,
      dynamicFault,
    ] = await Promise.all([
      getElevationAndSlopeBatch(
        missingPoints
      ),
      getFaultDistanceBatch(
        missingPoints
      ),
    ]);

    terrainResults =
      staticTerrain.results.map(
        (item) =>
          item
            ? {
                elevation_m:
                  item.elevation_m,
                slope_deg:
                  item.slope_deg,
              }
            : null
      );

    faultResults =
      staticTerrain.results.map(
        (item) =>
          item
            ? {
                fault_distance_m:
                  item.fault_distance_m,
              }
            : null
      );

    staticTerrain.missingIndices
      .forEach(
        (
          originalIndex,
          missingIndex
        ) => {
          terrainResults[
            originalIndex
          ] =
            dynamicTerrain[
              missingIndex
            ];

          faultResults[
            originalIndex
          ] =
            dynamicFault[
              missingIndex
            ];
        }
      );
  } else {
    const [
      dynamicTerrain,
      dynamicFault,
    ] = await Promise.all([
      getElevationAndSlopeBatch(
        uniquePoints
      ),
      getFaultDistanceBatch(
        uniquePoints
      ),
    ]);

    terrainResults =
      dynamicTerrain;

    faultResults =
      dynamicFault;
  }

    // Live features:
  // Open-Meteo is fetched in multi-coordinate batches.
  //
  // Lithology is read from the precomputed static grid.
  const weatherPromise =
    getWeatherFeaturesBatch(
      uniquePoints
    );

  const staticLithology =
    getStaticLithologyBatch(
      uniquePoints
    );

  const weatherMap =
    await weatherPromise;

  let lithologyResults =
    staticLithology.results;

  // Only use Macrostrat as a fallback for points
  // not represented in the static lithology grid.
  if (
    staticLithology.available &&
    staticLithology.missingIndices.length > 0
  ) {
    const {
      getLithologyBatch,
    } = require(
      "./environmental/lithologyService"
    );

    const missingPoints =
      staticLithology.missingIndices.map(
        (index) =>
          uniquePoints[index]
      );

    const dynamicLithology =
      await getLithologyBatch(
        missingPoints
      );

    lithologyResults =
      staticLithology.results.slice();

    staticLithology.missingIndices.forEach(
      (
        originalIndex,
        missingIndex
      ) => {
        const point =
          missingPoints[missingIndex];

        const key = pointKey(
          point.lat,
          point.lon
        );

        lithologyResults[
          originalIndex
        ] =
          dynamicLithology.get(key);
      }
    );
  } else if (!staticLithology.available) {
    const {
      getLithologyBatch,
    } = require(
      "./environmental/lithologyService"
    );

    const dynamicLithology =
      await getLithologyBatch(
        uniquePoints
      );

    lithologyResults =
      uniquePoints.map(
        (point) =>
          dynamicLithology.get(
            pointKey(
              point.lat,
              point.lon
            )
          )
      );
  }

  const lithologyMap =
    new Map();

  uniquePoints.forEach(
    (point, index) => {
      lithologyMap.set(
        pointKey(
          point.lat,
          point.lon
        ),
        lithologyResults[index]
      );
    }
  );

  const featureMap =
    new Map();

  uniquePoints.forEach(
    (point, index) => {
      const key =
        pointKey(
          point.lat,
          point.lon
        );

      const weather =
        weatherMap.get(key);

      const terrain =
        terrainResults[index];

      const fault =
        faultResults[index];

      const geology =
        lithologyMap.get(key);

      if (
        !weather ||
        !terrain ||
        !fault ||
        !geology
      ) {
        throw new Error(
          `Incomplete feature vector for ${point.lat}, ${point.lon}`
        );
      }

      featureMap.set(
        key,
        {
          elevation_m:
            terrain.elevation_m,
          slope_deg:
            terrain.slope_deg,
          fault_distance_m:
            fault.fault_distance_m,
          rainfall_3d_mm:
            weather.rainfall_3d_mm,
          rainfall_24h_mm:
            weather.rainfall_24h_mm,
          soil_moisture_pct:
            weather.soil_moisture_pct,
          lithology:
            geology.lithology,
        }
      );
    }
  );

  console.log(
    `Feature batch complete: ${points.length} points, ${uniquePoints.length} unique, ${Date.now() - start}ms`
  );

  return points.map(
    (point) =>
      featureMap.get(
        pointKey(
          point.lat,
          point.lon
        )
      )
  );
}

async function getLandslideFeatures(
  lat,
  lon
) {
  const results =
    await getLandslideFeaturesBatch([
      { lat, lon },
    ]);

  return results[0];
}

module.exports = {
  getLandslideFeatures,
  getLandslideFeaturesBatch,
};
