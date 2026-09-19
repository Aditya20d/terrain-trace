import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  GeoJSON,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getBatchRiskPredictions } from "../../services/api";

const BOUNDARY_URL = "/data/northeast_states.geojson";

const MIN_RISK_ZOOM = 7;
const MAX_POINTS = 64;
const MAX_CACHED_PREDICTIONS = 5000;
const VIEWPORT_DEBOUNCE_MS = 700;

// Must match backend/data/static-features/ne_static_terrain.json
const STATIC_GRID_STEP = 0.1;
const STATIC_GRID_ORIGIN_LAT = 21.94004;
const STATIC_GRID_ORIGIN_LON = 88.012332;

function getRiskColor(probability) {
  const score = probability * 100;

  if (score < 25) return "green";
  if (score < 50) return "yellow";
  if (score < 75) return "orange";
  return "red";
}

function getRiskLabel(probability) {
  const score = probability * 100;

  if (score < 25) return "Low";
  if (score < 50) return "Moderate";
  if (score < 75) return "High";
  return "Very High";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clipToNER(bounds) {
  const south = Math.max(bounds.south, 21);
  const north = Math.min(bounds.north, 34);
  const west = Math.max(bounds.west, 75);
  const east = Math.min(bounds.east, 98);

  if (south >= north || west >= east) {
    return null;
  }

  return {
    south,
    north,
    west,
    east,
  };
}

/**
 * Select evenly distributed integer grid indices while preserving
 * the fact that every index belongs to the static 0.1° grid.
 */
function selectGridIndices(start, end, count) {
  const total = end - start + 1;

  if (total <= 0 || count <= 0) {
    return [];
  }

  if (count >= total) {
    return Array.from(
      { length: total },
      (_, index) => start + index
    );
  }

  if (count === 1) {
    return [Math.round((start + end) / 2)];
  }

  return Array.from({ length: count }, (_, index) =>
    Math.round(
      start +
        (index * (end - start)) /
          (count - 1)
    )
  );
}

/**
 * Generate viewport points that exactly align with the
 * precomputed backend static 0.1° grid.
 */
function generateViewportPoints(bounds) {
  const clipped = clipToNER(bounds);

  if (!clipped) {
    return [];
  }

  /*
   * Convert viewport coordinates into static-grid indices.
   *
   * Small epsilon prevents floating-point precision from
   * accidentally excluding a grid point lying exactly
   * on a viewport edge.
   */
  const EPSILON = 1e-9;

  const rowStart = Math.ceil(
    (clipped.south - STATIC_GRID_ORIGIN_LAT) /
      STATIC_GRID_STEP -
      EPSILON
  );

  const rowEnd = Math.floor(
    (clipped.north - STATIC_GRID_ORIGIN_LAT) /
      STATIC_GRID_STEP +
      EPSILON
  );

  const colStart = Math.ceil(
    (clipped.west - STATIC_GRID_ORIGIN_LON) /
      STATIC_GRID_STEP -
      EPSILON
  );

  const colEnd = Math.floor(
    (clipped.east - STATIC_GRID_ORIGIN_LON) /
      STATIC_GRID_STEP +
      EPSILON
  );

  const totalRows = rowEnd - rowStart + 1;
  const totalCols = colEnd - colStart + 1;

  if (totalRows <= 0 || totalCols <= 0) {
    return [];
  }

  /*
   * At this point every possible coordinate is an exact
   * static-grid coordinate.
   *
   * When the viewport contains <= MAX_POINTS cells,
   * use all of them.
   */
  if (totalRows * totalCols <= MAX_POINTS) {
    const points = [];

    for (let row = rowStart; row <= rowEnd; row += 1) {
      const lat =
        STATIC_GRID_ORIGIN_LAT +
        row * STATIC_GRID_STEP;

      for (
        let col = colStart;
        col <= colEnd;
        col += 1
      ) {
        const lon =
          STATIC_GRID_ORIGIN_LON +
          col * STATIC_GRID_STEP;

        points.push({
          lat: Number(lat.toFixed(5)),
          lon: Number(lon.toFixed(5)),
        });
      }
    }

    return points;
  }

  /*
   * Larger viewport:
   * choose at most MAX_POINTS while keeping approximately
   * the same aspect ratio as the viewport.
   */
  const aspect = totalCols / totalRows;

  let cols = Math.round(
    Math.sqrt(MAX_POINTS * aspect)
  );

  cols = clamp(cols, 1, totalCols);

  let rows = Math.round(
    MAX_POINTS / cols
  );

  rows = clamp(rows, 1, totalRows);

  /*
   * Make sure rows * cols never exceeds MAX_POINTS.
   */
  while (rows * cols > MAX_POINTS) {
    if (
      rows >= cols &&
      rows > 1
    ) {
      rows -= 1;
    } else if (cols > 1) {
      cols -= 1;
    } else {
      break;
    }
  }

  /*
   * Try to use additional capacity when possible.
   */
  let changed = true;

  while (changed) {
    changed = false;

    if (
      rows < totalRows &&
      (rows + 1) * cols <= MAX_POINTS
    ) {
      rows += 1;
      changed = true;
    }

    if (
      cols < totalCols &&
      rows * (cols + 1) <= MAX_POINTS
    ) {
      cols += 1;
      changed = true;
    }
  }

  const selectedRows = selectGridIndices(
    rowStart,
    rowEnd,
    rows
  );

  const selectedCols = selectGridIndices(
    colStart,
    colEnd,
    cols
  );

  const points = [];

  for (const row of selectedRows) {
    const lat =
      STATIC_GRID_ORIGIN_LAT +
      row * STATIC_GRID_STEP;

    for (const col of selectedCols) {
      const lon =
        STATIC_GRID_ORIGIN_LON +
        col * STATIC_GRID_STEP;

      points.push({
        lat: Number(lat.toFixed(5)),
        lon: Number(lon.toFixed(5)),
      });
    }
  }

  return points;
}

function pointInRing(lon, lat, ring) {
  let inside = false;

  for (
    let i = 0, j = ring.length - 1;
    i < ring.length;
    j = i++
  ) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersects =
      yi > lat !== yj > lat &&
      lon <
        ((xj - xi) * (lat - yi)) /
          (yj - yi || Number.EPSILON) +
          xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInPolygon(lon, lat, rings) {
  if (
    !Array.isArray(rings) ||
    rings.length === 0
  ) {
    return false;
  }

  if (
    !pointInRing(
      lon,
      lat,
      rings[0]
    )
  ) {
    return false;
  }

  for (let i = 1; i < rings.length; i += 1) {
    if (
      pointInRing(
        lon,
        lat,
        rings[i]
      )
    ) {
      return false;
    }
  }

  return true;
}

function pointInGeometry(lon, lat, geometry) {
  if (!geometry) {
    return false;
  }

  if (geometry.type === "Polygon") {
    return pointInPolygon(
      lon,
      lat,
      geometry.coordinates
    );
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some(
      (polygon) =>
        pointInPolygon(
          lon,
          lat,
          polygon
        )
    );
  }

  return false;
}

function pointInsideNE(lat, lon, geojson) {
  return Boolean(
    geojson?.features?.some(
      (feature) =>
        pointInGeometry(
          lon,
          lat,
          feature.geometry
        )
    )
  );
}

function filterPointsToNE(points, boundary) {
  return points.filter((point) =>
    pointInsideNE(
      point.lat,
      point.lon,
      boundary
    )
  );
}

function NortheastBoundary({
  onLoaded,
  onError,
}) {
  const map = useMap();

  const [boundary, setBoundary] =
    useState(null);

  const fittedRef =
    useRef(false);

  useEffect(() => {
    let cancelled = false;

    fetch(BOUNDARY_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to load Northeast boundary (${response.status})`
          );
        }

        return response.json();
      })
      .then((data) => {
        if (cancelled) return;

        setBoundary(data);
        onLoaded(data);
      })
      .catch((error) => {
        if (cancelled) return;

        console.error(
          "Boundary loading error:",
          error
        );

        onError(
          "Unable to load Northeast India boundary."
        );
      });

    return () => {
      cancelled = true;
    };
  }, [onLoaded, onError]);

  useEffect(() => {
    if (
      !boundary ||
      fittedRef.current
    ) {
      return;
    }

    try {
      const layer =
        L.geoJSON(boundary);

      const bounds =
        layer.getBounds();

      if (bounds.isValid()) {
        map.fitBounds(
          bounds,
          {
            padding: [20, 20],
            maxZoom: 7,
          }
        );

        fittedRef.current = true;
      }
    } catch (error) {
      console.warn(
        "Could not fit map:",
        error
      );
    }
  }, [boundary, map]);

  if (!boundary) {
    return null;
  }

  return (
    <GeoJSON
      data={boundary}
      style={{
        color: "#2563eb",
        weight: 2,
        fillColor: "#93c5fd",
        fillOpacity: 0.08,
      }}
    />
  );
}

function MapViewportWatcher({
  onViewportChange,
  enabled,
}) {
  const map = useMap();

  const callbackRef =
    useRef(onViewportChange);

  const enabledRef =
    useRef(enabled);

  useEffect(() => {
    callbackRef.current =
      onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    enabledRef.current =
      enabled;

    if (enabled) {
      callbackRef.current(map);
    }
  }, [enabled, map]);

  useMapEvents({
    moveend() {
      if (enabledRef.current) {
        callbackRef.current(map);
      }
    },
  });

  return null;
}

function RiskMap() {
  const [
    predictions,
    setPredictions,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState(null);

  const [
    boundaryError,
    setBoundaryError,
  ] = useState(null);

  const [
    boundary,
    setBoundary,
  ] = useState(null);

  const [
    pointCount,
    setPointCount,
  ] = useState(0);

  const [zoom, setZoom] =
    useState(7);

  const predictionCacheRef =
    useRef(new Map());

  const requestIdRef =
    useRef(0);

  const timerRef =
    useRef(null);

  const controllerRef =
    useRef(null);

  const callbackRef =
    useRef(null);

  function mergePredictions(results) {
    for (const item of results) {
      const key =
        `${item.location.lat.toFixed(6)},${item.location.lon.toFixed(6)}`;

      const cache =
        predictionCacheRef.current;

      cache.delete(key);

      cache.set(
        key,
        item
      );

      while (
        cache.size >
        MAX_CACHED_PREDICTIONS
      ) {
        const oldest =
          cache.keys()
            .next()
            .value;

        cache.delete(
          oldest
        );
      }
    }

    setPredictions(
      Array.from(
        predictionCacheRef.current.values()
      )
    );
  }

  async function loadViewport(map) {
    const currentZoom =
      map.getZoom();

    setZoom(currentZoom);

    clearTimeout(
      timerRef.current
    );

    if (!boundary) {
      return;
    }

    if (
      currentZoom <
      MIN_RISK_ZOOM
    ) {
      requestIdRef.current += 1;

      controllerRef.current?.abort();

      setPointCount(0);
      setLoading(false);
      setError(null);

      return;
    }

    const viewport =
      map.getBounds();

    const viewportBounds =
      clipToNER({
        south:
          viewport.getSouth(),
        north:
          viewport.getNorth(),
        west:
          viewport.getWest(),
        east:
          viewport.getEast(),
      });

    if (!viewportBounds) {
      return;
    }

    /*
     * Generate points directly from the static
     * 0.1° backend grid.
     */
    const rawPoints =
      generateViewportPoints(
        viewportBounds
      );

    /*
     * Keep only points that fall inside the
     * actual Northeast state boundaries.
     */
    const points =
      filterPointsToNE(
        rawPoints,
        boundary
      );

    if (points.length === 0) {
      setPointCount(0);
      setLoading(false);

      setError(
        "No prediction points are inside Northeast India for this view."
      );

      return;
    }

    const requestId =
      ++requestIdRef.current;

    controllerRef.current?.abort();

    const controller =
      new AbortController();

    controllerRef.current =
      controller;

    setLoading(true);
    setError(null);

    setPointCount(
      points.length
    );

    try {
      const results =
        await getBatchRiskPredictions(
          points,
          controller.signal
        );

      if (
        requestId !==
        requestIdRef.current
      ) {
        return;
      }

      mergePredictions(
        results
      );
    } catch (err) {
      if (
        err?.name ===
          "CanceledError" ||
        err?.code ===
          "ERR_CANCELED"
      ) {
        return;
      }

      if (
        requestId !==
        requestIdRef.current
      ) {
        return;
      }

      console.error(
        "Prediction request failed:",
        err
      );

      setError(
        err?.response?.data
          ?.error ||
          "Unable to refresh landslide predictions."
      );
    } finally {
      if (
        requestId ===
        requestIdRef.current
      ) {
        setLoading(false);
      }
    }
  }

  function scheduleViewportLoad(map) {
    clearTimeout(
      timerRef.current
    );

    timerRef.current =
      setTimeout(
        () => {
          loadViewport(map);
        },
        VIEWPORT_DEBOUNCE_MS
      );
  }

  callbackRef.current =
    scheduleViewportLoad;

  useEffect(() => {
    return () => {
      clearTimeout(
        timerRef.current
      );

      controllerRef.current?.abort();

      requestIdRef.current += 1;
    };
  }, []);

  return (
    <div className="h-screen w-full">
      <MapContainer
        center={[
          26.0,
          94.0,
        ]}
        zoom={7}
        minZoom={5}
        maxZoom={14}
        className="h-full w-full"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <NortheastBoundary
          onLoaded={
            setBoundary
          }
          onError={
            setBoundaryError
          }
        />

        <MapViewportWatcher
          enabled={Boolean(
            boundary
          )}
          onViewportChange={(
            map
          ) =>
            callbackRef.current?.(
              map
            )
          }
        />

        {predictions.map(
          (item) => {
            const probability =
              item.prediction
                .probability;

            const color =
              getRiskColor(
                probability
              );

            const riskLabel =
              getRiskLabel(
                probability
              );

            return (
              <CircleMarker
                key={`${item.location.lat}-${item.location.lon}`}
                center={[
                  item.location.lat,
                  item.location.lon,
                ]}
                radius={7}
                pathOptions={{
                  color,
                  fillColor:
                    color,
                  fillOpacity:
                    0.75,
                  weight: 1.5,
                }}
              >
                <Popup>
                  <div className="min-w-[170px]">
                    <strong>
                      Landslide Risk
                    </strong>

                    <div>
                      Risk Level:{" "}
                      <strong>
                        {riskLabel}
                      </strong>
                    </div>

                    <div>
                      Risk Score:{" "}
                      {
                        item
                          .prediction
                          .risk_score
                      }
                    </div>

                    <div>
                      Probability:{" "}
                      {(
                        probability *
                        100
                      ).toFixed(
                        2
                      )}
                      %
                    </div>

                    <div>
                      Latitude:{" "}
                      {
                        item
                          .location
                          .lat
                      }
                    </div>

                    <div>
                      Longitude:{" "}
                      {
                        item
                          .location
                          .lon
                      }
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          }
        )}

        <div className="absolute left-4 top-4 z-[1000] max-w-sm rounded-lg bg-white/95 px-4 py-2 text-sm shadow">
          {!boundary
            ? "Loading Northeast India boundary..."
            : zoom <
              MIN_RISK_ZOOM
              ? "Zoom in to load AI risk analysis"
              : loading
                ? `Analyzing ${pointCount} Northeast points...`
                : `Showing ${predictions.length} loaded risk points`}
        </div>

        {loading &&
          predictions.length >
            0 && (
            <div className="absolute right-4 top-4 z-[1000] rounded-lg bg-white/90 px-3 py-2 text-xs text-gray-600 shadow">
              Updating current area…
            </div>
          )}

        {boundaryError && (
          <div className="absolute left-4 top-16 z-[1000] max-w-sm rounded-lg bg-white/95 px-4 py-2 text-sm text-red-600 shadow">
            {boundaryError}
          </div>
        )}

        {error &&
          !boundaryError && (
            <div className="absolute left-4 top-16 z-[1000] max-w-sm rounded-lg bg-white/95 px-4 py-2 text-sm text-red-600 shadow">
              {error}
            </div>
          )}
      </MapContainer>
    </div>
  );
}

export default RiskMap;