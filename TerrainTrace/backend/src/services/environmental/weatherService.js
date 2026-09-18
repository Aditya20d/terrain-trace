const axios = require("axios");

const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const CACHE_DURATION = 10 * 60 * 1000;
const weatherCache = new Map();
const pendingRequests = new Map();

const WEATHER_BATCH_SIZE = 50;
const WEATHER_REQUEST_CONCURRENCY = 2;

function pointKey(lat, lon) {
  return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function runWithConcurrency(items, concurrency, worker) {
  if (items.length === 0) return [];

  const results = new Array(items.length);
  let nextIndex = 0;

  async function workerLoop() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const count = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: count }, () => workerLoop())
  );

  return results;
}

function extractOne(location) {
  const hourly = location?.hourly || {};
  const precipitation = hourly.precipitation || [];
  const soilMoisture = hourly.soil_moisture_0_to_7cm || [];

  const last72Hours = precipitation.slice(-72);
  const last24Hours = precipitation.slice(-24);

  const rainfall3d = last72Hours.reduce(
    (sum, value) => sum + (value ?? 0),
    0
  );

  const validRain = last24Hours.filter(
    (value) => value !== null && value !== undefined
  );

  const rainfall24hIntensity = Math.max(
    ...validRain,
    0
  );

  const validSoil = soilMoisture
    .filter(
      (value) =>
        value !== null && value !== undefined
    )
    .at(-1);

  const soilMoisturePct =
    validSoil !== undefined
      ? validSoil * 100
      : null;

  return {
    rainfall_3d_mm: rainfall3d,
    rainfall_24h_mm: rainfall24hIntensity,
    soil_moisture_pct: soilMoisturePct,
  };
}

function extractWeather(data, expectedCount) {
  const locations = Array.isArray(data)
    ? data
    : [data];

  if (locations.length !== expectedCount) {
    throw new Error(
      `Open-Meteo returned ${locations.length} locations for ${expectedCount} points`
    );
  }

  return locations.map(extractOne);
}

async function fetchWeatherBatch(points) {
  const response = await axios.get(
    WEATHER_URL,
    {
      params: {
        latitude: points.map((p) => p.lat).join(","),
        longitude: points.map((p) => p.lon).join(","),
        hourly:
          "precipitation,soil_moisture_0_to_7cm",
        past_days: 3,
        forecast_days: 1,
        timezone: "auto",
      },
      timeout: 30000,
    }
  );

  return extractWeather(
    response.data,
    points.length
  );
}

async function getWeatherFeaturesBatch(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return new Map();
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

  const resultMap = new Map();
  const missing = [];

  for (const point of uniquePoints) {
    const key = pointKey(point.lat, point.lon);
    const cached = weatherCache.get(key);

    if (
      cached &&
      Date.now() - cached.timestamp < CACHE_DURATION
    ) {
      resultMap.set(key, cached.data);
    } else {
      missing.push(point);
    }
  }

  if (missing.length === 0) {
    return resultMap;
  }

  const batches = chunkArray(
    missing,
    WEATHER_BATCH_SIZE
  );

  await runWithConcurrency(
    batches,
    WEATHER_REQUEST_CONCURRENCY,
    async (batch) => {
      const fetchable = [];
      const waiting = [];

      for (const point of batch) {
        const key = pointKey(point.lat, point.lon);
        const pending = pendingRequests.get(key);

        if (pending) {
          waiting.push({ key, promise: pending });
        } else {
          fetchable.push(point);
        }
      }

      if (fetchable.length > 0) {
        const batchPromise = fetchWeatherBatch(
          fetchable
        );

        // Give every point its own pending promise. This avoids the bug where
        // a single-point request could accidentally receive the whole batch
        // array while a batch request was running.
        fetchable.forEach((point, index) => {
          const key = pointKey(point.lat, point.lon);
          const pointPromise = batchPromise
            .then((results) => results[index])
            .catch((err) => {
              // Handled by batchPromise in try/catch; avoid unhandled rejection
              return null;
            });
          pendingRequests.set(key, pointPromise);
        });

        try {
          const results = await batchPromise;

          results.forEach((data, index) => {
            const key = pointKey(
              fetchable[index].lat,
              fetchable[index].lon
            );

            weatherCache.set(key, {
              timestamp: Date.now(),
              data,
            });

            resultMap.set(key, data);
          });
        } finally {
          fetchable.forEach((point) => {
            pendingRequests.delete(
              pointKey(point.lat, point.lon)
            );
          });
        }
      }

      if (waiting.length > 0) {
        const waitingResults = await Promise.all(
          waiting.map((entry) => entry.promise)
        );

        waiting.forEach((entry, index) => {
          resultMap.set(
            entry.key,
            waitingResults[index]
          );
        });
      }
    }
  );

  return resultMap;
}

async function getWeatherFeatures(lat, lon) {
  const key = pointKey(lat, lon);
  const cached = weatherCache.get(key);

  if (
    cached &&
    Date.now() - cached.timestamp < CACHE_DURATION
  ) {
    return cached.data;
  }

  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }

  const requestPromise = fetchWeatherBatch([
    { lat, lon },
  ])
    .then((results) => {
      const data = results[0];
      weatherCache.set(key, {
        timestamp: Date.now(),
        data,
      });
      return data;
    })
    .finally(() => {
      pendingRequests.delete(key);
    });

  pendingRequests.set(key, requestPromise);
  return requestPromise;
}

module.exports = {
  getWeatherFeatures,
  getWeatherFeaturesBatch,
};
