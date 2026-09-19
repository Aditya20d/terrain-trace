const express = require("express");

const {
  predict,
  predictBatch,
} = require("../services/mlService");

const {
  getLandslideFeatures,
  getLandslideFeaturesBatch,
} = require("../services/featureService");

const router = express.Router();

const LAT_MIN = 21;
const LAT_MAX = 34;
const LON_MIN = 75;
const LON_MAX = 98;

const MAX_POINTS = 200;

let activeBatchJob = null;
let queuedBatchJob = null;

const batchResultCache =
  new Map();

const BATCH_CACHE_TTL =
  30 * 1000;

const BATCH_CACHE_MAX = 8;

class BatchSupersededError extends Error {
  constructor() {
    super(
      "Viewport request superseded by a newer request"
    );
    this.code =
      "BATCH_SUPERSEDED";
  }
}

function validateCoordinate(
  lat,
  lon
) {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= LAT_MIN &&
    lat <= LAT_MAX &&
    lon >= LON_MIN &&
    lon <= LON_MAX
  );
}

function getBatchKey(points) {
  return points
    .map(
      (point) =>
        `${Number(point.lat).toFixed(6)},${Number(point.lon).toFixed(6)}`
    )
    .join("|");
}

function getCachedBatch(key) {
  const cached =
    batchResultCache.get(key);

  if (!cached) return null;

  if (
    Date.now() -
      cached.timestamp >=
    BATCH_CACHE_TTL
  ) {
    batchResultCache.delete(key);
    return null;
  }

  batchResultCache.delete(key);
  batchResultCache.set(
    key,
    cached
  );

  return cached.results;
}

function setCachedBatch(
  key,
  results
) {
  batchResultCache.delete(key);

  batchResultCache.set(
    key,
    {
      timestamp: Date.now(),
      results,
    }
  );

  while (
    batchResultCache.size >
    BATCH_CACHE_MAX
  ) {
    const oldest =
      batchResultCache
        .keys()
        .next()
        .value;

    batchResultCache.delete(
      oldest
    );
  }
}

function createJob(
  points,
  key
) {
  let resolve;
  let reject;

  const promise =
    new Promise(
      (res, rej) => {
        resolve = res;
        reject = rej;
      }
    );

  return {
    points,
    key,
    promise,
    resolve,
    reject,
  };
}

function startQueuedJob() {
  if (
    activeBatchJob ||
    !queuedBatchJob
  ) {
    return;
  }

  const job =
    queuedBatchJob;

  queuedBatchJob = null;
  activeBatchJob = job;

  executeBatchJob(job)
    .catch((error) => {
      job.reject(error);
    })
    .finally(() => {
      if (
        activeBatchJob ===
        job
      ) {
        activeBatchJob = null;
      }

      startQueuedJob();
    });
}

async function executeBatchJob(
  job
) {
  const start = Date.now();

  console.log(
    `Starting analysis for ${job.points.length} points`
  );

  const features =
    await getLandslideFeaturesBatch(
      job.points
    );

  console.log(
    `Features ready: ${Date.now() - start}ms`
  );

  const predictions =
    await predictBatch(
      features
    );

  if (
    predictions.length !==
    job.points.length
  ) {
    throw new Error(
      `ML returned ${predictions.length} predictions for ${job.points.length} points`
    );
  }

  const results =
    job.points.map(
      (point, index) => ({
        location: {
          lat: point.lat,
          lon: point.lon,
        },
        features:
          features[index],
        prediction:
          predictions[index],
      })
    );

  setCachedBatch(
    job.key,
    results
  );

  console.log(
    `Batch complete: ${Date.now() - start}ms`
  );

  job.resolve(results);
}

function enqueueBatch(
  points,
  key
) {
  if (
    activeBatchJob &&
    activeBatchJob.key === key
  ) {
    return activeBatchJob.promise;
  }

  if (
    queuedBatchJob &&
    queuedBatchJob.key === key
  ) {
    return queuedBatchJob.promise;
  }

  if (queuedBatchJob) {
    queuedBatchJob.reject(
      new BatchSupersededError()
    );
  }

  const job =
    createJob(
      points,
      key
    );

  if (!activeBatchJob) {
    queuedBatchJob = job;
    startQueuedJob();
  } else {
    queuedBatchJob = job;
  }

  return job.promise;
}

router.post(
  "/predict",
  async (req, res) => {
    try {
      const {
        lat,
        lon,
      } = req.body;

      if (
        !validateCoordinate(
          lat,
          lon
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              "lat and lon must be finite numbers inside the supported NER region",
          });
      }

      const features =
        await getLandslideFeatures(
          lat,
          lon
        );

      const prediction =
        await predict(
          features
        );

      return res.json({
        location: {
          lat,
          lon,
        },
        features,
        prediction,
      });
    } catch (error) {
      console.error(
        "Prediction error:",
        error.response?.data ||
          error.message
      );

      return res
        .status(500)
        .json({
          error:
            error.message ||
            "Failed to generate landslide prediction",
        });
    }
  }
);

router.post(
  "/predict-batch",
  async (req, res) => {
    try {
      const {
        points,
      } = req.body;

      if (
        !Array.isArray(
          points
        ) ||
        points.length === 0
      ) {
        return res
          .status(400)
          .json({
            error:
              "points must be a non-empty array",
          });
      }

      if (
        points.length >
        MAX_POINTS
      ) {
        return res
          .status(400)
          .json({
            error:
              `Maximum ${MAX_POINTS} points per request`,
          });
      }

      for (
        const point of points
      ) {
        if (
          !validateCoordinate(
            point?.lat,
            point?.lon
          )
        ) {
          return res
            .status(400)
            .json({
              error:
                "Each point must contain finite lat/lon inside the supported NER region",
            });
        }
      }

      const key =
        getBatchKey(
          points
        );

      const cached =
        getCachedBatch(
          key
        );

      if (cached) {
        console.log(
          `Batch cache hit: ${points.length} points`
        );

        return res.json({
          results: cached,
          cached: true,
        });
      }

      console.log(
        `Batch request: ${points.length} points`
      );

      const results =
        await enqueueBatch(
          points,
          key
        );

      if (
        req.aborted
      ) {
        return;
      }

      return res.json({
        results,
        cached: false,
      });
    } catch (error) {
      if (
        error?.code ===
        "BATCH_SUPERSEDED"
      ) {
        if (
          !req.aborted
        ) {
          return res
            .status(409)
            .json({
              error:
                "Viewport superseded by a newer request",
            });
        }

        return;
      }

      console.error(
        "Batch prediction error:",
        error.response?.data ||
          error.message
      );

      if (
        !req.aborted
      ) {
        return res
          .status(500)
          .json({
            error:
              error.response?.data
                ?.detail ||
              error.message ||
              "Failed to generate batch landslide predictions",
          });
      }
    }
  }
);

module.exports =
  router;
