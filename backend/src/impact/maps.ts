// Optional: real road and footpath distances from the Google Maps Platform Routes API (computeRoutes).
// Only used when GOOGLE_MAPS_API_KEY is set; every answer is cached in MongoDB, and any failure falls back to the
// straight-line estimate in emissions.ts, so the footprint never depends on it.
import { logger } from '../logger.ts';
import type { ImpactCache } from './cache.ts';

export type LatLng = { lat: number; lng: number };
export type TravelMode = 'DRIVE' | 'WALK';
/** Distance in km, or null when unknown */
export type RouteLookup = (from: LatLng, to: LatLng, travel: TravelMode) => Promise<number | null>;

const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const TIMEOUT_MS = 2_500;
/** After the API refuses us (key restricted, API not enabled, quota), skip it for a few minutes */
const COOL_OFF_MS = 5 * 60_000;

const rounded = (p: LatLng) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
export const routeKey = (from: LatLng, to: LatLng, travel: TravelMode) => `route:${travel}:${rounded(from)}:${rounded(to)}`;

export function createRouteLookup(options: {
  apiKey: string | undefined;
  cache: ImpactCache;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): RouteLookup | null {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) return null;
  const { cache, fetchImpl = fetch, now = Date.now } = options;
  let quietUntil = 0;

  return async (from, to, travel) => {
    const key = routeKey(from, to, travel);
    try {
      const hit = (await cache.get([key])).get(key) as { km?: unknown } | undefined;
      if (typeof hit?.km === 'number') return hit.km;
    } catch {
      // A cache miss is fine: ask the API
    }
    if (now() < quietUntil) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const point = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
      const res = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'routes.distanceMeters' },
        body: JSON.stringify({ origin: point(from), destination: point(to), travelMode: travel, units: 'METRIC' }),
        signal: controller.signal,
      });
      if (!res.ok) {
        quietUntil = now() + COOL_OFF_MS;
        logger.warn('Impact', `Routes API answered ${res.status}; using straight-line estimates for a few minutes`);
        return null;
      }
      const meters = ((await res.json()) as { routes?: { distanceMeters?: unknown }[] }).routes?.[0]?.distanceMeters;
      if (typeof meters !== 'number' || !(meters > 0)) return null;
      const km = meters / 1000;
      await cache.put([[key, { km }]]).catch(() => {});
      return km;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}
