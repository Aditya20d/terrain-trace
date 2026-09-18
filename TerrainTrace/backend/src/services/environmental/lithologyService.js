const axios = require("axios");

const MACROSTRAT_URL =
  "https://macrostrat.org/api/v2/geologic_units/map";

const lithologyCache = new Map();
const pendingRequests = new Map();
const LITHOLOGY_CONCURRENCY = 6;

function pointKey(lat, lon) {
  return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
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

async function fetchLithology(lat, lon) {
  const response = await axios.get(
    MACROSTRAT_URL,
    {
      params: { lat, lng: lon },
      timeout: 15000,
    }
  );

  const data = response.data?.success?.data;

  if (!Array.isArray(data) || data.length === 0) {
    return { lithology: "unknown" };
  }

  const lithology = data[0]?.lith || "unknown";

  return {
    lithology: String(lithology)
      .trim()
      .toLowerCase(),
  };
}

async function getLithology(lat, lon) {
  const key = pointKey(lat, lon);

  if (lithologyCache.has(key)) {
    return lithologyCache.get(key);
  }

  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }

  const requestPromise = fetchLithology(lat, lon)
    .then((result) => {
      lithologyCache.set(key, result);
      return result;
    })
    .catch((error) => {
      console.warn(
        `Lithology lookup failed for ${lat}, ${lon}: ${
          error.response?.status || error.message
        }`
      );

      const fallback = { lithology: "unknown" };
      lithologyCache.set(key, fallback);
      return fallback;
    })
    .finally(() => {
      pendingRequests.delete(key);
    });

  pendingRequests.set(key, requestPromise);
  return requestPromise;
}

async function getLithologyBatch(points) {
  const resultMap = new Map();

  if (!Array.isArray(points) || points.length === 0) {
    return resultMap;
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

  await runWithConcurrency(
    uniquePoints,
    LITHOLOGY_CONCURRENCY,
    async (point) => {
      const key = pointKey(point.lat, point.lon);
      const result = await getLithology(
        point.lat,
        point.lon
      );
      resultMap.set(key, result);
    }
  );

  return resultMap;
}

module.exports = {
  getLithology,
  getLithologyBatch,
};
