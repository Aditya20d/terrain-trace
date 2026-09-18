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

const NER_BOUNDS = {
  south: 21,
  north: 34,
  west: 75,
  east: 98,
};

const BOUNDARY_URL = "/data/northeast_states.geojson";

const DEM_MACRO_TILE_SIZE = 4;

// Keep overview navigation available, but only run expensive analysis
// when the user is sufficiently zoomed in.
const MIN_RISK_ZOOM = 7;

// Maximum AI sampling points sent to the backend for one viewport.
const MAX_POINTS = 64;

// Safety limit: don't make one viewport trigger a huge number of
// 80–95 MB DEM downloads. Pan/zoom to continue into another area.
const MAX_DEM_TILES_PER_REQUEST = 2;

const VIEWPORT_DEBOUNCE_MS = 700;

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
  const south = Math.max(bounds.south, NER_BOUNDS.south);
  const north = Math.min(bounds.north, NER_BOUNDS.north);
  const west = Math.max(bounds.west, NER_BOUNDS.west);
  const east = Math.min(bounds.east, NER_BOUNDS.east);

  if (south >= north || west >= east) {
    return null;
  }

  return { south, north, west, east };
}

function getDemTileKey(lat, lon) {
  const south =
    Math.floor(lat / DEM_MACRO_TILE_SIZE) *
    DEM_MACRO_TILE_SIZE;

  const west =
    Math.floor(lon / DEM_MACRO_TILE_SIZE) *
    DEM_MACRO_TILE_SIZE;

  return `${south.toFixed(1)}_${west.toFixed(1)}`;
}

function getGridShape(bounds) {
  const latSpan = Math.max(bounds.north - bounds.south, 0.01);
  const lonSpan = Math.max(bounds.east - bounds.west, 0.01);
  const aspect = lonSpan / latSpan;

  let cols = Math.round(
    Math.sqrt(MAX_POINTS * aspect)
  );

  cols = clamp(cols, 4, 10);

  let rows = Math.ceil(
    MAX_POINTS / cols
  );

  rows = clamp(rows, 4, 10);

  while (rows * cols > MAX_POINTS) {
    if (rows >= cols) {
      rows -= 1;
    } else {
      cols -= 1;
    }
  }

  return { rows, cols };
}

function generateViewportPoints(bounds) {
  const clipped = clipToNER(bounds);

  if (!clipped) {
    return [];
  }

  const EDGE_EPSILON = 0.0001;

  const safeBounds = {
    south: clipped.south + EDGE_EPSILON,
    north: clipped.north - EDGE_EPSILON,
    west: clipped.west + EDGE_EPSILON,
    east: clipped.east - EDGE_EPSILON,
  };

  if (
    safeBounds.south >= safeBounds.north ||
    safeBounds.west >= safeBounds.east
  ) {
    return [];
  }

  const { rows, cols } =
    getGridShape(safeBounds);

  const points = [];

  for (let row = 0; row < rows; row += 1) {
    const lat =
      rows === 1
        ? (safeBounds.south + safeBounds.north) / 2
        : safeBounds.south +
          ((safeBounds.north - safeBounds.south) *
            row) /
            (rows - 1);

    for (let col = 0; col < cols; col += 1) {
      const lon =
        cols === 1
          ? (safeBounds.west + safeBounds.east) / 2
          : safeBounds.west +
            ((safeBounds.east - safeBounds.west) *
              col) /
              (cols - 1);

      points.push({
        lat: Number(lat.toFixed(6)),
        lon: Number(lon.toFixed(6)),
      });
    }
  }

  return points;
}

// --------------------------------------------------
// GeoJSON point-in-polygon
// --------------------------------------------------

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

function pointInPolygonCoordinates(
  lon,
  lat,
  rings
) {
  if (!Array.isArray(rings) || rings.length === 0) {
    return false;
  }

  if (!pointInRing(lon, lat, rings[0])) {
    return false;
  }

  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing(lon, lat, rings[i])) {
      return false;
    }
  }

  return true;
}

