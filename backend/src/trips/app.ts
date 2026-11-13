import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import { ApiError, integer } from '../expenses/domain.ts';
import { jsonBody } from '../http.ts';
import { logger } from '../logger.ts';
import type { Database } from '../db.ts';
import type { MediaStorage } from '../storage.ts';
import type { User } from '../auth/types.ts';
import { atlasNearestFaces, createFaceSearch, type FaceSearch } from './faces.ts';
import { ItineraryService } from './itinerary.ts';
import { TripService, type TripAccess } from './service.ts';

export type Authenticate = (token: string) => Promise<User>;

function bearer(req: Request) {
  const [type, token] = (req.headers.authorization ?? '').split(' ');
  return type?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

function page(req: Request, max = 100) {
  const value = (name: string, fallback: number) => typeof req.query[name] === 'string' ? Number(req.query[name]) : fallback;
  return { limit: integer(value('limit', 50), 'limit', 1, max), offset: integer(value('offset', 0), 'offset', 0, 1_000_000) };
}

// Trip groups for signed-in users: create, invite, join, expenses, settlements and photo uploads. Mount under /api/trips.
export function createApp(db: Database, storage: MediaStorage, authenticate: Authenticate, clientOrigin: string, faceSearch: FaceSearch = createFaceSearch(atlasNearestFaces(db.db))) {
  const service = new TripService(db, storage, clientOrigin);
  const itinerary = new ItineraryService(db);
  const router = Router();
  const user = (res: { locals: Record<string, any> }) => res.locals.user as User;
  const access = (res: { locals: Record<string, any> }) => res.locals.access as TripAccess;
  const idempotencyKey = (req: Request) => req.get('idempotency-key') ?? '';

  const requireUser: RequestHandler = async (req, res, next) => {
    const token = bearer(req);
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue');
    res.locals.user = await authenticate(token);
    next();
  };

  // Invite preview is public so a link opened before signing in can still show the trip.
  router.get('/invites/:code', async (req, res) => {
    const token = bearer(req);
    const viewer = token ? await authenticate(token).catch(() => null) : null;
    res.json(await service.invitePreview(req.params.code, viewer?.id));
  });

  router.use(requireUser);

  router.get('/', async (_req, res) => {
    res.json({ items: await service.list(user(res).id) });
  });

  router.post('/', jsonBody, async (req, res) => {
    const trip = await service.create(user(res), req.body);
    logger.info('Trips', `${user(res).email} created trip "${trip.name}" (${trip.id})`);
    res.status(201).json(trip);
  });

  router.post('/join', jsonBody, async (req, res) => {
    const trip = await service.join(user(res), (req.body as { code?: string })?.code ?? '');
    logger.info('Trips', `${user(res).email} joined trip "${trip.name}" (${trip.id})`);
    res.json(trip);
  });

  router.param('tripId', async (_req, res, next, tripId: string) => {
    res.locals.access = await service.access(tripId, user(res).id);
    next();
  });

  router.get('/:tripId', async (_req, res) => {
    res.json(await service.detail(access(res)));
  });

  router.patch('/:tripId', jsonBody, async (req, res) => {
    const before = access(res).trip;
    const trip = await service.update(access(res), req.body);
    if (trip.startDate !== before.start_date || trip.endDate !== before.end_date) {
      logger.info('Trips', `${user(res).email} moved trip "${trip.name}" to ${trip.startDate ?? 'no date'} – ${trip.endDate ?? 'no date'}${trip.movedStops ? ` (${trip.movedStops} stop(s) moved to the new last day)` : ''}`);
    }
    res.json(trip);
  });

  router.get('/:tripId/summary', async (_req, res) => {
    res.json(await service.summary(access(res)));
  });

  router.get('/:tripId/expenses', async (req, res) => {
    const { limit, offset } = page(req);
    res.json({ items: await service.expenses(access(res), limit, offset), limit, offset });
  });

  router.post('/:tripId/expenses', jsonBody, async (req, res) => {
    const expense = await service.addExpense(access(res), user(res).id, idempotencyKey(req), req.body);
    logger.info('Trips', `Expense "${expense.description}" (${expense.amountPaise} paise) added to trip ${access(res).trip.id}`);
    res.status(201).json(expense);
  });

  router.get('/:tripId/settlements', async (req, res) => {
    const { limit, offset } = page(req);
    res.json({ items: await service.settlements(access(res), limit, offset), limit, offset });
  });

  router.post('/:tripId/settlements', jsonBody, async (req, res) => {
    res.status(201).json(await service.addSettlement(access(res), idempotencyKey(req), req.body));
  });

  router.post('/:tripId/uploads', jsonBody, async (req, res) => {
    res.status(201).json(await service.createUpload(access(res), req.body));
  });

  router.get('/:tripId/photos', async (req, res) => {
    const { limit, offset } = page(req, 500);
    res.json({ ...await service.photos(access(res), limit, offset), limit, offset });
  });

  // How far the face-indexer has got with your profile selfie: none | processing | ready | no_face | error.
  // The app polls it while the selfie is read and unlocks Find me on ready.
  router.get('/:tripId/photos/find-me/status', async (_req, res) => {
    res.json(await service.selfieStatus(user(res).id));
  });

  // Searches with the signed-in user's profile selfie; there is no request body.
  router.post('/:tripId/photos/find-me', async (_req, res) => {
    const started = Date.now();
    const result = await service.findMe(access(res), user(res).id, faceSearch);
    logger.info('Trips', `${user(res).email} found ${result.matches.length} photo(s) of themselves in trip ${access(res).trip.id} (${Date.now() - started} ms)`);
    res.json(result);
  });

  router.post('/:tripId/photos', jsonBody, async (req, res) => {
    const result = await service.addPhotos(access(res), user(res).id, req.body);
    logger.info('Trips', `${result.added} photo(s) added to trip ${access(res).trip.id}`);
    res.status(201).json(result);
  });

  router.get('/:tripId/itinerary', async (_req, res) => {
    res.json(await itinerary.itinerary(access(res), user(res).id));
  });

  router.put('/:tripId/itinerary', jsonBody, async (req, res) => {
    res.json(await itinerary.replace(access(res), user(res).id, req.body));
  });

  // Suggests a plan from the destination, dates, budget and every member's vibe; nothing is saved.
  router.post('/:tripId/itinerary/draft', jsonBody, async (req, res) => {
    res.json(await itinerary.draft(access(res), req.body));
  });

  router.post('/:tripId/stops', jsonBody, async (req, res) => {
    res.status(201).json(await itinerary.addStop(access(res), user(res).id, req.body));
  });

  router.patch('/:tripId/stops/:stopId', jsonBody, async (req, res) => {
    res.json(await itinerary.updateStop(access(res), req.params.stopId as string, req.body));
  });

  router.delete('/:tripId/stops/:stopId', async (req, res) => {
    await itinerary.deleteStop(access(res), req.params.stopId as string);
    res.status(204).end();
  });

  router.put('/:tripId/stops/:stopId/rsvp', jsonBody, async (req, res) => {
    res.json(await itinerary.rsvp(access(res), user(res).id, req.params.stopId as string, req.body));
  });

  router.use((req) => {
    throw new ApiError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl.split('?')[0]} not found`);
  });

  return router;
}
