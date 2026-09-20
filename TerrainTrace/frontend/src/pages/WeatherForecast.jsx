import { useEffect, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000/api";

const DEFAULT_LOCATION = { lat: 26, lon: 94 };

function WeatherForecast() {
  const [latitude, setLatitude] = useState(DEFAULT_LOCATION.lat);
  const [longitude, setLongitude] = useState(DEFAULT_LOCATION.lon);
  const [weather, setWeather] = useState(null);
  const [risk, setRisk] = useState(null);
  const [riskForecast, setRiskForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadData(targetLat = latitude, targetLon = longitude) {
    setLoading(true);
    setError("");

    try {
      const lat = Number(targetLat);
      const lon = Number(targetLon);

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lat < 21 ||
        lat > 34 ||
        lon < 75 ||
        lon > 98
      ) {
        throw new Error(
          "Please enter a valid Northeast India latitude/longitude."
        );
      }

      const weatherUrl =
        `${API_BASE}/weather/forecast?lat=${lat}&lon=${lon}`;
      const riskForecastUrl =
        `${API_BASE}/weather/risk-forecast?lat=${lat}&lon=${lon}`;

      const [weatherResponse, riskResponse, riskForecastResponse] =
        await Promise.all([
          fetch(weatherUrl),
          fetch(`${API_BASE}/risk/predict`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat, lon }),
          }),
          fetch(riskForecastUrl),
        ]);

      const weatherData = await weatherResponse.json();
      const riskData = await riskResponse.json();
      const riskForecastData = await riskForecastResponse.json();

      if (!weatherResponse.ok) {
        throw new Error(weatherData.error || "Failed to load weather data.");
      }
      if (!riskResponse.ok) {
        throw new Error(riskData.error || "Failed to load current AI risk.");
      }
      if (!riskForecastResponse.ok) {
        throw new Error(
          riskForecastData.error ||
            "Failed to load 7-day AI risk forecast."
        );
      }

      setWeather(weatherData);
      setRisk(riskData);
      setRiskForecast(riskForecastData);
    } catch (err) {
      console.error("Weather page error:", err);
      setError(err.message || "Unable to load weather intelligence.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon);
  }, []);

  const forecast = riskForecast?.forecast || [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wider text-cyan-400">
          Weather Intelligence
        </p>
        <h1 className="mt-2 text-3xl font-bold text-white">
          Weather-Linked Risk Forecast
        </h1>
        <p className="mt-3 max-w-3xl text-slate-400">
          Monitor current weather, rainfall, soil moisture and AI-based
          landslide risk for the selected location.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="flex-1">
            <label className="mb-2 block text-sm text-slate-400">Latitude</label>
            <input
              type="number"
              step="0.01"
              min="21"
              max="34"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-white outline-none transition focus:border-cyan-400"
            />
          </div>

          <div className="flex-1">
            <label className="mb-2 block text-sm text-slate-400">Longitude</label>
            <input
              type="number"
              step="0.01"
              min="75"
              max="98"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-white outline-none transition focus:border-cyan-400"
            />
          </div>

          <button
            type="button"
            onClick={() => loadData(latitude, longitude)}
            disabled={loading}
            className="rounded-lg bg-cyan-500 px-6 py-2.5 font-medium text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Loading..." : "Update"}
          </button>
        </div>

        {weather?.timezone && (
          <p className="mt-3 text-xs text-slate-500">
            Location: {Number(latitude).toFixed(4)}, {Number(longitude).toFixed(4)}
            {" • "}
            {weather.timezone}
          </p>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && !weather && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-400">
          Loading weather intelligence...
        </div>
      )}

      {weather && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <WeatherCard title="Temperature" value={formatNumber(weather.current?.temperature_c)} unit="°C" />
            <WeatherCard title="Humidity" value={formatNumber(weather.current?.humidity_pct)} unit="%" />
            <WeatherCard title="Precipitation" value={formatNumber(weather.current?.precipitation_mm)} unit="mm" />
            <WeatherCard title="Soil Moisture" value={formatNumber(weather.current?.soil_moisture_pct)} unit="%" />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">Current Conditions</p>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="text-xl font-semibold text-white">
                    {weather.current?.weather_description || "—"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {weather.current?.time || "Current"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-400">Wind</p>
                  <p className="text-lg font-semibold text-white">
                    {formatNumber(weather.current?.wind_speed_kmh)}{" "}
                    <span className="text-sm font-normal text-slate-500">km/h</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">Current AI Landslide Risk</p>
              {risk?.prediction ? (
                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <p className={`text-3xl font-bold ${getRiskTextColor(risk.prediction.risk_score)}`}>
                      {risk.prediction.risk_score}
                    </p>
                    <p className={`mt-1 text-sm font-medium ${getRiskTextColor(risk.prediction.risk_score)}`}>
                      {getRiskBand(risk.prediction.risk_score)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-400">Probability</p>
                    <p className="text-lg font-semibold text-white">
                      {formatProbability(risk.prediction.probability)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Model {risk.prediction.model_version || "v1"}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-slate-500">Risk data unavailable.</p>
              )}
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  7-Day AI Landslide Risk Forecast
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Daily risk is calculated from forecast weather plus the location&apos;s
                  terrain and geological features.
                </p>
              </div>
              {riskForecast?.modelVersion && (
                <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-400">
                  Model {riskForecast.modelVersion}
                </span>
              )}
            </div>

            {forecast.length ? (
              <div className="mt-5 overflow-x-auto">
                <div className="min-w-[980px]">
                  <div className="grid grid-cols-7 gap-3">
                    {forecast.map((day) => (
                      <RiskForecastDay key={day.date} day={day} />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-5 text-sm text-slate-500">
                7-day AI risk forecast unavailable.
              </p>
            )}
          </div>

          {forecast.length > 0 && (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="text-xl font-semibold text-white">Rainfall Outlook</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Forecast precipitation and the rainfall values passed into the model.
                </p>
                <div className="mt-5 space-y-4">
                  {forecast.map((day) => (
                    <RainfallBar key={day.date} day={day} />
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="text-xl font-semibold text-white">AI Risk Drivers</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Strongest SHAP factors returned by the landslide model for each day.
                </p>
                <div className="mt-5 space-y-4">
                  {forecast.map((day) => (
                    <RiskDriverRow key={day.date} day={day} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function WeatherCard({ title, value, unit }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-sm text-slate-400">{title}</p>
      <div className="mt-2">
        <span className="text-3xl font-bold text-white">{value}</span>
        {unit && <span className="ml-1 text-base text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}

function RiskForecastDay({ day }) {
  const score = Number(day?.prediction?.risk_score);
  const factors = Array.isArray(day?.prediction?.factors)
    ? day.prediction.factors.filter(
        (factor) =>
          factor?.direction === "increases_risk" ||
          factor?.direction === "decreases_risk"
      ).slice(0, 2)
    : [];

  return (
    <div className={`rounded-lg border p-4 ${getRiskCardClasses(score)}`}>
      <p className="text-sm font-medium text-white">{formatDate(day.date)}</p>
      <div className="mt-4">
        <p className={`text-3xl font-bold ${getRiskTextColor(score)}`}>
          {Number.isFinite(score) ? score : "—"}
        </p>
        <p className={`mt-1 text-sm font-medium ${getRiskTextColor(score)}`}>
          {getRiskBand(score)}
        </p>
      </div>

      <div className="mt-4 space-y-2 border-t border-slate-800/80 pt-4 text-xs">
        <MetricRow label="Probability" value={formatProbability(day?.prediction?.probability)} />
        <MetricRow label="Rainfall 24h" value={`${formatNumber(day?.modelInputs?.rainfall_24h_mm)} mm`} />
        <MetricRow label="Soil moisture" value={`${formatNumber(day?.modelInputs?.soil_moisture_pct)}%`} />
      </div>

      {factors.length > 0 && (
        <div className="mt-4 border-t border-slate-800/80 pt-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Main factors</p>
          <div className="mt-2 space-y-1.5">
            {factors.map((factor, index) => (
              <div
                key={`${factor.key}-${index}`}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="truncate text-slate-300">{factor.name}</span>
                <span
                  className={
                    factor.direction === "increases_risk"
                      ? "shrink-0 text-orange-300"
                      : "shrink-0 text-emerald-300"
                  }
                >
                  {factor.direction === "increases_risk" ? "↑" : "↓"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricRow({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}

function RiskDriverRow({ day }) {
  const factors = Array.isArray(day?.prediction?.factors)
    ? day.prediction.factors.slice(0, 3)
    : [];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="font-medium text-white">{formatDate(day.date)}</p>
        <p className={`font-semibold ${getRiskTextColor(day?.prediction?.risk_score)}`}>
          {day?.prediction?.risk_score ?? "—"}
        </p>
      </div>

      {factors.length > 0 ? (
        <div className="mt-3 space-y-2">
          {factors.map((factor, index) => (
            <div
              key={`${factor.key}-${index}`}
              className="flex items-center justify-between gap-4 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-slate-300">{factor.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatFactorValue(factor.value, factor.unit)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={
                    factor.direction === "increases_risk"
                      ? "text-orange-300"
                      : factor.direction === "decreases_risk"
                      ? "text-emerald-300"
                      : "text-slate-400"
                  }
                >
                  {factor.direction === "increases_risk"
                    ? "Increases risk"
                    : factor.direction === "decreases_risk"
                    ? "Decreases risk"
                    : "Neutral"}
                </p>
                <p className="text-xs text-slate-500">
                  {Number.isFinite(Number(factor.relative_contribution_pct))
                    ? `${Number(factor.relative_contribution_pct).toFixed(1)}% contribution`
                    : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">Model factors unavailable.</p>
      )}
    </div>
  );
}

function RainfallBar({ day }) {
  const rainfall = Number(day?.weather?.precipitation_mm) || 0;
  const width = Math.min(rainfall * 4, 100);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-slate-400">{formatDate(day.date)}</span>
        <span className="font-medium text-white">{formatNumber(rainfall)} mm</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-cyan-400 transition-all"
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>
          24h model input: {formatNumber(day?.modelInputs?.rainfall_24h_mm)} mm
        </span>
        <span>
          3d: {formatNumber(day?.modelInputs?.rainfall_3d_mm)} mm
        </span>
      </div>
    </div>
  );
}

function formatDate(date) {
  if (!date) return "—";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatNumber(value) {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {
    return "—";
  }
  return Number(value).toFixed(1);
}

function formatProbability(value) {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {
    return "—";
  }
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatFactorValue(value, unit) {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {
    return "Value unavailable";
  }
  const formatted =
    typeof value === "number" ? value.toFixed(2) : String(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

function getRiskBand(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) return "Unavailable";
  if (numericScore < 25) return "Low";
  if (numericScore < 50) return "Moderate";
  if (numericScore < 75) return "High";
  return "Very High";
}

function getRiskTextColor(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) return "text-slate-400";
  if (numericScore < 25) return "text-emerald-400";
  if (numericScore < 50) return "text-yellow-400";
  if (numericScore < 75) return "text-orange-400";
  return "text-red-400";
}

function getRiskCardClasses(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return "border-slate-800 bg-slate-950";
  }
  if (numericScore < 25) {
    return "border-emerald-900/50 bg-emerald-950/10";
  }
  if (numericScore < 50) {
    return "border-yellow-900/50 bg-yellow-950/10";
  }
  if (numericScore < 75) {
    return "border-orange-900/50 bg-orange-950/10";
  }
  return "border-red-900/50 bg-red-950/10";
}

export default WeatherForecast;
