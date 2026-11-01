import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import { ApiError, integer, object, requireThat, text } from '../expenses/domain.ts';
import type { Gemini } from '../gemini.ts';
import { jsonBody } from '../http.ts';
import { logger } from '../logger.ts';
import type { User } from '../auth/types.ts';
import type { TripAccess } from '../trips/service.ts';
import { tripLength } from '../trips/itinerary.ts';
import { composeMenu, type Menu } from './menu.ts';
import { HOST_BY_ID, HOSTS, type Host } from './partners.ts';
import { addDays, daysBetween, forecastDay, isDate, istDate, monthOf, normaliseMix, dateLabel, type Booking } from './plan.ts';
import { MONTH_NAMES } from './produce.ts';
import { MemoryStore, PgStore, type HospitalityDb, type HospitalityStore, type StoredBooking } from './store.ts';
import { describeMix, MEAL_INFO, MEALS, mixTotal, splitMix, type DietMix, type Meal } from './types.ts';
import { forecastView, hostCard, hostDetail, seasonView, wasteTrend } from './views.ts';

export type Authenticate = (token: string) => Promise<User>;

/** The slice of the trips module this one uses: membership check, and the itinerary's own stop insert/update/delete */
export type TripsLookup = { access(tripId: string, userId: string): Promise<TripAccess> };
export type StopsWriter = {
  addStop(access: TripAccess, userId: string, input: unknown): Promise<{ id: string }>;
  updateStop(access: TripAccess, stopId: string, input: unknown): Promise<{ id: string }>;
  deleteStop(access: TripAccess, stopId: string): Promise<void>;
};

