import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  GeoJSON,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000/api";

const DEFAULT_CENTER = [
  26.25,
  94.25,
];

const DEFAULT_ZOOM = 10;

const RISK_FILTERS = [
  {
    key: "all",
    label: "All Roads",
  },
  {
    key: "high",
    label: "High+",
  },
  {
    key: "very-high",
    label: "Very High",
  },
];

function RoadConnectivity() {
  const [roads, setRoads] = useState([]);
  const [summary, setSummary] =
    useState({
      total: 0,
      highRiskRoads: 0,
      veryHighRiskRoads: 0,
      highwayCounts: {},
    });

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [lastUpdated, setLastUpdated] =
    useState(null);

  const [riskFilter, setRiskFilter] =
    useState("all");

  const requestIdRef = useRef(0);

  const loadRoadRisk = useCallback(
    async (bounds) => {
      if (!bounds) {
        return;
      }

      const requestId =
        ++requestIdRef.current;

      setLoading(true);
      setError("");

      try {
        const north =
          bounds.getNorth().toFixed(4);

        const south =
          bounds.getSouth().toFixed(4);

        const east =
          bounds.getEast().toFixed(4);

        const west =
          bounds.getWest().toFixed(4);

        const url =
          `${API_BASE}/roads/risk` +
          `?north=${north}` +
          `&south=${south}` +
          `&east=${east}` +
          `&west=${west}`;

        const response =
          await fetch(url);

        if (
          requestId !==
          requestIdRef.current
        ) {
          return;
        }

        if (!response.ok) {
          let errorMessage =
            "Failed to load AI road risk.";

          try {
            const errorData =
              await response.json();

            errorMessage =
              errorData.error ||
              errorMessage;
          } catch {
            /* empty body */
          }

          throw new Error(
            errorMessage
          );
        }

        const data =
          await response.json();

        setRoads(
          Array.isArray(data.roads)
            ? data.roads
            : []
        );

        setSummary({
          total:
            Number(data.total) || 0,

          highRiskRoads:
            Number(
              data.highRiskRoads
            ) || 0,

          veryHighRiskRoads:
            Number(
              data.veryHighRiskRoads
            ) || 0,

          highwayCounts:
            data.highwayCounts || {},
        });

        setLastUpdated(
          data.generatedAt ||
            null
        );
      } catch (err) {
        if (
          requestId !==
          requestIdRef.current
        ) {
          return;
        }

        console.error(
          "Road risk error:",
          err
        );

        setError(
          err.message ||
            "Unable to load AI road risk."
        );
      } finally {
        if (
          requestId ===
          requestIdRef.current
        ) {
          setLoading(false);
        }
      }
    },
    []
  );

  const visibleRoads = useMemo(() => {
    return roads.filter((road) => {
      const score = Number(
        road?.risk?.score
      );

      if (!Number.isFinite(score)) {
        return riskFilter === "all";
      }

      if (riskFilter === "high") {
        return score >= 50;
      }

      if (riskFilter === "very-high") {
        return score >= 75;
      }

      return true;
    });
  }, [roads, riskFilter]);

  const geoJsonData = useMemo(
    () => ({
      type: "FeatureCollection",
      features: visibleRoads,
    }),
    [visibleRoads]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wider text-cyan-400">
          Infrastructure Intelligence
        </p>

        <h1 className="mt-2 text-3xl font-bold text-white">
          AI Landslide-Prone Roads
        </h1>

        <p className="mt-3 max-w-4xl text-slate-400">
          Screen major road corridors using TerrainTrace
          AI landslide-risk predictions. Road colors represent
          the predicted risk at a representative point on each
          road.
        </p>
      </div>

      {/* Summary */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Roads Scored"
          value={summary.total}
          subtitle="Current viewport"
        />

        <SummaryCard
          title="High+ Risk"
          value={summary.highRiskRoads}
          subtitle="Risk score ≥ 50"
          valueClass="text-orange-400"
        />

        <SummaryCard
          title="Very High Risk"
          value={
            summary.veryHighRiskRoads
          }
          subtitle="Risk score ≥ 75"
          valueClass="text-red-400"
        />

        <SummaryCard
          title="ML Model"
          value="v1"
          subtitle="CatBoost classifier"
          valueClass="text-cyan-400"
        />
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Risk Filter
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Focus the map on the road risk levels
              that need attention.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {RISK_FILTERS.map(
              (filter) => {
                const active =
                  riskFilter ===
                  filter.key;

                return (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() =>
                      setRiskFilter(
                        filter.key
                      )
                    }
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                      active
                        ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300"
                        : "border-slate-700 bg-slate-950 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              }
            )}
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-white">
              Road Risk Map
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Pan or zoom to refresh the AI road-risk
              results for the current viewport.
            </p>
          </div>

          <div className="text-xs text-slate-500">
            {loading
              ? "Scoring roads..."
              : lastUpdated
              ? `Updated ${formatTimestamp(
                  lastUpdated
                )}`
              : "Ready"}
          </div>
        </div>

        <div className="relative h-[650px]">
          <MapContainer
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            minZoom={7}
            maxZoom={15}
            scrollWheelZoom
            className="h-full w-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <ViewportWatcher
              onBoundsChange={
                loadRoadRisk
              }
            />

            {visibleRoads.length >
              0 && (
              <GeoJSON
                key={`${riskFilter}-${visibleRoads.length}-${lastUpdated || "initial"}`}
                data={geoJsonData}
                style={roadStyle}
                onEachFeature={(
                  feature,
                  layer
                ) => {
                  const properties =
                    feature?.properties ||
                    {};

                  const risk =
                    feature?.risk ||
                    {};

                  const name =
                    properties.name ||
                    "Unnamed road";

                  const highway =
                    properties.highway ||
                    "Unknown";

                  const score =
                    Number(
                      risk.score
                    );

                  const probability =
                    Number(
                      risk.probability
                    );

                  const factors =
                    Array.isArray(
                      risk.factors
                    )
                      ? risk.factors
                      : [];

                  const factorHtml =
                    factors.length > 0
                      ? `
                        <div style="margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0">
                          <div style="font-weight:600;margin-bottom:5px">
                            Main factors
                          </div>
                          ${factors
                            .map(
                              (factor) => `
                                <div style="margin:3px 0">
                                  ${escapeHtml(
                                    factor.name ||
                                      factor.key ||
                                      "Factor"
                                  )}
                                 :
                                  ${
                                    factor.direction ===
                                    "increases_risk"
                                      ? "↑ increases"
                                      : factor.direction ===
                                        "decreases_risk"
                                      ? "↓ decreases"
                                      : "neutral"
                                  }
                                </div>
                              `
                            )
                            .join("")}
                        </div>
                      `
                      : "";

                  const scoreText =
                    Number.isFinite(
                      score
                    )
                      ? `${score}/100`
                      : "Unavailable";

                  const probabilityText =
                    Number.isFinite(
                      probability
                    )
                      ? `${(
                          probability *
                          100
                        ).toFixed(1)}%`
                      : "—";

                  layer.bindPopup(`
                    <div style="min-width:240px;font-family:Arial,sans-serif">
                      <div style="font-size:16px;font-weight:700;margin-bottom:8px">
                        ${escapeHtml(
                          name
                        )}
                      </div>

                      <div style="margin:3px 0">
                        <strong>Road class:</strong>
                        ${escapeHtml(
                          highway
                        )}
                      </div>

                      ${
                        properties.ref
                          ? `
                            <div style="margin:3px 0">
                              <strong>Reference:</strong>
                              ${escapeHtml(
                                properties.ref
                              )}
                            </div>
                          `
                          : ""
                      }

                      <div style="margin:8px 0 3px">
                        <strong>AI risk:</strong>
                        <span style="font-weight:700">
                          ${scoreText}
                        </span>
                      </div>

                      <div style="margin:3px 0">
                        <strong>Risk band:</strong>
                        ${escapeHtml(
                          risk.band ||
                            "Unavailable"
                        )}
                      </div>

                      <div style="margin:3px 0">
                        <strong>Model probability:</strong>
                        ${probabilityText}
                      </div>

                      ${
                        risk.samplePoint
                          ? `
                            <div style="margin:3px 0">
                              <strong>Sample point:</strong>
                              ${Number(
                                risk
                                  .samplePoint
                                  .lat
                              ).toFixed(
                                4
                              )},
                              ${Number(
                                risk
                                  .samplePoint
                                  .lon
                              ).toFixed(
                                4
                              )}
                            </div>
                          `
                          : ""
                      }

                      ${factorHtml}

                      <div style="margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b">
                        Screening result at a representative
                        road point. Not a confirmed landslide
                        or official road closure.
                      </div>
                    </div>
                  `);
                }}
              />
            )}
          </MapContainer>

          {loading && (
            <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-lg border border-slate-700 bg-slate-950/90 px-4 py-2 text-sm text-slate-300 shadow-lg">
              Running AI road-risk analysis...
            </div>
          )}

          {!loading &&
            visibleRoads.length ===
              0 &&
            !error && (
              <div className="pointer-events-none absolute inset-x-0 top-5 z-[500] flex justify-center">
                <div className="rounded-lg border border-slate-700 bg-slate-950/90 px-4 py-2 text-sm text-slate-400 shadow-lg">
                  No roads match the selected risk
                  filter in this viewport.
                </div>
              </div>
            )}

          {!loading && error && (
            <div className="pointer-events-none absolute inset-x-0 top-5 z-[500] flex justify-center">
              <div className="rounded-lg border border-red-800/60 bg-red-950/90 px-4 py-2 text-sm text-red-300 shadow-lg">
                {error}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-lg font-semibold text-white">
          AI Risk Legend
        </h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <RiskLegend
            label="Low"
            range="0–24"
            color="#10b981"
          />

          <RiskLegend
            label="Moderate"
            range="25–49"
            color="#eab308"
          />

          <RiskLegend
            label="High"
            range="50–74"
            color="#f97316"
          />

          <RiskLegend
            label="Very High"
            range="75–100"
            color="#ef4444"
          />
        </div>
      </div>

      {/* Road class counts */}
      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-lg font-semibold text-white">
          Road Classes in Viewport
        </h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <RoadClassCount
            label="Trunk"
            value={
              summary.highwayCounts
                ?.trunk || 0
            }
          />

          <RoadClassCount
            label="Primary"
            value={
              summary.highwayCounts
                ?.primary || 0
            }
          />

          <RoadClassCount
            label="Secondary"
            value={
              summary.highwayCounts
                ?.secondary || 0
            }
          />

          <RoadClassCount
            label="Tertiary"
            value={
              summary.highwayCounts
                ?.tertiary || 0
            }
          />
        </div>
      </div>

      {/* How Road Risk is Calculated */}
      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-lg font-semibold text-white">
          How Road Risk is Calculated
        </h2>

        <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-400">
          <p>
            Each road in the current viewport is scored using the
            TerrainTrace CatBoost AI model. A representative midpoint
            is selected on each road segment, and environmental
            features (terrain, geology, weather, proximity to faults)
            are extracted for that location.
          </p>

          <p>
            The model produces a landslide probability which is
            converted to a 0–100 risk score. Roads are then
            color-coded by risk band: Low (0–24), Moderate (25–49),
            High (50–74), and Very High (75–100).
          </p>

          <p>
            Because each road is screened at a single representative
            point, the result reflects the AI-predicted landslide risk
            near that road — not a confirmed landslide or official
            road-closure status. Actual conditions may vary along the
            full length of the road.
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-600">
        Road geometry source: OpenStreetMap data
        distributed through the Geofabrik Northeast India
        regional extract. AI scores are model predictions for
        representative road points and should not be interpreted
        as confirmed landslides or official road-closure
        information.
      </p>
    </div>
  );
}

function ViewportWatcher({
  onBoundsChange,
}) {
  const timerRef = useRef(null);
  const map = useMap();

  const loadCurrentBounds =
    useCallback(() => {
      onBoundsChange(
        map.getBounds()
      );
    }, [map, onBoundsChange]);

  useEffect(() => {
    loadCurrentBounds();

    return () => {
      if (timerRef.current) {
        window.clearTimeout(
          timerRef.current
        );
      }
    };
  }, [loadCurrentBounds]);

  useMapEvents({
    moveend() {
      if (timerRef.current) {
        window.clearTimeout(
          timerRef.current
        );
      }

      timerRef.current =
        window.setTimeout(
          loadCurrentBounds,
          450
        );
    },
  });

  return null;
}

function SummaryCard({
  title,
  value,
  subtitle,
  valueClass = "text-white",
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">
        {title}
      </p>

      <p
        className={`mt-2 text-2xl font-bold ${valueClass}`}
      >
        {typeof value === "number"
          ? value.toLocaleString(
              "en-IN"
            )
          : value}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {subtitle}
      </p>
    </div>
  );
}

function RiskLegend({
  label,
  range,
  color,
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
      <span
        className="h-2 w-10 rounded-full"
        style={{
          backgroundColor: color,
        }}
      />

      <div>
        <p className="text-sm font-medium text-white">
          {label}
        </p>

        <p className="text-xs text-slate-500">
          Score {range}
        </p>
      </div>
    </div>
  );
}

function RoadClassCount({
  label,
  value,
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <p className="text-sm text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-xl font-semibold text-white">
        {Number(value).toLocaleString(
          "en-IN"
        )}
      </p>
    </div>
  );
}

function roadStyle(feature) {
  const score =
    Number(feature?.risk?.score);

  if (!Number.isFinite(score)) {
    return {
      color: "#64748b",
      weight: 3,
      opacity: 0.65,
    };
  }

  if (score < 25) {
    return {
      color: "#10b981",
      weight: 3,
      opacity: 0.85,
    };
  }

  if (score < 50) {
    return {
      color: "#eab308",
      weight: 4,
      opacity: 0.9,
    };
  }

  if (score < 75) {
    return {
      color: "#f97316",
      weight: 5,
      opacity: 0.95,
    };
  }

  return {
    color: "#ef4444",
    weight: 6,
    opacity: 1,
  };
}

function formatTimestamp(
  timestamp
) {
  const date =
    new Date(timestamp);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "recently";
  }

  return date.toLocaleTimeString(
    "en-IN",
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}

export default RoadConnectivity;