function pointInGeometry(
  lon,
  lat,
  geometry
) {
  if (!geometry) {
    return false;
  }

  if (geometry.type === "Polygon") {
    return pointInPolygonCoordinates(
      lon,
      lat,
      geometry.coordinates
    );
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some(
      (polygon) =>
        pointInPolygonCoordinates(
          lon,
          lat,
          polygon
        )
    );
  }

  if (geometry.type === "GeometryCollection") {
    return geometry.geometries?.some(
      (child) =>
        pointInGeometry(
          lon,
          lat,
          child
        )
    );
  }

  return false;
}

function pointInsideNortheast(
  lat,
  lon,
  geojson
) {
  if (!geojson) {
    return false;
  }

  if (
    geojson.type === "FeatureCollection"
  ) {
    return geojson.features?.some(
      (feature) =>
        pointInGeometry(
          lon,
          lat,
          feature?.geometry
        )
    );
  }

  if (geojson.type === "Feature") {
    return pointInGeometry(
      lon,
      lat,
      geojson.geometry
    );
  }

  return pointInGeometry(
    lon,
    lat,
    geojson
  );
}

function filterPointsToNortheast(
  points,
  boundary
) {
  return points.filter((point) =>
    pointInsideNortheast(
      point.lat,
      point.lon,
      boundary
    )
  );
}

// Keep only points belonging to the closest DEM tiles to the
// current viewport center. This prevents one request from starting
// many 80–95 MB OpenTopography downloads.
function limitPointsToDemTiles(
  points,
  mapCenter
) {
  const grouped = new Map();

  for (const point of points) {
    const key = getDemTileKey(
      point.lat,
      point.lon
    );

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }

    grouped.get(key).push(point);
  }

  if (
    grouped.size <=
    MAX_DEM_TILES_PER_REQUEST
  ) {
    return {
      points,
      tileCount: grouped.size,
    };
  }

  const rankedTiles =
    Array.from(grouped.entries())
      .map(([key, tilePoints]) => {
        const averageDistance =
          tilePoints.reduce(
            (sum, point) => {
              const dLat =
                point.lat -
                mapCenter.lat;

              const dLon =
                point.lon -
                mapCenter.lng;

              return (
                sum +
                dLat * dLat +
                dLon * dLon
              );
            },
            0
          ) / tilePoints.length;

        return {
          key,
          points: tilePoints,
          averageDistance,
        };
      })
      .sort(
        (a, b) =>
          a.averageDistance -
          b.averageDistance
      )
      .slice(
        0,
        MAX_DEM_TILES_PER_REQUEST
      );

  return {
    points: rankedTiles.flatMap(
      (tile) => tile.points
    ),
    tileCount: rankedTiles.length,
    skippedTileCount:
      grouped.size -
      rankedTiles.length,
  };
}

// --------------------------------------------------
// Boundary layer
// --------------------------------------------------