export type HospitalityOptions = {
  authenticate: Authenticate;
  gemini: Gemini;
  /** Postgres; without it reservations are off and leftovers are kept in memory */
  db?: HospitalityDb;
  /** Overrides the store, for tests */
  store?: HospitalityStore;
  trips?: TripsLookup;
  stops?: StopsWriter;
  now?: () => Date;
  /** Gemini timeout in ms; the curated menu answers if it is slower */
  menuTimeoutMs?: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DAYS_AHEAD = 90;
const MENU_CACHE_MS = 10 * 60_000;
const MENU_RATE = { perMinute: 10 };

function bearer(req: Request) {
  const [type, token] = (req.headers.authorization ?? '').split(' ');
  return type?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

function query(req: Request, name: string, fallback: number, min: number, max: number) {
  const raw = req.query[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  requireThat(Number.isInteger(value) && value >= min && value <= max, `${name} must be a whole number from ${min} to ${max}`);
  return value;
}

const bookingView = (b: StoredBooking, host?: Host) => ({
  id: b.id, hostId: b.hostId, hostName: host?.name ?? b.hostId, hostArea: host?.area ?? '', tripId: b.tripId, group: b.group,
  date: b.date, dateLabel: dateLabel(b.date), meal: b.meal, mealLabel: MEAL_INFO[b.meal].label, time: b.time, headcount: b.headcount,
  dietary: b.dietary, note: b.note, stopId: b.stopId, dayNumber: b.dayNumber,
});

/** The stop's day in the trip: from the trip's dates, or the day the client picked when the trip has no dates yet */
function dayNumberFor(trip: TripAccess['trip'], date: string, requested: number | null): number | null {
  if (trip.start_date) {
    const day = daysBetween(trip.start_date, date) + 1;
    return day >= 1 && day <= tripLength(trip) ? day : null;
  }
  return Math.min(Math.max(requested ?? 1, 1), tripLength(trip));
}

const stopFor = (host: Host, b: { time: string; headcount: number; dietary: DietMix }, dayNumber: number) => ({
  dayNumber,
  time: b.time,
  title: `Mewari thali at ${host.name}`,
  tag: 'Food',
  place: `${host.name}, ${host.area}`,
  notes: `Table for ${b.headcount}${describeMix(b.dietary) ? ` (${describeMix(b.dietary)})` : ''}. Cooked to your head-count from farms around Udaipur. Booked on Ghoomates.`,
});

// Farm-to-table: sample partner kitchens and farms, squad table bookings, and the host's own forecast, orders and menu.
// Mount under /api/hospitality.
export function createHospitalityApp(options: HospitalityOptions) {
  const { authenticate, gemini, db, trips, stops } = options;
  const store: HospitalityStore = options.store ?? (db ? new PgStore(db) : new MemoryStore());
  const now = options.now ?? (() => new Date());
  const router = Router();

  const today = () => istDate(now());
  const hostOr404 = (id: unknown): Host => {
    const host = typeof id === 'string' ? HOST_BY_ID.get(id) : undefined;
    if (!host) throw new ApiError(404, 'NOT_FOUND', 'Unknown host');
    return host;
  };

  // A database hiccup shouldn't blank the traveller's list: logs only sharpen the score
  const logsOf = async (hostId: string): Promise<Awaited<ReturnType<HospitalityStore['wasteLogs']>>> => {
    try {
      const t = today();
      return await store.wasteLogs(hostId, addDays(t, -30), t);
    } catch (err) {
      logger.warn('Hospitality', `Could not read leftover logs for ${hostId}: ${(err as Error).message}`);
      return [];
    }
  };

  /* Public: hosts and what is on the farms */

  router.get('/hosts', async (_req, res) => {
    const month = monthOf(today());
    const hosts = await Promise.all(HOSTS.map(async host => hostCard(host, month, await logsOf(host.id))));
    // Greenest first
    hosts.sort((a, b) => b.green.score - a.green.score);
    res.json({ today: today(), month, monthName: MONTH_NAMES[month - 1], sample: true, season: seasonView(month), hosts });
  });

  router.get('/hosts/:id', async (req, res) => {
    const host = hostOr404(req.params.id);
    // `today` is the date in India, which the app uses to offer table dates whatever the phone's clock says
    res.json({ sample: true, today: today(), ...hostDetail(host, monthOf(today()), await logsOf(host.id)) });
  });

  /* Signed in */

  const requireUser: RequestHandler = async (req, res, next) => {
    const token = bearer(req);
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue');
    res.locals.user = await authenticate(token);
    next();
  };
  router.use(requireUser);
  const userOf = (res: { locals: Record<string, any> }) => res.locals.user as User;

  function requireTrips() {
    if (!store.persistent || !trips || !stops) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Squad tables need the trips database; try again in a moment');
    return { trips, stops };
  }

  async function tripAccess(raw: unknown, user: User) {
    const { trips: lookup } = requireTrips();
    if (typeof raw !== 'string' || !UUID.test(raw)) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
    return lookup.access(raw, user.id);
  }

  /** Seats the other squads haven't taken at this host, meal and day */
  async function seatsLeft(host: Host, date: string, meal: Meal, exceptTripId?: string) {
    const taken = (await store.bookingsForHost(host.id, date, date))
      .filter(b => b.meal === meal && b.tripId !== exceptTripId)
      .reduce((sum, b) => sum + b.headcount, 0);
    return Math.max(0, host.capacity - taken);
  }

  router.post('/hosts/:id/reservations', jsonBody, async (req, res) => {
    const host = hostOr404(req.params.id);
    const user = userOf(res);
    const body = object(req.body);
    const access = await tripAccess(body.tripId, user);

    requireThat(isDate(body.date), 'date must be a YYYY-MM-DD date');
    const date = body.date;
    const t = today();
    requireThat(date >= t, 'Pick today or a day to come');
    requireThat(date <= addDays(t, MAX_DAYS_AHEAD), `Tables open up to ${MAX_DAYS_AHEAD} days ahead`);
    requireThat(typeof body.meal === 'string' && (MEALS as readonly string[]).includes(body.meal), `meal must be one of ${MEALS.join(', ')}`);
    const meal = body.meal as Meal;
    requireThat(host.meals.includes(meal), `${host.name} doesn’t serve ${meal}`);
    const time = body.time === undefined ? MEAL_INFO[meal].defaultTime : String(body.time);
    requireThat(MEAL_INFO[meal].times.includes(time), `time must be one of ${MEAL_INFO[meal].times.join(', ')}`);
    const note = body.note === undefined || body.note === '' ? '' : text(body.note, 'note', 200);

    // The squad's size and the diets their profiles mention fill in whatever the request leaves out
    const squad = await store.squad(access.trip.id);
    const headcount = body.headcount === undefined ? squad?.members ?? 0 : integer(body.headcount, 'headcount', 1, 60);
    requireThat(headcount >= 1, 'headcount is required');
    requireThat(headcount <= host.capacity, `${host.name} seats up to ${host.capacity} at a time`);
    const dietary = body.dietary === undefined
      ? normaliseMix(squad?.diets, headcount)
      : (() => {
        const d = object(body.dietary);
        for (const key of ['veg', 'jain', 'vegan']) requireThat(d[key] === undefined || (Number.isInteger(d[key]) && (d[key] as number) >= 0), `dietary.${key} must be a whole number`);
        requireThat(Number(d.jain ?? 0) + Number(d.vegan ?? 0) <= headcount, 'Jain and vegan guests can’t outnumber the headcount');
        return normaliseMix(d as Partial<DietMix>, headcount);
      })();

    const left = await seatsLeft(host, date, meal, access.trip.id);
    if (headcount > left) throw new ApiError(409, 'FULLY_BOOKED', left ? `Only ${left} seats left for ${meal} at ${host.name} on ${dateLabel(date)}` : `${host.name} is full for ${meal} on ${dateLabel(date)}`);

    const requestedDay = body.dayNumber === undefined ? null : integer(body.dayNumber, 'dayNumber', 1, 60);
    const dayNumber = dayNumberFor(access.trip, date, requestedDay);
    const before = await store.findSlot(access.trip.id, host.id, date, meal);
    const saved = await store.saveBooking({ hostId: host.id, tripId: access.trip.id, group: access.trip.group_name, userId: user.id, date, meal, time, headcount, dietary, note });

    // The Food stop goes through the trips module's own insert, so the itinerary, RSVPs and crowd rules all behave as usual
    let stop: { id: string; dayNumber: number } | null = null;
    if (dayNumber !== null) {
      const { stops: writer } = requireTrips();
      const input = stopFor(host, saved, dayNumber);
      try {
        if (before?.stopId) {
          try {
            await writer.updateStop(access, before.stopId, input);
            stop = { id: before.stopId, dayNumber };
          } catch (err) {
            // The squad deleted the stop meanwhile: add a fresh one
            if ((err as ApiError).status !== 404) throw err;
          }
        }
        if (!stop) stop = { ...await writer.addStop(access, user.id, input), dayNumber };
        await store.setStop(saved.id, stop.id, dayNumber);
      } catch (err) {
        if (!before) await store.deleteBooking(saved.id).catch(() => {});
        throw err;
      }
    }

    logger.info('Hospitality', `${user.email} booked ${headcount} for ${meal} at ${host.name} on ${date}${stop ? ` (stop on day ${stop.dayNumber})` : ' (outside the trip dates, no stop)'}`);
    const final = (await store.findBooking(saved.id)) ?? saved;
    res.status(before ? 200 : 201).json({
      reservation: bookingView(final, host),
      stop,
      updated: Boolean(before),
      seatsLeft: Math.max(0, left - headcount),
    });
  });

  router.get('/reservations', async (req, res) => {
    const access = await tripAccess(req.query.tripId, userOf(res));
    const [items, squad] = await Promise.all([store.bookingsForTrip(access.trip.id), store.squad(access.trip.id)]);
    // The squad's size and diets are what a new booking would start from
    res.json({ items: items.map(b => bookingView(b, HOST_BY_ID.get(b.hostId))), squad });
  });

  router.delete('/reservations/:id', async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) throw new ApiError(404, 'NOT_FOUND', 'Reservation not found');
    const booking = await store.findBooking(id);
    if (!booking) throw new ApiError(404, 'NOT_FOUND', 'Reservation not found');
    const user = userOf(res);
    const access = await tripAccess(booking.tripId, user);
    if (booking.stopId) {
      await requireTrips().stops.deleteStop(access, booking.stopId).catch((err: ApiError) => {
        if (err.status !== 404) throw err;
      });
    }
    await store.deleteBooking(booking.id);
    logger.info('Hospitality', `${user.email} cancelled the table at ${booking.hostId} on ${booking.date}`);
    res.status(204).end();
  });

  /* The host's side */

  async function bookingsFor(host: Host, from: string, to: string): Promise<Booking[]> {
    try {
      return await store.bookingsForHost(host.id, from, to);
    } catch (err) {
      logger.warn('Hospitality', `Could not read reservations for ${host.id}: ${(err as Error).message}`);
      return [];
    }
  }

  router.get('/hosts/:id/forecast', async (req, res) => {
    const host = hostOr404(req.params.id);
    const days = query(req, 'days', 7, 1, 14);
    const from = today();
    const [bookings, logs] = await Promise.all([bookingsFor(host, from, addDays(from, days - 1)), logsOf(host.id)]);
    res.json(forecastView(host, from, days, bookings, logs));
  });

  router.get('/hosts/:id/waste', async (req, res) => {
    const host = hostOr404(req.params.id);
    const days = query(req, 'days', 7, 1, 30);
    const t = today();
    const [logs, bookings] = await Promise.all([store.wasteLogs(host.id, addDays(t, -days + 1), t), bookingsFor(host, addDays(t, -days + 1), t)]);
    res.json(wasteTrend(host, t, days, logs, bookings));
  });

  router.post('/hosts/:id/waste', jsonBody, async (req, res) => {
    const host = hostOr404(req.params.id);
    const body = object(req.body);
    const t = today();
    const date = body.date === undefined ? t : body.date;
    requireThat(isDate(date), 'date must be a YYYY-MM-DD date');
    requireThat(date <= t && date >= addDays(t, -30), 'Log leftovers for today or the last 30 days');
    requireThat(typeof body.leftoverKg === 'number' && Number.isFinite(body.leftoverKg) && body.leftoverKg >= 0 && body.leftoverKg <= 500, 'leftoverKg must be a number from 0 to 500');
    const leftoverKg = Math.round(body.leftoverKg * 100) / 100;
    const bookings = await bookingsFor(host, date, date);
    // Covers default to what the forecast model expected that day
    const covers = body.covers === undefined ? forecastDay(host, date, bookings).covers : integer(body.covers, 'covers', 0, 2000);
    const noteText = body.note === undefined || body.note === '' ? '' : text(body.note, 'note', 200);
    const log = await store.saveWaste({ hostId: host.id, date, leftoverKg, covers, note: noteText }, userOf(res).id);
    logger.info('Hospitality', `${userOf(res).email} logged ${leftoverKg} kg of leftovers at ${host.name} for ${date}`);
    const days = 7;
    const [logs, recent] = await Promise.all([store.wasteLogs(host.id, addDays(t, -days + 1), t), bookingsFor(host, addDays(t, -days + 1), t)]);
    res.json({ log, ...wasteTrend(host, t, days, logs, recent) });
  });

  /* Gemini menu */

  const menuCache = new Map<string, { at: number; menu: Menu }>();
  const menuCalls = new Map<string, number[]>();

  function throttle(userId: string) {
    const nowMs = now().getTime();
    const recent = (menuCalls.get(userId) ?? []).filter(at => nowMs - at < 60_000);
    if (recent.length >= MENU_RATE.perMinute) throw new ApiError(429, 'RATE_LIMITED', 'GhoomMate is cooking a lot of menus; give it a minute');
    menuCalls.set(userId, [...recent, nowMs]);
  }

  router.post('/menu', jsonBody, async (req, res) => {
    const body = object(req.body);
    const host = hostOr404(body.hostId);
    const t = today();
    const date = body.date === undefined ? addDays(t, 1) : body.date;
    requireThat(isDate(date) && date >= t && date <= addDays(t, 30), 'date must be a day from today to the next 30');
    const forecast = forecastDay(host, date, await bookingsFor(host, date, date));
    const covers = body.covers === undefined ? Math.max(1, forecast.covers) : integer(body.covers, 'covers', 1, 400);
    // Without a mix of their own, the day's expected diets are scaled to the covers asked for
    const total = Math.max(1, mixTotal(forecast.diets.total));
    const mix = body.dietary === undefined
      ? splitMix(covers, { veg: forecast.diets.total.veg / total, jain: forecast.diets.total.jain / total, vegan: forecast.diets.total.vegan / total })
      : normaliseMix(object(body.dietary) as Partial<DietMix>, covers);
    const month = monthOf(date);

    const key = `${host.id}|${date}|${covers}|${mix.veg},${mix.jain},${mix.vegan}`;
    const cached = menuCache.get(key);
    if (cached && now().getTime() - cached.at < MENU_CACHE_MS) {
      res.json(cached.menu);
      return;
    }
    throttle(userOf(res).id);
    const menu = await composeMenu(gemini, host, { date, month, covers, mix }, options.menuTimeoutMs);
    if (menu.source === 'gemini') menuCache.set(key, { at: now().getTime(), menu });
    if (menuCache.size > 100) menuCache.delete(menuCache.keys().next().value!);
    res.json(menu);
  });

  router.use((req) => {
    throw new ApiError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl.split('?')[0]} not found`);
  });

  return router;
}

