const {
  getWeatherForecast,
} = require("./weatherForecastService");

const {
  getLandslideFeatures,
} = require("./featureService");

const {
  predictBatch,
} = require("./mlService");

const MAX_FORECAST_DAYS = 7;

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function getNextForecastDates(
  currentDate,
  count
) {
  const dates = [];

  const start = new Date(
    `${currentDate}T00:00:00`
  );

  for (let i = 1; i <= count; i += 1) {
    const date = new Date(start);

    date.setDate(
      date.getDate() + i
    );

    dates.push(
      dateKey(date)
    );
  }

  return dates;
}

function buildHourlyIndex(hourly) {
  const index = new Map();

  for (
    let i = 0;
    i < hourly.time.length;
    i += 1
  ) {
    index.set(hourly.time[i], {
      precipitation:
        Number(
          hourly.precipitation_mm?.[i]
        ) || 0,

      soilMoisture:
        hourly.soil_moisture_m3m3?.[i] ??
        null,
    });
  }

  return index;
}

function calculateWeatherFeaturesForDate(
  targetDate,
  hourlyIndex
) {
  const targetHours = [];

  for (let hour = 0; hour < 24; hour += 1) {
    const hourString = String(hour).padStart(
      2,
      "0"
    );

    const key =
      `${targetDate}T${hourString}:00`;

    const value = hourlyIndex.get(key);

    if (value) {
      targetHours.push({
        time: key,
        ...value,
      });
    }
  }

  if (targetHours.length === 0) {
    throw new Error(
      `No hourly weather data available for ${targetDate}`
    );
  }

  /*
   * Model training uses:
   *
   * rainfall_3d_mm
   * = cumulative precipitation over the
   *   previous 72 hours
   *
   * rainfall_24h_mm
   * = maximum hourly precipitation during
   *   the previous 24 hours
   *
   * Therefore, for each forecast day we use
   * the 24:00 endpoint and look backwards.
   */

  const endTime =
    `${targetDate}T23:00`;

  const allHours = Array.from(
    hourlyIndex.entries()
  )
    .filter(
      ([time]) =>
        time <= endTime
    )
    .sort(
      ([a], [b]) =>
        a.localeCompare(b)
    )
    .map(
      ([time, value]) => ({
        time,
        ...value,
      })
    );

  const last72Hours =
    allHours.slice(-72);

  const last24Hours =
    allHours.slice(-24);

  const rainfall3d =
    last72Hours.reduce(
      (sum, item) =>
        sum + item.precipitation,
      0
    );

  const rainfall24h =
    Math.max(
      ...last24Hours.map(
        (item) =>
          item.precipitation
      ),
      0
    );

  const validSoil =
    [...targetHours]
      .reverse()
      .find(
        (item) =>
          Number.isFinite(
            item.soilMoisture
          )
      );

  const soilMoisturePct =
    validSoil
      ? validSoil.soilMoisture *
        100
      : null;

  if (
    !Number.isFinite(
      soilMoisturePct
    )
  ) {
    throw new Error(
      `No valid soil-moisture forecast for ${targetDate}`
    );
  }

  return {
    rainfall_3d_mm:
      rainfall3d,

    rainfall_24h_mm:
      rainfall24h,

    soil_moisture_pct:
      soilMoisturePct,
  };
}

async function getRiskForecast(
  lat,
  lon
) {
  /*
   * Get the weather forecast containing the
   * hourly precipitation and soil-moisture data.
   */
  const weather =
    await getWeatherForecast(
      lat,
      lon
    );

  /*
   * The existing feature pipeline gives us
   * the location's static/geological features.
   *
   * We will replace only the weather variables
   * with future forecast values.
   */
  const baseFeatures =
    await getLandslideFeatures(
      lat,
      lon
    );

  if (!baseFeatures) {
    throw new Error(
      "Unable to build base landslide features"
    );
  }

  const hourlyIndex =
    buildHourlyIndex(
      weather.hourly
    );

  const currentDate =
    weather.current.time.slice(
      0,
      10
    );

  const forecastDates =
    getNextForecastDates(
      currentDate,
      MAX_FORECAST_DAYS
    );

  const validDates =
    forecastDates.filter(
      (date) =>
        Array.from(
          hourlyIndex.keys()
        ).some(
          (time) =>
            time.startsWith(date)
        )
    );

  if (
    validDates.length === 0
  ) {
    throw new Error(
      "No future forecast dates available"
    );
  }

  const futureFeatures =
    validDates.map(
      (date) => {
        const futureWeather =
          calculateWeatherFeaturesForDate(
            date,
            hourlyIndex
          );

        return {
          elevation_m:
            baseFeatures.elevation_m,

          slope_deg:
            baseFeatures.slope_deg,

          fault_distance_m:
            baseFeatures.fault_distance_m,

          rainfall_3d_mm:
            futureWeather.rainfall_3d_mm,

          rainfall_24h_mm:
            futureWeather.rainfall_24h_mm,

          soil_moisture_pct:
            futureWeather.soil_moisture_pct,

          lithology:
            baseFeatures.lithology,
        };
      }
    );

  const predictions =
    await predictBatch(
      futureFeatures
    );

  if (
    predictions.length !==
    futureFeatures.length
  ) {
    throw new Error(
      `ML returned ${predictions.length} predictions for ${futureFeatures.length} forecast days`
    );
  }

  const results =
    validDates.map(
      (date, index) => {
        const dailyWeather =
          weather.forecast.find(
            (day) =>
              day.date === date
          );

        return {
          date,

          weather: dailyWeather ||
            null,

          modelInputs: {
            rainfall_3d_mm:
              futureFeatures[index]
                .rainfall_3d_mm,

            rainfall_24h_mm:
              futureFeatures[index]
                .rainfall_24h_mm,

            soil_moisture_pct:
              futureFeatures[index]
                .soil_moisture_pct,
          },

          prediction:
            predictions[index],
        };
      }
    );

  return {
    location: {
      latitude: lat,
      longitude: lon,
    },

    modelVersion:
      predictions[0]
        ?.model_version || null,

    forecast: results,

    generated_at:
      new Date().toISOString(),
  };
}

module.exports = {
  getRiskForecast,
};