import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import type { User } from '../auth/types.ts';
import type { Claude } from '../claude.ts';
import type { Gemini } from '../gemini.ts';
import { ApiError, jsonBody } from '../http.ts';
import { logger } from '../logger.ts';
import type { MediaStorage } from '../storage.ts';
import { ReelService, type ReelOptions, type ReelsDb } from './service.ts';
import { createCartoTileProxy } from './tiles.ts';

export type Authenticate = (token: string) => Promise<User>;

export type ReelsAppOptions = ReelOptions & {
  db: ReelsDb;
  storage: MediaStorage;
  gemini: Gemini;
  // Writes the plan when Gemini fails (ANTHROPIC_API_KEY)
  claude?: Claude;
  // CARTO basemaps for the map scene (CARTO_API_KEY); without it the app uses Esri tiles
  cartoApiKey?: string;
  // For the CARTO tile proxy, so tests can stand in for CARTO
  fetchImpl?: typeof fetch;
  authenticate: Authenticate;
};

function bearer(req: Request) {
  const [type, token] = (req.headers.authorization ?? '').split(' ');
  return type?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

// Reel studio: Gemini (or Claude when Gemini fails) cuts a reel plan from the trip's photos and a prompt; the app plays it with Remotion. Mount under /api/reels.
export function createReelsApp({ db, storage, gemini, claude, cartoApiKey, fetchImpl, authenticate, ...options }: ReelsAppOptions) {
  const service = new ReelService(db, storage, gemini, claude, options);
  if (!gemini.enabled && !claude?.enabled) logger.warn('Reels', 'Gemini and Claude are off (set GEMINI_API_KEY or ANTHROPIC_API_KEY): reels use the template cut.');
  const router = Router();
  const user = (res: { locals: Record<string, any> }) => res.locals.user as User;

  const requireUser: RequestHandler = async (req, res, next) => {
    const token = bearer(req);
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue');
    res.locals.user = await authenticate(token);
    next();
  };

  // Map tiles are loaded by <img>, which can't send the sign-in token, so they come before it. They are public basemap
  // tiles; the route only proxies CARTO's own styles and tile numbers.
  const mapTiles = cartoApiKey?.trim() ? 'carto' : 'esri';
  if (mapTiles === 'carto') router.get('/tiles/carto/:style/:z/:x/:y', createCartoTileProxy({ apiKey: cartoApiKey!.trim(), fetchImpl }));

  router.use(requireUser);

  // Only trip members can see or cut a trip's reels.
  router.param('tripId', async (_req, res, next, tripId: string) => {
    await service.assertMember(tripId, user(res).id);
    next();
  });

  // The squad's reels, newest first, and which map tiles the app should draw: { items, mapTiles: 'carto' | 'esri' }.
  router.get('/trips/:tripId', async (req, res) => {
    res.json({ ...(await service.list(req.params.tripId as string)), mapTiles });
  });

  // Cuts a reel: { prompt, photoIds? } -> { id, prompt, plan, seconds, source, … }. Takes 5 to 20 seconds with Gemini, longer when Claude steps in.
  router.post('/trips/:tripId', jsonBody, async (req, res) => {
    res.status(201).json(await service.create(user(res), req.params.tripId as string, req.body));
  });

  router.use((req) => {
    throw new ApiError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl.split('?')[0]} not found`);
  });

  return router;
}
