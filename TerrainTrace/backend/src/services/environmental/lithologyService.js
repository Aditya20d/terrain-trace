const axios = require("axios");

const MACROSTRAT_URL =
  "https://macrostrat.org/api/v2/geologic_units/map";

const lithologyCache = new Map();
const pendingRequests = new Map();

const CONCURRENCY = 5;

function cacheKey(lat, lon) {
  return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
}

async function getLithology(lat, lon) {
  const key = cacheKey(lat, lon);

  if (lithologyCache.has(key)) {
    return lithologyCache.get(key);
  }

  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }

  console.log(
    `Fetching lithology: ${key}`
  );

  const requestPromise =
    axios
      .get(
        MACROSTRAT_URL,
        {
          params: {
            lat,
            lng: lon,
          },
          timeout: 15000,
        }
      )
      .then((response) => {
        const data =
          response.data?.success
            ?.data;

        if (
          !Array.isArray(data) ||
          data.length === 0
        ) {
          return {
            lithology: "unknown",
          };
        }

        return {
          lithology: String(
            data[0]?.lith ||
              "unknown"
          )
            .trim()
            .toLowerCase(),
        };
      })
      .then((result) => {
        lithologyCache.set(
          key,
          result
        );
        return result;
      })
      .finally(() => {
        pendingRequests.delete(
          key
        );
      });

  pendingRequests.set(
    key,
    requestPromise
  );

  return requestPromise;
}

async function getLithologyBatch(
  points
) {
  if (
    !Array.isArray(points) ||
    points.length === 0
  ) {
    return new Map();
  }

  const result = new Map();
  const missing = [];

  for (const point of points) {
    const key = cacheKey(
      point.lat,
      point.lon
    );

    if (lithologyCache.has(key)) {
      result.set(
        key,
        lithologyCache.get(key)
      );
    } else if (
      pendingRequests.has(key)
    ) {
      result.set(
        key,
        await pendingRequests.get(key)
      );
    } else {
      missing.push(point);
    }
  }

  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;

      if (index >= missing.length) {
        return;
      }

      const point =
        missing[index];

      const data =
        await getLithology(
          point.lat,
          point.lon
        );

      result.set(
        cacheKey(
          point.lat,
          point.lon
        ),
        data
      );
    }
  }

  const workerCount = Math.min(
    CONCURRENCY,
    missing.length
  );

  await Promise.all(
    Array.from(
      { length: workerCount },
      () => worker()
    )
  );

  return result;
}

module.exports = {
  getLithology,
  getLithologyBatch,
};
