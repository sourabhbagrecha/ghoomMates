import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import { ApiError, jsonBody } from '../http.ts';
import { logger } from '../logger.ts';
import type { User } from '../auth/types.ts';
import type { Gemini } from '../gemini.ts';
import { PACKED_FROM, BUSY_FROM, cityOf, dayFactor, formatTime, indiaNow } from '../heritage/crowd.ts';
import type { HeritageCity } from '../heritage/sites.ts';
import { object } from '../expenses/domain.ts';
import {
  MemoryAdvisoryStore, PostgresAdvisoryStore, isActive, isIsoDate, isUuid, parseNewAdvisory, parseSiteId, parseWindow,
  partnerAdvisory, publicAdvisory, type AdvisoryStore, type OpsDb,
} from './advisories.ts';
import { loadPlannedStops } from './demand.ts';
import { draftMessages, type AdvisoryLevel, type DraftFacts } from './draft.ts';
import {
  ADVISORY_PICKUP, MIN_SQUADS, alternativeSiteFor, alternativeTimeFor, buildForecast, defaultWindow, peakInWindow, reachOf, reliefOf,
  shownPeople, shownSquads, type PlannedStop,
} from './forecast.ts';
import { sampleStops } from './sample.ts';

export type Authenticate = (token: string) => Promise<User>;

export type OpsAppOptions = {
  /** Without a database the console shows the modelled baseline (plus sample squads) and keeps advisories in memory */
  db?: OpsDb;
  authenticate: Authenticate;
  gemini?: Gemini;
  /** OPS_SAMPLE_SQUADS=off turns the simulated demo squads off by default */
  env?: Record<string, string | undefined>;
  now?: () => Date;
};

function bearer(req: Request) {
  const [type, token] = (req.headers.authorization ?? '').split(' ');
  return type?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

/** true/false from a query string or JSON value, else the fallback */
function flag(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  const text = value.trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(text)) return false;
  if (['1', 'true', 'on', 'yes'].includes(text)) return true;
  return fallback;
}

function dateOr(value: unknown, fallback: string) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!isIsoDate(value)) throw new ApiError(400, 'VALIDATION_ERROR', 'date must look like 2026-11-02');
  return value;
}

function cityParam(value: unknown): HeritageCity {
  const city = cityOf(typeof value === 'string' ? value : '');
  if (!city) throw new ApiError(404, 'NOT_FOUND', `No crowd data for ${String(value)} yet`);
  return city;
}

/** Reach as shown to partners: small groups hidden, plus an estimate of how many people leave the crunch if some squads swap */
function reachSummary(reach: ReturnType<typeof reachOf>) {
  return {
    squads: shownSquads(reach.squads),
    people: shownPeople(reach.squads, reach.people),
    includesSample: reach.includesSample,
    relief: reach.squads >= MIN_SQUADS ? reliefOf(reach.people) : null,
    pickup: ADVISORY_PICKUP,
  };
}

