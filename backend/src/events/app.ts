import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import { ApiError, jsonBody } from '../http.ts';
import type { Database } from '../db.ts';
import type { User } from '../auth/types.ts';
import { cityOf } from '../heritage/crowd.ts';
import type { MediaStorage } from '../storage.ts';
import { ItineraryService } from '../trips/itinerary.ts';
import { TripService } from '../trips/service.ts';
import { EVENT_BY_ID } from './calendar.ts';
import { addDays, daysBetween, isIsoDate, todayInIndia } from './dates.ts';
import { DEFAULT_SPAN_DAYS, MAX_SPAN_DAYS, listEvents } from './logic.ts';
import { EventsService, type EventsTrips } from './service.ts';

export type Authenticate = (token: string) => Promise<User>;

export type EventsAppOptions = {
  /** Needed for adding to a plan: turns a session token into the signed-in user */
  authenticate?: Authenticate;
  /** Needed for adding to a plan: trip membership and the itinerary stop */
  trips?: EventsTrips;
  now?: () => Date;
};

function bearer(req: Request) {
  const [type, token] = (req.headers.authorization ?? '').split(' ');
  return type?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

const oneOf = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

// Mewar Utsav: Udaipur's festivals, fairs and nightly shows with the crowd each brings, plus a way to put one in a squad's
// plan. Mount under /api/events. Browsing is public and needs no database; adding to a plan needs a signed-in trip member.
export function createEventsApp({ authenticate, trips, now = () => new Date() }: EventsAppOptions = {}) {
  const router = Router();
  const service = trips ? new EventsService(trips) : null;

  const requireUser: RequestHandler = async (req, res, next) => {
    if (!service || !authenticate) {
      throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Adding to a plan needs the database; set DATABASE_URL or CLOUD_SQL_INSTANCE');
    }
    const token = bearer(req);
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue');
    res.locals.user = await authenticate(token);
    next();
  };

  // Events with a run in the window (default: today and the next four months), the nightly shows, and the events whose
  // dates are not out yet: ?city=Udaipur&from=2026-11-01&to=2026-11-14
  router.get('/', (req, res) => {
    if (!cityOf(oneOf(req.query.city) ?? 'Udaipur')) throw new ApiError(404, 'NOT_FOUND', `No events for ${String(req.query.city)} yet`);
    const today = todayInIndia(now());
    const fromQuery = oneOf(req.query.from);
    const toQuery = oneOf(req.query.to);
    if (fromQuery && !isIsoDate(fromQuery)) throw new ApiError(400, 'VALIDATION_ERROR', 'from must be a YYYY-MM-DD date');
    if (toQuery && !isIsoDate(toQuery)) throw new ApiError(400, 'VALIDATION_ERROR', 'to must be a YYYY-MM-DD date');
    const from = fromQuery ?? today;
    const to = toQuery ?? addDays(from, DEFAULT_SPAN_DAYS);
    if (to < from) throw new ApiError(400, 'VALIDATION_ERROR', 'to must not be before from');
    if (daysBetween(from, to) > MAX_SPAN_DAYS) throw new ApiError(400, 'VALIDATION_ERROR', `Ask for at most ${MAX_SPAN_DAYS} days at a time`);
    res.json(listEvents({ from, to, today }));
  });

  // Add the event to a day of the squad's plan: { tripId, date, time?, dayNumber? }. Members only. 201 with the new stop and
  // what the crowd model says about it.
  router.post('/:id/stops', requireUser, jsonBody, async (req, res) => {
    const event = EVENT_BY_ID.get(String(req.params.id));
    if (!event) throw new ApiError(404, 'NOT_FOUND', 'We don’t know that event');
    res.status(201).json(await service!.addToTrip(res.locals.user as User, event, req.body));
  });

  router.use((req) => {
    throw new ApiError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl.split('?')[0]} not found`);
  });

  return router;
}

/** The real trips bridge, for when the server has a database */
export function createPostgresEvents(db: Database, storage: MediaStorage, clientOrigin: string): EventsTrips {
  const tripService = new TripService(db, storage, clientOrigin);
  const itinerary = new ItineraryService(db);
  return {
    access: (tripId, userId) => tripService.access(tripId, userId),
    addStop: (access, userId, input) => itinerary.addStop(access, userId, input),
    hasStop: async (tripId, dayNumber, title) => {
      const { rows } = await db.pool.query(
        'SELECT 1 FROM trip_stops WHERE trip_id = $1 AND day_number = $2 AND lower(title) = lower($3) LIMIT 1',
        [tripId, dayNumber, title],
      );
      return rows.length > 0;
    },
  };
}
