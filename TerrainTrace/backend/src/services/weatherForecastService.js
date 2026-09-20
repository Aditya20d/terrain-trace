const axios = require("axios");

const OPEN_METEO_URL =
  "https://api.open-meteo.com/v1/forecast";

const CACHE_DURATION = 10 * 60 * 1000;

const weatherCache = new Map();

const LAT_MIN = 21;
const LAT_MAX = 34;
const LON_MIN = 75;
const LON_MAX = 98;

function cacheKey(lat, lon) {
  return `${Number(lat).toFixed(4)},${Number(
    lon
  ).toFixed(4)}`;
}

function getWeatherDescription(code) {
  const descriptions = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",

    45: "Fog",
    48: "Depositing rime fog",

    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",

    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",

    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",

    66: "Light freezing rain",
    67: "Heavy freezing rain",

    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",

    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",

    85: "Slight snow showers",
    86: "Heavy snow showers",

    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  };

  return (
    descriptions[code] ||
    "Unknown weather condition"
  );
}

function validateCoordinates(lat, lon) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= LAT_MIN &&
    lat <= LAT_MAX &&
    lon >= LON_MIN &&
    lon <= LON_MAX
  );
}

async function fetchForecast(lat, lon) {
  const response = await axios.get(
    OPEN_METEO_URL,
    {
      params: {
        latitude: lat,
        longitude: lon,

        /*
         * Keep the previous 3 days so that later we
         * can calculate rolling 24h / 72h rainfall
         * windows for future model predictions.
         */
        past_days: 3,
        forecast_days: 8,

        timezone: "auto",

        current: [
          "temperature_2m",
          "relative_humidity_2m",
          "precipitation",
          "soil_moisture_0_to_7cm",
          "wind_speed_10m",
          "weather_code",
        ].join(","),

        daily: [
          "weather_code",
          "temperature_2m_max",
          "temperature_2m_min",
          "precipitation_sum",
          "precipitation_probability_max",
          "wind_speed_10m_max",
        ].join(","),

        /*
         * These are the important fields for the
         * future landslide-risk calculation.
         */
        hourly: [
          "precipitation",
          "soil_moisture_0_to_7cm",
        ].join(","),
      },

      timeout: 15000,
    }
  );

  const data = response.data;

  if (
    !data.current ||
    !data.daily ||
    !data.hourly
  ) {
    throw new Error(
      "Open-Meteo returned incomplete weather data"
    );
  }

  const daily = data.daily;

  const forecast = daily.time.map(
    (date, index) => ({
      date,

      weather_code:
        daily.weather_code?.[index] ??
        null,

      weather_description:
        getWeatherDescription(
          daily.weather_code?.[index]
        ),

      temperature_max_c:
        daily.temperature_2m_max?.[index] ??
        null,

      temperature_min_c:
        daily.temperature_2m_min?.[index] ??
        null,

      precipitation_mm:
        daily.precipitation_sum?.[index] ??
        null,

      precipitation_probability_pct:
        daily
          .precipitation_probability_max?.[
          index
        ] ?? null,

      wind_speed_max_kmh:
        daily.wind_speed_10m_max?.[
          index
        ] ?? null,
    })
  );

  /*
   * Preserve the hourly series internally.
   *
   * Open-Meteo precipitation values represent
   * precipitation associated with each hourly
   * timestep, while soil moisture is an hourly
   * volumetric soil-water-content value.
   */
  const hourly = {
    time:
      data.hourly.time || [],

    precipitation_mm:
      data.hourly.precipitation || [],

    soil_moisture_m3m3:
      data.hourly
        .soil_moisture_0_to_7cm || [],
  };

  return {
    location: {
      latitude: lat,
      longitude: lon,
    },

    timezone:
      data.timezone || null,

    current: {
      time:
        data.current.time,

      temperature_c:
        data.current.temperature_2m ??
        null,

      humidity_pct:
        data.current.relative_humidity_2m ??
        null,

      precipitation_mm:
        data.current.precipitation ??
        null,

      soil_moisture_pct:
        data.current
          .soil_moisture_0_to_7cm !=
        null
          ? data.current
              .soil_moisture_0_to_7cm *
            100
          : null,

      wind_speed_kmh:
        data.current.wind_speed_10m ??
        null,

      weather_code:
        data.current.weather_code ??
        null,

      weather_description:
        getWeatherDescription(
          data.current.weather_code
        ),
    },

    forecast,

    /*
     * Used by the backend forecast-risk pipeline.
     * The frontend can ignore this field.
     */
    hourly,

    fetched_at:
      new Date().toISOString(),
  };
}

async function getWeatherForecast(
  lat,
  lon
) {
  if (!validateCoordinates(lat, lon)) {
    throw new Error(
      "Coordinates must be finite numbers inside the supported NER region"
    );
  }

  const key = cacheKey(lat, lon);

  const cached = weatherCache.get(key);

  if (
    cached &&
    Date.now() - cached.timestamp <
      CACHE_DURATION
  ) {
    console.log(
      `Weather forecast cache hit: ${key}`
    );

    return cached.data;
  }

  console.log(
    `Fetching weather forecast: ${key}`
  );

  const data = await fetchForecast(
    lat,
    lon
  );

  weatherCache.set(key, {
    timestamp: Date.now(),
    data,
  });

  return data;
}

module.exports = {
  getWeatherForecast,
};