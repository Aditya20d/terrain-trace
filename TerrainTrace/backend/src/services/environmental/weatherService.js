const axios = require("axios");

const WEATHER_URL =
  "https://api.open-meteo.com/v1/forecast";

const weatherCache = new Map();
const pendingRequests = new Map();

const CACHE_DURATION =
  10 * 60 * 1000;

const BATCH_SIZE = 25;

function cacheKey(lat, lon) {
  return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
}

function parseWeatherResponse(data) {
  const hourly = data?.hourly || {};

  const precipitation =
    hourly.precipitation || [];

  const soilMoisture =
    hourly.soil_moisture_0_to_7cm || [];

  const last72Hours =
    precipitation.slice(-72);

  const last24Hours =
    precipitation.slice(-24);

  const rainfall3d =
    last72Hours.reduce(
      (sum, value) =>
        sum + (value ?? 0),
      0
    );

  const valid24 =
    last24Hours.filter(
      (value) => value !== null
    );

  const rainfall24hIntensity =
    Math.max(...valid24, 0);

  const validSoil =
    soilMoisture
      .filter(
        (value) => value !== null
      )
      .at(-1);

  const soilMoisturePct =
    validSoil !== undefined
      ? validSoil * 100
      : null;

  return {
    rainfall_3d_mm:
      rainfall3d,
    rainfall_24h_mm:
      rainfall24hIntensity,
    soil_moisture_pct:
      soilMoisturePct,
  };
}

async function fetchWeather(
  lat,
  lon
) {
  const response =
    await axios.get(
      WEATHER_URL,
      {
        params: {
          latitude: lat,
          longitude: lon,
          hourly:
            "precipitation,soil_moisture_0_to_7cm",
          past_days: 3,
          forecast_days: 1,
          timezone: "auto",
        },
        timeout: 15000,
      }
    );

  return parseWeatherResponse(
    response.data
  );
}

async function getWeatherFeatures(
  lat,
  lon
) {
  const key = cacheKey(lat, lon);

  const cached =
    weatherCache.get(key);

  if (
    cached &&
    Date.now() -
      cached.timestamp <
      CACHE_DURATION
  ) {
    return cached.data;
  }

  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }

  const requestPromise =
    fetchWeather(lat, lon)
      .then((data) => {
        weatherCache.set(key, {
          timestamp: Date.now(),
          data,
        });
        return data;
      })
      .finally(() => {
        pendingRequests.delete(key);
      });

  pendingRequests.set(
    key,
    requestPromise
  );

  return requestPromise;
}

async function fetchWeatherBatch(
  points
) {
  const latitudes = points
    .map(
      (point) =>
        Number(point.lat).toFixed(6)
    )
    .join(",");

  const longitudes = points
    .map(
      (point) =>
        Number(point.lon).toFixed(6)
    )
    .join(",");

  const response =
    await axios.get(
      WEATHER_URL,
      {
        params: {
          latitude: latitudes,
          longitude: longitudes,
          hourly:
            "precipitation,soil_moisture_0_to_7cm",
          past_days: 3,
          forecast_days: 1,
          timezone: "auto",
        },
        timeout: 30000,
      }
    );

  const payload =
    response.data;

  const records =
    Array.isArray(payload)
      ? payload
      : [payload];

  if (records.length !== points.length) {
    throw new Error(
      `Open-Meteo returned ${records.length} results for ${points.length} points`
    );
  }

  return records.map(
    parseWeatherResponse
  );
}

async function getWeatherFeaturesBatch(
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

    const cached =
      weatherCache.get(key);

    if (
      cached &&
      Date.now() -
        cached.timestamp <
        CACHE_DURATION
    ) {
      result.set(
        key,
        cached.data
      );
    } else if (
      pendingRequests.has(key)
    ) {
      result.set(
        key,
        await pendingRequests.get(
          key
        )
      );
    } else {
      missing.push(point);
    }
  }

  for (
    let start = 0;
    start < missing.length;
    start += BATCH_SIZE
  ) {
    const chunk = missing.slice(
      start,
      start + BATCH_SIZE
    );

    console.log(
      `Fetching weather batch: ${chunk.length} points`
    );

    const records =
      await fetchWeatherBatch(
        chunk
      );

    records.forEach(
      (data, index) => {
        const point =
          chunk[index];

        const key = cacheKey(
          point.lat,
          point.lon
        );

        weatherCache.set(
          key,
          {
            timestamp: Date.now(),
            data,
          }
        );

        result.set(
          key,
          data
        );
      }
    );
  }

  return result;
}

module.exports = {
  getWeatherFeatures,
  getWeatherFeaturesBatch,
};
