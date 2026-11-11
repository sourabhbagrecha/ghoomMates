import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import { ApiError, jsonBody } from '../http.ts';
import { integer, object, requireThat, text } from '../expenses/domain.ts';
import type { Database } from '../db.ts';
import type { Gemini } from '../gemini.ts';
import type { User } from '../auth/types.ts';
import { SITE_BY_ID } from '../heritage/sites.ts';
import type { MediaStorage } from '../storage.ts';
import { TripService } from '../trips/service.ts';
import { ItineraryService } from '../trips/itinerary.ts';
import { answerQuestion, MAX_QUESTION } from './ask.ts';
import { CRAFT_BY_ID, CRAFTS, ITEM_SIZES, type ItemSize } from './crafts.ts';
import { availabilityFor, fairPriceCheck, isIsoDate, listMakers, summarise } from './logic.ts';
import { CLOSED_DATES, MAKER_BY_ID, MAKERS } from './makers.ts';
import { MakersService, type MakersTrips } from './service.ts';
import { MongoMakersStore, type MakersStore } from './store.ts';

export type Authenticate = (token: string) => Promise<User>;

export type MakersAppOptions = {
  /** Answers visitor questions when it is on; the curated FAQ answers otherwise */
  gemini?: Gemini;
  /** Needed for booking: turns a session token into the signed-in user */
  authenticate?: Authenticate;
  /** Needed for booking: where bookings are kept */
  store?: MakersStore;
  /** Needed for booking: trip membership and the itinerary stop */
  trips?: MakersTrips;
  now?: () => Date;
};

