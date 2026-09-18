require("dotenv").config();

const axios = require("axios");
const GeoTIFF = require("geotiff");
const fs = require("fs");
const path = require("path");

const API_KEY = process.env.OPENTOPOGRAPHY_API_KEY;

const CACHE_DIR = path.join(
  __dirname,
  "../../../data/dem-cache"
);

const OPEN_TOPOGRAPHY_URL =
  "https://portal.opentopography.org/API/globaldem";

// Operational cache tiles are deliberately much larger than the old 0.1° tiles.
// The point grid is sparse at map-overview zooms, so large tiles dramatically
// reduce OpenTopography API calls while preserving exact point-level DEM lookup.
const TILE_SIZE = 4.0;
const TILE_PADDING = 0.02;
const CACHE_VERSION = "v2_4deg_cop90";

// Never start many OpenTopography processing jobs at once.
const DOWNLOAD_CONCURRENCY = 2;
const MAX_RETRIES = 3;

// Parsed images stay in memory so points inside a tile do not repeatedly parse
// the same GeoTIFF. Files remain on disk across server restarts.
const parsedTileCache = new Map();
const pendingDownloads = new Map();
const pendingTileLoads = new Map();

function ensureCacheDirectory() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function runWithConcurrency(items, concurrency, worker) {
  if (items.length === 0) return Promise.resolve([]);

  const results = new Array(items.length);
  let nextIndex = 0;

  async function workerLoop() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  return Promise.all(
    Array.from({ length: workerCount }, () => workerLoop())
  ).then(() => results);
}

function getTileCoordinates(lat, lon) {
  const latIndex = Math.floor(lat / TILE_SIZE);
  const lonIndex = Math.floor(lon / TILE_SIZE);

  const south = latIndex * TILE_SIZE;
  const west = lonIndex * TILE_SIZE;

  return {
    south,
    north: south + TILE_SIZE,
    west,
    east: west + TILE_SIZE,
  };
}

function getCacheKey(lat, lon) {
  const { south, west } = getTileCoordinates(lat, lon);
  return `${CACHE_VERSION}_${south.toFixed(1)}_${west.toFixed(1)}`;
}

function getFilePath(cacheKey) {
  return path.join(CACHE_DIR, `${cacheKey}.tif`);
}

function decodeErrorBody(data) {
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8", 0, 800);
  }
  if (typeof data === "string") {
    return data.slice(0, 800);
  }
  return JSON.stringify(data).slice(0, 800);
}

function isGeoTiffBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return false;
  }

  // TIFF magic numbers: little-endian II 2A 00 or big-endian MM 00 2A.
  return (
    (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
    (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
  );
}

function shouldRetry(error) {
  const status = error.response?.status;
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    !error.response
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestDemWithRetry(params, cacheKey) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await axios.get(
        OPEN_TOPOGRAPHY_URL,
        {
          params,
          responseType: "arraybuffer",
          timeout: 120000,
          validateStatus: () => true,
        }
      );

      const contentType = String(
        response.headers?.["content-type"] || ""
      ).toLowerCase();

      if (
        response.status < 200 ||
        response.status >= 300 ||
        !isGeoTiffBuffer(Buffer.from(response.data))
      ) {
        const body = decodeErrorBody(
          Buffer.from(response.data)
        );

        const error = new Error(
          `OpenTopography DEM request failed for ${cacheKey}: HTTP ${response.status}, content-type=${contentType}, body=${body}`
        );
        error.response = response;

        if (!shouldRetry(error) || attempt === MAX_RETRIES) {
          throw error;
        }

        lastError = error;
      } else {
        return Buffer.from(response.data);
      }
    } catch (error) {
      lastError = error;

      if (!shouldRetry(error) || attempt === MAX_RETRIES) {
        throw error;
      }
    }

    const delay = 1000 * 2 ** (attempt - 1);
    console.warn(
      `Retrying DEM tile ${cacheKey} in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
    );
    await sleep(delay);
  }

  throw lastError || new Error("DEM request failed");
}

async function downloadDem(lat, lon) {
  if (!API_KEY) {
    throw new Error(
      "OPENTOPOGRAPHY_API_KEY is not configured"
    );
  }

  ensureCacheDirectory();

  const cacheKey = getCacheKey(lat, lon);
  const filePath = getFilePath(cacheKey);

  if (fs.existsSync(filePath)) {
    return filePath;
  }

  if (pendingDownloads.has(cacheKey)) {
    return pendingDownloads.get(cacheKey);
  }

  const { south, north, west, east } =
    getTileCoordinates(lat, lon);

  const params = {
    demtype: "COP90",
    south: south - TILE_PADDING,
    north: north + TILE_PADDING,
    west: west - TILE_PADDING,
    east: east + TILE_PADDING,
    outputFormat: "GTiff",
    API_Key: API_KEY,
  };

  console.log(
    `Downloading COP90 DEM macro-tile: ${cacheKey}`
  );

  const requestPromise = requestDemWithRetry(
    params,
    cacheKey
  )
    .then((buffer) => {
      fs.writeFileSync(filePath, buffer);
      console.log(
        `DEM macro-tile cached: ${cacheKey} (${Math.round(buffer.length / 1024 / 1024)} MB)`
      );
      return filePath;
    })
    .finally(() => {
      pendingDownloads.delete(cacheKey);
    });

  pendingDownloads.set(cacheKey, requestPromise);
  return requestPromise;
}

function touchParsedTile(cacheKey, tile) {
  // Map insertion order acts as a tiny LRU cache.
  parsedTileCache.delete(cacheKey);
  parsedTileCache.set(cacheKey, tile);
}

function evictParsedTiles(maxTiles = 6) {
  while (parsedTileCache.size > maxTiles) {
    const oldestKey = parsedTileCache.keys().next().value;
    parsedTileCache.delete(oldestKey);
  }
}

async function loadParsedTile(lat, lon) {
  const cacheKey = getCacheKey(lat, lon);

  if (parsedTileCache.has(cacheKey)) {
    const tile = parsedTileCache.get(cacheKey);
    touchParsedTile(cacheKey, tile);
    return tile;
  }

  if (pendingTileLoads.has(cacheKey)) {
    return pendingTileLoads.get(cacheKey);
  }

  const loadPromise = (async () => {
    const filePath = await downloadDem(lat, lon);
    const buffer = await fs.promises.readFile(filePath);

    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );

    const tiff = await GeoTIFF.fromArrayBuffer(
      arrayBuffer
    );
    const image = await tiff.getImage();

    const tile = {
      image,
      width: image.getWidth(),
      height: image.getHeight(),
      originX: image.getOrigin()[0],
      originY: image.getOrigin()[1],
      resolutionX: Math.abs(image.getResolution()[0]),
      resolutionY: Math.abs(image.getResolution()[1]),
    };

    touchParsedTile(cacheKey, tile);
    evictParsedTiles(6);

    return tile;
  })().finally(() => {
    pendingTileLoads.delete(cacheKey);
  });

  pendingTileLoads.set(cacheKey, loadPromise);
  return loadPromise;
}

async function calculateElevationAndSlope(tile, lat, lon) {
  const col = Math.floor(
    (lon - tile.originX) / tile.resolutionX
  );

  const row = Math.floor(
    (tile.originY - lat) / tile.resolutionY
  );

  if (
    col < 1 ||
    row < 1 ||
    col >= tile.width - 1 ||
    row >= tile.height - 1
  ) {
    throw new Error(
      `Coordinate ${lat},${lon} is too close to DEM tile boundary`
    );
  }

  const values = await tile.image.readRasters({
    samples: [0],
    window: [
      col - 1,
      row - 1,
      col + 2,
      row + 2,
    ],
  });

  const raster = values[0];

  const z01 = Number(raster[1]);
  const z10 = Number(raster[3]);
  const z11 = Number(raster[4]);
  const z12 = Number(raster[5]);
  const z21 = Number(raster[7]);

  // Preserve the exact training-time slope calculation.
  const dzDx = (z12 - z10) / (2 * 90);
  const dzDy = (z21 - z01) / (2 * 90);

  const slope =
    Math.atan(
      Math.sqrt(
        dzDx * dzDx + dzDy * dzDy
      )
    ) *
    (180 / Math.PI);

  return {
    elevation_m: z11,
    slope_deg: slope,
  };
}

async function getElevationAndSlope(lat, lon) {
  const tile = await loadParsedTile(lat, lon);
  return calculateElevationAndSlope(tile, lat, lon);
}

async function getElevationAndSlopeBatch(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }

  const results = new Array(points.length);

  // First identify the unique macro-tiles required by this batch.
  const tileGroups = new Map();

  points.forEach((point, index) => {
    const key = getCacheKey(point.lat, point.lon);
    if (!tileGroups.has(key)) {
      tileGroups.set(key, {
        point,
        indices: [],
      });
    }
    tileGroups.get(key).indices.push(index);
  });

  const groups = Array.from(tileGroups.values());

  console.log(
    `DEM batch: ${points.length} points across ${groups.length} macro-tiles`
  );

  // Limit OpenTopography downloads; points inside each tile are processed only
  // after that tile is available.
  await runWithConcurrency(
    groups,
    DOWNLOAD_CONCURRENCY,
    async (group) => {
      const tile = await loadParsedTile(
        group.point.lat,
        group.point.lon
      );

      for (const index of group.indices) {
        const point = points[index];
        results[index] = await calculateElevationAndSlope(
          tile,
          point.lat,
          point.lon
        );
      }
    }
  );

  return results;
}

module.exports = {
  getElevationAndSlope,
  getElevationAndSlopeBatch,
};
