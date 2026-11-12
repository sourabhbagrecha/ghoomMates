import type { RequestHandler } from 'express';
import { ApiError } from '../http.ts';
import { logger } from '../logger.ts';

// CARTO basemap tiles for the reel map scene, fetched with CARTO_API_KEY so the key never reaches the browser. Tiles come
// from the app's own origin, which also lets the in-browser MP4 renderer read their pixels. Without a key the app uses
// Esri tiles straight from the browser instead.

export const CARTO_STYLES = ['voyager', 'light_all', 'dark_all'] as const;
export type CartoStyle = (typeof CARTO_STYLES)[number];

const ORIGIN = 'https://basemaps.cartocdn.com/rastertiles';
const MAX_ZOOM = 18;
const TIMEOUT_MS = 10_000;
// Tiles kept in memory: a map scene uses about 90, a few hundred KB of PNG at most each
const CACHE_SIZE = 600;
// Tiles barely change; browsers keep them for a week
const BROWSER_CACHE = 'public, max-age=604800, immutable';

export type TileProxyOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  cacheSize?: number;
};

const whole = (value: unknown) => (typeof value === 'string' && /^\d{1,7}$/.test(value) ? Number(value) : NaN);

/** GET /tiles/carto/:style/:z/:x/:y.png -> the retina (@2x) PNG for that tile. */
export function createCartoTileProxy({ apiKey, fetchImpl = fetch, cacheSize = CACHE_SIZE }: TileProxyOptions): RequestHandler {
  const cache = new Map<string, Buffer>();
  // Tiles being fetched right now, so a burst of requests for one tile makes one upstream call
  const pending = new Map<string, Promise<Buffer>>();

  async function fetchTile(path: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${ORIGIN}/${path}?key=${encodeURIComponent(apiKey)}`, { signal: controller.signal });
      if (!res.ok) throw new ApiError(502, 'TILE_UNAVAILABLE', `CARTO answered ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(502, 'TILE_UNAVAILABLE', `Could not fetch the map tile: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  return async (req, res) => {
    const style = req.params.style as CartoStyle;
    const z = whole(req.params.z);
    const x = whole(req.params.x);
    const y = whole(String(req.params.y).replace(/\.png$/, ''));
    if (!CARTO_STYLES.includes(style) || !(z >= 0 && z <= MAX_ZOOM) || !(x >= 0 && x < 2 ** z) || !(y >= 0 && y < 2 ** z)) {
      throw new ApiError(404, 'NOT_FOUND', 'No such map tile');
    }
    const path = `${style}/${z}/${x}/${y}@2x.png`;
    let tile = cache.get(path);
    if (tile) {
      // Most recently used goes to the back, so the oldest is dropped first
      cache.delete(path);
      cache.set(path, tile);
    } else {
      let inflight = pending.get(path);
      if (!inflight) {
        inflight = fetchTile(path).finally(() => pending.delete(path));
        pending.set(path, inflight);
      }
      try {
        tile = await inflight;
      } catch (err) {
        logger.warn('Reels', `Map tile ${path}: ${(err as Error).message}`);
        throw err;
      }
      cache.set(path, tile);
      if (cache.size > cacheSize) cache.delete(cache.keys().next().value as string);
    }
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': BROWSER_CACHE });
    res.send(tile);
  };
}