function bearer(req: Request) {
  const [type, token] = (req.headers.authorization ?? '').split(' ');
  return type?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

const oneOf = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** At most `limit` calls per client per minute, for the one route that costs a Gemini call */
function rateLimiter(limit: number, now: () => number = Date.now) {
  const calls = new Map<string, number[]>();
  return (client: string) => {
    const cutoff = now() - 60_000;
    const recent = (calls.get(client) ?? []).filter(t => t > cutoff);
    if (recent.length >= limit) return false;
    calls.set(client, [...recent, now()]);
    return true;
  };
}

// Makers of Udaipur: curated crafts and sample makers, a fair-price checker and squad workshop bookings. Mount under
// /api/makers. Browsing needs no sign-in and no database; booking needs both.
export function createMakersApp({ gemini, authenticate, store, trips, now = () => new Date() }: MakersAppOptions = {}) {
  const router = Router();
  const service = store && trips ? new MakersService(store, trips, now) : null;
  const allowAsk = rateLimiter(20);

  const requireUser: RequestHandler = async (req, res, next) => {
    if (!service || !authenticate) {
      throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Booking workshops needs the database; set MONGODB_CONNECTION_STRING');
    }
    const token = bearer(req);
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue');
    res.locals.user = await authenticate(token);
    next();
  };
  const user = (res: { locals: Record<string, any> }) => res.locals.user as User;

  const makerOf = (req: Request) => {
    const maker = MAKER_BY_ID.get(String(req.params.id));
    if (!maker) throw new ApiError(404, 'NOT_FOUND', 'We don’t know that maker');
    return maker;
  };

  // Makers, optionally for one craft and sorted by distance from a heritage site: ?craft=miniature&near=city-palace&maxKm=1.5
  router.get('/', (req, res) => {
    const craft = oneOf(req.query.craft);
    const near = oneOf(req.query.near);
    if (craft && !CRAFT_BY_ID.has(craft)) throw new ApiError(400, 'VALIDATION_ERROR', 'craft must be one of the ids from GET /api/makers/crafts');
    if (near && !SITE_BY_ID.has(near)) throw new ApiError(400, 'VALIDATION_ERROR', 'near must be a heritage site id such as city-palace');
    const maxKm = oneOf(req.query.maxKm) === null ? null : Number(req.query.maxKm);
    if (maxKm !== null && !(maxKm > 0 && maxKm <= 100)) throw new ApiError(400, 'VALIDATION_ERROR', 'maxKm must be a number between 0 and 100');
    const site = near ? SITE_BY_ID.get(near)! : null;
    res.json({
      items: listMakers({ craft, near, maxKm }),
      near: site && { id: site.id, name: site.name, lat: site.lat, lng: site.lng },
      craft: craft ? { id: craft, name: CRAFT_BY_ID.get(craft)!.name } : null,
    });
  });

  router.get('/crafts', (_req, res) => {
    res.json({ items: CRAFTS.map(craft => ({ ...craft, makerCount: MAKERS.filter(m => m.craftIds.includes(craft.id)).length })) });
  });

  // Is that quote fair? { craftId, size: small | medium | large, quoted: rupees, antique?: boolean }
  router.post('/price-check', jsonBody, (req, res) => {
    const body = object(req.body);
    const craftId = oneOf(body.craftId) ?? '';
    requireThat(CRAFT_BY_ID.has(craftId), 'craftId must be one of the ids from GET /api/makers/crafts');
    requireThat(typeof body.size === 'string' && (ITEM_SIZES as readonly string[]).includes(body.size), `size must be one of ${ITEM_SIZES.join(', ')}`);
    const quoted = integer(body.quoted, 'quoted', 1, 10_000_000);
    res.json(fairPriceCheck(craftId, body.size as ItemSize, quoted, { antique: body.antique === true }));
  });

  // Your squad's workshops for a trip (members only). Registered before /:id.
  router.get('/bookings', requireUser, async (req, res) => {
    res.json({ items: await service!.bookings(user(res), req.query.tripId) });
  });

  router.get('/:id', (req, res) => {
    const maker = makerOf(req);
    const near = oneOf(req.query.near);
    if (near && !SITE_BY_ID.has(near)) throw new ApiError(400, 'VALIDATION_ERROR', 'near must be a heritage site id such as city-palace');
    res.json({
      maker: {
        ...summarise(maker, near),
        story: maker.story,
        workshop: maker.workshop,
        craftDetails: maker.craftIds.map(id => CRAFT_BY_ID.get(id)!),
        // Questions the ask box can suggest
        questions: [...maker.faq.map(f => f.q), 'How do I spot the real thing?', 'What do we take away?'].slice(0, 4),
        closedDates: CLOSED_DATES,
      },
    });
  });

  // Workshop slots on a date and how many places are left: ?date=2026-11-12
  router.get('/:id/slots', async (req, res) => {
    const maker = makerOf(req);
    const date = oneOf(req.query.date);
    if (!isIsoDate(date)) throw new ApiError(400, 'VALIDATION_ERROR', 'date must be a YYYY-MM-DD date');
    res.json(service ? await service.slots(maker, date) : availabilityFor(maker, date, {}, now()));
  });

  // A visitor's question about this maker or craft, answered from their facts only
  router.post('/:id/ask', jsonBody, async (req, res) => {
    const maker = makerOf(req);
    const question = text(object(req.body).question, 'question', MAX_QUESTION);
    if (!allowAsk(req.ip ?? 'unknown')) throw new ApiError(429, 'RATE_LIMITED', 'That’s a lot of questions at once. Give it a minute.');
    res.json(await answerQuestion(maker, question, gemini));
  });

  // Book a workshop for the squad: { tripId, date, slot, people, note? } adds a stop to the trip's itinerary
  router.post('/:id/bookings', requireUser, jsonBody, async (req, res) => {
    const maker = makerOf(req);
    res.status(201).json(await service!.book(user(res), maker, req.body));
  });

  router.use((req) => {
    throw new ApiError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl.split('?')[0]} not found`);
  });

  return router;
}

/** The real store and trips bridge, for when the server has a database */
export function createMongoMakers(db: Database, storage: MediaStorage, clientOrigin: string): { store: MakersStore; trips: MakersTrips } {
  const tripService = new TripService(db, storage, clientOrigin);
  const itinerary = new ItineraryService(db);
  return {
    store: new MongoMakersStore(db),
    trips: {
      access: (tripId, userId) => tripService.access(tripId, userId),
      addStop: (access, userId, input) => itinerary.addStop(access, userId, input),
    },
  };
}