function NortheastBoundary({
  onLoaded,
  onError,
}) {
  const map = useMap();
  const [boundary, setBoundary] =
    useState(null);
  const fittedRef = useRef(false);

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
        if (cancelled) {
          return;
        }

        setBoundary(data);
        onLoaded(data);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

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
    if (!boundary || fittedRef.current) {
      return;
    }

    try {
      const layer =
        L.geoJSON(boundary);

      const bounds =
        layer.getBounds();

      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: [20, 20],
          maxZoom: 7,
        });

        fittedRef.current = true;
      }
    } catch (error) {
      console.warn(
        "Could not fit map to Northeast boundary:",
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
  const enabledRef = useRef(enabled);

  useEffect(() => {
    callbackRef.current =
      onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    enabledRef.current = enabled;

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
  const [predictions, setPredictions] =
    useState([]);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState(null);

  const [boundaryError, setBoundaryError] =
    useState(null);

  const [boundary, setBoundary] =
    useState(null);

  const [pointCount, setPointCount] =
    useState(0);

  const [zoom, setZoom] =
    useState(7);

  const [skippedTiles, setSkippedTiles] =
    useState(0);

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

  async function loadViewport(map) {
    const currentZoom =
      map.getZoom();

    setZoom(currentZoom);

    clearTimeout(timerRef.current);

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
      setSkippedTiles(0);
      setLoading(false);
      setError(null);

      return;
    }

    const viewport =
      map.getBounds();

    const viewportBounds =
      clipToNER({
        south: viewport.getSouth(),
        north: viewport.getNorth(),
        west: viewport.getWest(),
        east: viewport.getEast(),
      });

    if (!viewportBounds) {
      setPointCount(0);
      setLoading(false);
      setError(
        "Move the map into the supported Northeast region."
      );

      return;
    }

    const rawPoints =
      generateViewportPoints(
        viewportBounds
      );

    const nerPoints =
      filterPointsToNortheast(
        rawPoints,
        boundary
      );

    if (nerPoints.length === 0) {
      setPointCount(0);
      setLoading(false);
      setError(
        "No prediction points are inside Northeast India for this view."
      );

      return;
    }

    const limited =
      limitPointsToDemTiles(
        nerPoints,
        map.getCenter()
      );

    const points =
      limited.points;

    setSkippedTiles(
      limited.skippedTileCount || 0
    );

    if (points.length === 0) {
      setLoading(false);
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
    setPointCount(points.length);

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

      for (const item of results) {
        const key =
          `${item.location.lat.toFixed(6)},${item.location.lon.toFixed(6)}`;

        predictionCacheRef.current.set(
          key,
          item
        );
      }

      setPredictions(
        Array.from(
          predictionCacheRef.current.values()
        )
      );
    } catch (err) {
      if (
        err?.name === "CanceledError" ||
        err?.code === "ERR_CANCELED"
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
        "Failed to fetch predictions:",
        err
      );

      setError(
        err?.response?.data?.error ||
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
    clearTimeout(timerRef.current);

    timerRef.current =
      setTimeout(() => {
        loadViewport(map);
      }, VIEWPORT_DEBOUNCE_MS);
  }

  callbackRef.current =
    scheduleViewportLoad;

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      controllerRef.current?.abort();
      requestIdRef.current += 1;
    };
  }, []);

  return (
    <div className="h-screen w-full">
      <MapContainer
        center={[26.0, 94.0]}
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
          onLoaded={setBoundary}
          onError={setBoundaryError}
        />

        <MapViewportWatcher
          enabled={Boolean(boundary)}
          onViewportChange={(map) =>
            callbackRef.current?.(map)
          }
        />

        {predictions.map((item) => {
          const probability =
            item.prediction.probability;

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
                fillColor: color,
                fillOpacity: 0.75,
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
                      item.prediction
                        .risk_score
                    }
                  </div>

                  <div>
                    Probability:{" "}
                    {(
                      probability * 100
                    ).toFixed(2)}
                    %
                  </div>

                  <div>
                    Latitude:{" "}
                    {item.location.lat}
                  </div>

                  <div>
                    Longitude:{" "}
                    {item.location.lon}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        <div className="absolute left-4 top-4 z-[1000] max-w-sm rounded-lg bg-white/95 px-4 py-2 text-sm shadow">
          {!boundary
            ? "Loading Northeast India boundary..."
            : zoom < MIN_RISK_ZOOM
              ? "Zoom in to load AI risk analysis"
              : loading
                ? `Analyzing ${pointCount} Northeast points...`
                : `Showing ${predictions.length} loaded risk points`}
        </div>

        {loading &&
          predictions.length > 0 && (
            <div className="absolute right-4 top-4 z-[1000] rounded-lg bg-white/90 px-3 py-2 text-xs text-gray-600 shadow">
              Updating current area… Existing
              points remain visible.
            </div>
          )}

        {skippedTiles > 0 &&
          zoom >= MIN_RISK_ZOOM && (
            <div className="absolute left-4 top-16 z-[1000] max-w-sm rounded-lg bg-white/95 px-4 py-2 text-xs text-gray-600 shadow">
              This view spans several DEM tiles.
              Analyzing the two tiles nearest the
              map center. Pan or zoom to analyze
              the remaining area.
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
