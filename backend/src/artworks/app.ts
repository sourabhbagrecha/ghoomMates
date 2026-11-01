import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import type { User } from '../auth/types.ts';
import type { Gemini } from '../gemini.ts';
import { ApiError, jsonBody } from '../http.ts';
import { logger } from '../logger.ts';
import type { MediaStorage } from '../storage.ts';
import { ArtworkService, DEFAULT_DAILY_LIMIT, type ArtworkOptions, type ArtworksDb } from './service.ts';

export type Authenticate = (token: string) => Promise<User>;

export type ArtworksAppOptions = ArtworkOptions & {
  db: ArtworksDb;
  storage: MediaStorage;
  gemini: Gemini;
  authenticate: Authenticate;
  // Source of ARTWORKS_PER_TRIP_PER_DAY. Defaults to process.env.
  env?: Record<string, string | undefined>;
};

function bearer(req: Request) {
  const [type, token] = (req.headers.authorization ?? '').split(' ');
  return type?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

function dailyLimit(env: Record<string, string | undefined>) {
  const value = Number(env.ARTWORKS_PER_TRIP_PER_DAY);
  return Number.isInteger(value) && value >= 1 && value <= 1000 ? value : DEFAULT_DAILY_LIMIT;
}

// Squad Miniature: a trip photo painted as a Mewar miniature and other Udaipur traditions. Mount under /api/artworks.
export function createArtworksApp({ db, storage, gemini, authenticate, env = process.env, ...options }: ArtworksAppOptions) {
  const service = new ArtworkService(db, storage, gemini, { dailyLimit: dailyLimit(env), ...options });
  if (!gemini.imageEnabled) logger.warn('Artworks', 'Painting is disabled: set VERTEX_PROJECT (or GEMINI_API_KEY) for Gemini image generation. The app shows framed photos instead.');
  const router = Router();
  const user = (res: { locals: Record<string, any> }) => res.locals.user as User;

  const requireUser: RequestHandler = async (req, res, next) => {
    const token = bearer(req);
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue');
    res.locals.user = await authenticate(token);
    next();
  };

  router.use(requireUser);

  // Only trip members can see or add to a trip's gallery.
  router.param('tripId', async (_req, res, next, tripId: string) => {
    await service.assertMember(tripId, user(res).id);
    next();
  });

  // The squad's paintings, newest first, and how many more the trip can paint today.
  router.get('/trips/:tripId', async (req, res) => {
    res.json(await service.list(req.params.tripId as string));
  });

  // Paints one of the trip's photos: { photoId, style } -> { id, style, url, createdAt, … }. Takes 10 to 20 seconds.
  router.post('/trips/:tripId', jsonBody, async (req, res) => {
    const artwork = await service.create(user(res), req.params.tripId as string, req.body);
    res.status(201).json(artwork);
  });

  router.use((req) => {
    throw new ApiError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl.split('?')[0]} not found`);
  });

  return router;
}
