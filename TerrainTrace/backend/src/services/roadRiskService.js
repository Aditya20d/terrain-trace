const {
  getRoads,
} = require("./roadService");

const {
  getLandslideFeaturesBatch,
} = require("./featureService");

const {
  predictBatch,
} = require("./mlService");

const BATCH_SIZE = 100;
const MAX_GEOMETRY_POINTS = 80;

function haversineDistanceMeters(
  lat1,
  lon1,
  lat2,
  lon2
) {
  const earthRadius = 6371000;

  const lat1Rad =
    (lat1 * Math.PI) / 180;

  const lat2Rad =
    (lat2 * Math.PI) / 180;

  const deltaLat =
    ((lat2 - lat1) * Math.PI) / 180;

  const deltaLon =
    ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLon / 2) ** 2;

  return (
    2 *
    earthRadius *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}

function getRoadMidpoint(
  coordinates
) {
  if (
    !Array.isArray(coordinates) ||
    coordinates.length === 0
  ) {
    return null;
  }

  if (coordinates.length === 1) {
    return {
      lat: Number(
        coordinates[0][1]
      ),
      lon: Number(
        coordinates[0][0]
      ),
    };
  }

  let totalDistance = 0;

  const cumulative = [0];

  for (
    let i = 1;
    i < coordinates.length;
    i++
  ) {
    const previous =
      coordinates[i - 1];

    const current =
      coordinates[i];

    totalDistance +=
      haversineDistanceMeters(
        Number(previous[1]),
        Number(previous[0]),
        Number(current[1]),
        Number(current[0])
      );

    cumulative.push(
      totalDistance
    );
  }

  if (totalDistance === 0) {
    const middle =
      coordinates[
        Math.floor(
          coordinates.length / 2
        )
      ];

    return {
      lat: Number(
        middle[1]
      ),
      lon: Number(
        middle[0]
      ),
    };
  }

  const target =
    totalDistance / 2;

  for (
    let i = 1;
    i < cumulative.length;
    i++
  ) {
    if (
      cumulative[i] >= target
    ) {
      const before =
        coordinates[i - 1];

      const after =
        coordinates[i];

      const previousDistance =
        cumulative[i - 1];

      const segmentDistance =
        cumulative[i] -
        previousDistance;

      const ratio =
        segmentDistance > 0
          ? (target -
              previousDistance) /
            segmentDistance
          : 0;

      return {
        lat:
          Number(before[1]) +
          (Number(after[1]) -
            Number(before[1])) *
            ratio,

        lon:
          Number(before[0]) +
          (Number(after[0]) -
            Number(before[0])) *
            ratio,
      };
    }
  }

  const last =
    coordinates[
      coordinates.length - 1
    ];

  return {
    lat: Number(last[1]),
    lon: Number(last[0]),
  };
}

function simplifyCoordinates(
  coordinates,
  maxPoints = MAX_GEOMETRY_POINTS
) {
  if (
    !Array.isArray(coordinates) ||
    coordinates.length <= maxPoints
  ) {
    return coordinates;
  }

  const result = [];
  const lastIndex =
    coordinates.length - 1;

  for (
    let i = 0;
    i < maxPoints;
    i++
  ) {
    const ratio =
      i / (maxPoints - 1);

    const index = Math.round(
      ratio * lastIndex
    );

    result.push(
      coordinates[index]
    );
  }

  return result;
}

function pointKey(
  lat,
  lon
) {
  return `${Number(lat).toFixed(
    4
  )},${Number(lon).toFixed(4)}`;
}

function chunk(
  array,
  size
) {
  const chunks = [];

  for (
    let i = 0;
    i < array.length;
    i += size
  ) {
    chunks.push(
      array.slice(
        i,
        i + size
      )
    );
  }

  return chunks;
}

function getRiskBand(score) {
  if (score < 25) {
    return "Low";
  }

  if (score < 50) {
    return "Moderate";
  }

  if (score < 75) {
    return "High";
  }

  return "Very High";
}