// Heritage Ops: smart crowd management for site managers and the city. It reads where squads plan to be (itinerary
// stops with times), adds that to the modelled crowd curves to forecast the day, and lets a manager publish an advisory
// that reaches every squad planned into the crunch. Partner access is a demo stub: any signed-in user can use it.
// Mount under /api/ops.
export function createOpsApp({ db, authenticate, gemini, env = process.env, now = () => new Date() }: OpsAppOptions) {
  const router = Router();
  const store: AdvisoryStore = db ? new PostgresAdvisoryStore(db) : new MemoryAdvisoryStore();
  const sampleByDefault = flag(env.OPS_SAMPLE_SQUADS, true);
  if (!db) logger.warn('Ops', 'No database: the console shows the modelled baseline plus sample squads, and advisories are kept in memory');

  const requireUser: RequestHandler = async (req, res, next) => {
    const token = bearer(req);
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue');
    res.locals.user = await authenticate(token);
    next();
  };

  /** Real planned stops from the trips, plus the simulated squads when asked; a failing query degrades to the baseline */
  async function plannedStops(city: HeritageCity, date: string, includeSample: boolean) {
    let real: PlannedStop[] = [];
    let live = false;
    if (db) {
      try {
        real = await loadPlannedStops(db, city, date);
        live = true;
      } catch (err) {
        logger.warn('Ops', `Could not read planned stops (${err instanceof Error ? err.message : String(err)}); showing the modelled baseline`);
      }
    }
    const sample = includeSample ? sampleStops(city, date) : [];
    return { stops: [...real, ...sample], live, sampleSquads: new Set(sample.map(s => s.squad)).size };
  }

  // Crowd forecast for every site and hour of a day: modelled baseline, what squads add, hotspots and KPIs
  router.get('/:city/forecast', requireUser, async (req, res) => {
    const city = cityParam(req.params.city);
    const date = dateOr(req.query.date, indiaNow(now()).date);
    const includeSample = flag(req.query.sample, sampleByDefault);
    const { stops, live, sampleSquads } = await plannedStops(city, date, includeSample);
    res.json({
      ...buildForecast(city, date, dayFactor(date).reason, stops),
      meta: { live, sample: includeSample, sampleSquads },
    });
  });

  // Active advisories, public so every traveller's app can show them. The console asks for `reach=1` (and signs in) to also
  // see how many squads each one reached.
  router.get('/advisories', async (req, res) => {
    const city = req.query.city === undefined ? undefined : cityParam(req.query.city);
    const date = typeof req.query.date === 'string' && req.query.date !== '' ? dateOr(req.query.date, '') : undefined;
    const today = indiaNow(now());
    const token = bearer(req);
    const partner = req.query.reach === '1' && token ? await authenticate(token).then(() => true, () => false) : false;
    // Travellers' screens must never break on this: if the store fails they simply see no advisories
    const stored = await store.list({ city, fromDate: today.date, date }).catch((err) => {
      logger.warn('Ops', `Could not read advisories (${err instanceof Error ? err.message : String(err)})`);
      return [];
    });
    const items = stored.filter(a => isActive(a, today)).slice(0, 50);
    res.json({ items: items.map(a => (partner ? partnerAdvisory(a) : publicAdvisory(a))) });
  });

  // Drafts a bilingual advisory for a site and day from the forecast: the crunch window, the level, a calmer site and a
  // calmer time. Gemini writes the two messages; without it a template does. Nothing is saved.
  router.post('/advisories/draft', requireUser, jsonBody, async (req, res) => {
    const body = object(req.body);
    const site = parseSiteId(body.siteId);
    const date = dateOr(body.date, indiaNow(now()).date);
    const includeSample = flag(body.sample, sampleByDefault);
    const { stops } = await plannedStops(site.city, date, includeSample);
    const forecast = buildForecast(site.city, date, dayFactor(date).reason, stops);
    const siteForecast = forecast.sites.find(s => s.id === site.id)!;

    const window = body.startMinutes === undefined && body.endMinutes === undefined
      ? defaultWindow(siteForecast) ?? { startMinutes: 10 * 60, endMinutes: 12 * 60 }
      : parseWindow(body.startMinutes, body.endMinutes);
    const { startMinutes, endMinutes } = window;
    const peak = peakInWindow(siteForecast, startMinutes, endMinutes);
    const level: AdvisoryLevel = peak !== null && peak >= PACKED_FROM ? 'packed' : 'busy';
    const alternativeSite = alternativeSiteFor(forecast, site.id, startMinutes, endMinutes);
    const alternativeTime = alternativeTimeFor(forecast, site.id, startMinutes, endMinutes);
    const reach = reachOf(stops, site.id, startMinutes, endMinutes);

    const facts: DraftFacts = { siteId: site.id, siteName: site.name, startMinutes, endMinutes, level, alternativeSite, alternativeTime };
    const drafted = await draftMessages(gemini, facts);
    res.json({
      source: drafted.source,
      draft: {
        siteId: site.id, siteName: site.name, date, startMinutes, endMinutes,
        startTime: formatTime(startMinutes), endTime: formatTime(endMinutes % 1440),
        level, peakLevel: peak, calm: peak === null || peak < BUSY_FROM,
        squads: shownSquads(reach.squads), people: shownPeople(reach.squads, reach.people), includesSample: reach.includesSample,
        messageEn: drafted.messageEn, messageHi: drafted.messageHi,
        alternative: {
          site: alternativeSite && {
            id: alternativeSite.id, name: alternativeSite.name, level: alternativeSite.level, label: alternativeSite.label, km: alternativeSite.km,
            calmUntil: alternativeSite.calmUntilMinutes === null ? null : formatTime(alternativeSite.calmUntilMinutes),
          },
          time: alternativeTime && { minutes: alternativeTime.minutes, time: alternativeTime.time, level: alternativeTime.level, label: alternativeTime.label },
        },
      },
    });
  });

  // Who an advisory for this site and window would reach right now (the composer shows it while the manager adjusts the window)
  router.post('/advisories/reach', requireUser, jsonBody, async (req, res) => {
    const body = object(req.body);
    const site = parseSiteId(body.siteId);
    const date = dateOr(body.date, indiaNow(now()).date);
    const { startMinutes, endMinutes } = parseWindow(body.startMinutes, body.endMinutes);
    const { stops } = await plannedStops(site.city, date, flag(body.sample, sampleByDefault));
    res.json(reachSummary(reachOf(stops, site.id, startMinutes, endMinutes)));
  });

  // Publishes an advisory and estimates who it reaches: the squads and people planned into that site and window
  router.post('/advisories', requireUser, jsonBody, async (req, res) => {
    const user = res.locals.user as User;
    const today = indiaNow(now());
    const input = parseNewAdvisory(req.body, today.date);
    const includeSample = flag((req.body as { sample?: unknown }).sample, sampleByDefault);
    const { stops } = await plannedStops(input.city, input.date, includeSample);
    const reach = reachOf(stops, input.siteId, input.startMinutes, input.endMinutes);
    const saved = await store.create({ ...input, reachSquads: reach.squads, reachPeople: reach.people, createdBy: user.id });
    logger.info('Ops', `${user.email} published a ${saved.level} advisory for ${saved.siteId} on ${saved.date} (${reach.squads} squads in reach)`);
    res.status(201).json({ advisory: partnerAdvisory(saved), reach: reachSummary(reach) });
  });

  // Withdraws an advisory; travellers stop seeing it straight away
  router.delete('/advisories/:id', requireUser, async (req, res) => {
    const id = String(req.params.id);
    if (!isUuid(id) || !(await store.withdraw(id))) throw new ApiError(404, 'NOT_FOUND', 'Advisory not found');
    logger.info('Ops', `${(res.locals.user as User).email} withdrew advisory ${id}`);
    res.status(204).end();
  });

  return router;
}