async function scoreRoads(
  roads
) {
  const samples =
    roads
      .map((road) => {
        const midpoint =
          getRoadMidpoint(
            road?.geometry?.coordinates
          );

        if (!midpoint) {
          return null;
        }

        return {
          road,
          midpoint,
          key: pointKey(
            midpoint.lat,
            midpoint.lon
          ),
        };
      })
      .filter(Boolean);

  const uniquePoints = [];
  const pointIndex = new Map();

  for (const sample of samples) {
    if (
      !pointIndex.has(
        sample.key
      )
    ) {
      pointIndex.set(
        sample.key,
        uniquePoints.length
      );

      uniquePoints.push({
        lat: sample.midpoint.lat,
        lon: sample.midpoint.lon,
      });
    }
  }

  console.log(
    `Road risk: ${samples.length} road samples, ${uniquePoints.length} unique points`
  );

  /*
   * Extract environmental features in bounded
   * batches using the existing feature pipeline.
   */
  const features = [];

  for (const batch of chunk(
    uniquePoints,
    BATCH_SIZE
  )) {
    const batchFeatures =
      await getLandslideFeaturesBatch(
        batch
      );

    features.push(
      ...batchFeatures
    );
  }

  if (
    features.length !==
    uniquePoints.length
  ) {
    throw new Error(
      `Expected ${uniquePoints.length} feature vectors but received ${features.length}.`
    );
  }

  console.log(
    `Road risk: feature extraction complete for ${features.length} points`
  );

  /*
   * Send feature vectors to the existing
   * CatBoost ML service in bounded batches.
   */
  const predictions = [];

  for (const batch of chunk(
    features,
    BATCH_SIZE
  )) {
    console.log(
      `Road risk: sending ${batch.length} predictions to ML service...`
    );

    const batchPredictions =
      await predictBatch(
        batch
      );

    predictions.push(
      ...batchPredictions
    );

    console.log(
      `Road risk: received ${batchPredictions.length} predictions`
    );
  }

  if (
    predictions.length !==
    uniquePoints.length
  ) {
    throw new Error(
      `Expected ${uniquePoints.length} predictions but received ${predictions.length}.`
    );
  }

  const predictionMap =
    new Map();

  uniquePoints.forEach(
    (point, index) => {
      predictionMap.set(
        pointKey(
          point.lat,
          point.lon
        ),
        predictions[index]
      );
    }
  );

  return samples.map(
    (sample) => {
      const prediction =
        predictionMap.get(
          sample.key
        );

      const score = Number(
        prediction?.risk_score
      );

      return {
        type: "Feature",

        properties:
          sample.road.properties,

        geometry: {
          type: "LineString",
          coordinates:
            simplifyCoordinates(
              sample.road.geometry.coordinates
            ),
        },

        risk: {
          score:
            Number.isFinite(score)
              ? score
              : null,

          band:
            Number.isFinite(score)
              ? getRiskBand(score)
              : "Unavailable",

          probability:
            prediction?.probability ??
            null,

          modelVersion:
            prediction?.model_version ||
            "v1",

          samplePoint:
            sample.midpoint,

          factors:
            Array.isArray(
              prediction?.factors
            )
              ? prediction.factors.slice(
                  0,
                  3
                )
              : [],
        },
      };
    }
  );
}

async function getRoadRisk(
  bounds
) {
  const startedAt =
    Date.now();

  const roadData =
    await getRoads(bounds);

  if (
    !roadData.roads ||
    roadData.roads.length === 0
  ) {
    return {
      roads: [],
      total: 0,
      datasetTotal:
        roadData.datasetTotal || 0,
      samplePoints: 0,
      highRiskRoads: 0,
      veryHighRiskRoads: 0,
      highwayCounts:
        roadData.highwayCounts || {},
      generatedAt:
        new Date().toISOString(),
      source:
        roadData.source,
    };
  }

  const roads =
    await scoreRoads(
      roadData.roads
    );

  const highRiskRoads =
    roads.filter(
      (road) =>
        Number(
          road.risk?.score
        ) >= 50
    );

  const veryHighRiskRoads =
    roads.filter(
      (road) =>
        Number(
          road.risk?.score
        ) >= 75
    );

  console.log(
    `Road risk complete: ${roads.length} roads scored, ${highRiskRoads.length} high+ roads, ${veryHighRiskRoads.length} very-high roads`
  );

  console.log(
    `Road risk total time: ${
      Date.now() - startedAt
    }ms`
  );

  return {
    roads,

    total:
      roads.length,

    datasetTotal:
      roadData.datasetTotal,

    samplePoints:
      roads.length,

    highRiskRoads:
      highRiskRoads.length,

    veryHighRiskRoads:
      veryHighRiskRoads.length,

    highwayCounts:
      roadData.highwayCounts,

    generatedAt:
      new Date().toISOString(),

    source:
      roadData.source,

    note:
      "Each road is screened using a representative midpoint prediction. The result indicates AI-modeled landslide risk at that representative location and is not a confirmed landslide or official road-closure status.",
  };
}

module.exports = {
  getRoadRisk,
};