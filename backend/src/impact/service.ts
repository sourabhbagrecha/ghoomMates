// Reads a trip's squad, itinerary, expenses and the squad's picks from Postgres, builds the Green Trip report, and
// stores the squad's choices (ride modes, pledges). It never writes to the trips, itinerary or expenses tables.
import { ApiError } from '../http.ts';
import { cityOf } from '../heritage/crowd.ts';
import { logger } from '../logger.ts';
import { ImpactAi } from './ai.ts';
import type { ImpactDb } from './cache.ts';
import type { ImpactStop } from './crowd.ts';
import { allowedModes, isMode, FACTORS, type Mode } from './emissions.ts';
import { leftovers, type ExpenseRow } from './local.ts';
import type { RouteLookup } from './maps.ts';
import { PLEDGE_IDS, summarisePledges, type PledgeSummary, type PledgeTick } from './pledges.ts';
import { buildReport, legKey, legSpecs, type ImpactReport } from './report.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Expenses read per report; enough for any trip, and keeps the Gemini sorting bounded */
const MAX_EXPENSES = 300;
/** Parallel Routes API calls */
const ROUTE_CONCURRENCY = 6;

export type TripAccess = {
  userId: string;
  memberId: string;
  trip: { id: string; name: string; groupName: string; destination: string; startDate: string | null; expenseGroupId: string; dayTitles: string[] };
};

type Loaded = {
  members: { memberId: string; userId: string; name: string }[];
  stops: ImpactStop[];
  picks: Map<string, Mode>;
  ticks: PledgeTick[];
  expenses: ExpenseRow[];
};

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

export class ImpactService {
  private db: ImpactDb;
  private ai: ImpactAi;
  private routes: RouteLookup | null;

  constructor(db: ImpactDb, ai: ImpactAi, routes: RouteLookup | null = null) {
    this.db = db;
    this.ai = ai;
    this.routes = routes;
  }

  /** The caller's membership; non-members get 404 so trip ids don't leak */
  async access(tripId: string, userId: string): Promise<TripAccess> {
    if (!UUID.test(tripId)) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
    const { rows: [row] } = await this.db.pool.query(
      `SELECT t.id, t.name, t.group_name, t.destination, t.start_date, t.expense_group_id, t.day_titles, m.ledger_member_id
       FROM trips t JOIN trip_members m ON m.trip_id = t.id AND m.user_id = $2
       WHERE t.id = $1`,
      [tripId, userId],
    ) as { rows: Record<string, any>[] };
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
    return {
      userId,
      memberId: row.ledger_member_id,
      trip: {
        id: row.id, name: row.name, groupName: row.group_name, destination: row.destination,
        startDate: row.start_date ?? null, expenseGroupId: row.expense_group_id,
        dayTitles: Array.isArray(row.day_titles) ? row.day_titles.map(String) : [],
      },
    };
  }

  private async load(access: TripAccess, what: { stops?: boolean; expenses?: boolean } = { stops: true, expenses: true }): Promise<Loaded> {
    const tripId = access.trip.id;
    const q = (text: string, values: unknown[]) => this.db.pool.query(text, values).then(r => r.rows as Record<string, any>[]);
    const [members, stops, picks, ticks, expenses] = await Promise.all([
      q(
        `SELECT m.ledger_member_id AS member_id, m.user_id, u.name
         FROM trip_members m JOIN users u ON u.id = m.user_id JOIN group_members g ON g.id = m.ledger_member_id
         WHERE m.trip_id = $1 ORDER BY g.position`,
        [tripId],
      ),
      what.stops === false ? [] : q(
        'SELECT id, day_number, time, minutes, title, tag, place FROM trip_stops WHERE trip_id = $1 ORDER BY day_number, minutes, created_at',
        [tripId],
      ),
      q('SELECT from_stop_id, to_stop_id, mode FROM impact_legs WHERE trip_id = $1', [tripId]),
      q(
        `SELECT p.pledge_id, m.ledger_member_id AS member_id
         FROM impact_pledges p JOIN trip_members m ON m.trip_id = p.trip_id AND m.user_id = p.user_id
         WHERE p.trip_id = $1`,
        [tripId],
      ),
      what.expenses === false ? [] : q(
        'SELECT id, description, amount_paise, category FROM expenses WHERE group_id = $1 ORDER BY sequence DESC LIMIT $2',
        [access.trip.expenseGroupId, MAX_EXPENSES],
      ),
    ]);
    return {
      members: members.map(r => ({ memberId: r.member_id, userId: r.user_id, name: r.name })),
      stops: stops.map(r => ({
        id: r.id, dayNumber: r.day_number, time: r.time ?? '', minutes: r.minutes ?? 0, title: r.title, tag: r.tag ?? '', place: r.place ?? '',
      })),
      picks: new Map(picks.filter(r => isMode(r.mode)).map(r => [legKey(r.from_stop_id, r.to_stop_id), r.mode as Mode])),
      ticks: ticks.map(r => ({ pledgeId: r.pledge_id, memberId: r.member_id })),
      expenses: expenses.map(r => ({ id: r.id, description: String(r.description), amountPaise: Number(r.amount_paise), category: String(r.category ?? 'other') })),
    };
  }

  /** Real distances for the rides, when the Routes API is configured; empty otherwise */
  private async routeDistances(specs: ReturnType<typeof legSpecs>['specs']) {
    const found = new Map<string, { walkKm?: number; driveKm?: number }>();
    const lookup = this.routes;
    if (!lookup) return found;
    await mapLimit(specs.filter(s => !s.distances.lake), ROUTE_CONCURRENCY, async spec => {
      const [drive, walk] = await Promise.all([lookup(spec.from, spec.to, 'DRIVE'), lookup(spec.from, spec.to, 'WALK')]);
      if (drive !== null || walk !== null) found.set(legKey(spec.fromStopId, spec.toStopId), { driveKm: drive ?? undefined, walkKm: walk ?? undefined });
    });
    return found;
  }

  /**
   * The full report. `network: false` skips Gemini and uses only what it already answered (and cached), so changing
   * a ride or a pledge answers quickly.
   */
  async report(access: TripAccess, { network = true } = {}): Promise<ImpactReport> {
    const data = await this.load(access);
    const city = cityOf(access.trip.destination || access.trip.name);
    const { specs } = legSpecs(data.stops, city);
    const [routes, ai] = await Promise.all([
      this.routeDistances(specs),
      this.ai.classify(leftovers(data.expenses), { network }),
    ]);
    const report = buildReport({
      trip: access.trip,
      members: data.members,
      me: access.memberId,
      stops: data.stops,
      picks: data.picks,
      ticks: data.ticks,
      expenses: data.expenses,
      ai,
      routes,
    });
    return { ...report, swaps: await this.ai.phrase(report.swaps, { network }) };
  }

  /** Stores (or with `mode: null` clears) the ride the squad takes between two consecutive stops */
  async setLeg(access: TripAccess, input: unknown): Promise<ImpactReport> {
    const body = (input && typeof input === 'object' ? input : {}) as { fromStopId?: unknown; toStopId?: unknown; mode?: unknown };
    const { fromStopId, toStopId, mode } = body;
    if (typeof fromStopId !== 'string' || typeof toStopId !== 'string' || !UUID.test(fromStopId) || !UUID.test(toStopId)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'fromStopId and toStopId must be stop ids');
    }
    if (mode !== null && !isMode(mode)) {
      throw new ApiError(400, 'VALIDATION_ERROR', `mode must be one of walk, erickshaw, auto, cab, boat, or null to go back to the default`);
    }

    const data = await this.load(access, { stops: true, expenses: false });
    const { specs } = legSpecs(data.stops, cityOf(access.trip.destination || access.trip.name));
    const spec = specs.find(s => s.fromStopId === fromStopId && s.toStopId === toStopId);
    if (!spec) throw new ApiError(404, 'NOT_FOUND', 'That ride is not part of this trip’s plan');
    if (mode !== null && !allowedModes(spec.distances).includes(mode)) {
      throw new ApiError(400, 'VALIDATION_ERROR', mode === 'boat'
        ? 'There is no boat between those two stops'
        : `${FACTORS[mode].label} is not practical for that ride`);
    }

    if (mode === null) {
      await this.db.pool.query('DELETE FROM impact_legs WHERE trip_id = $1 AND from_stop_id = $2 AND to_stop_id = $3', [access.trip.id, fromStopId, toStopId]);
    } else {
      await this.db.pool.query(
        `INSERT INTO impact_legs (trip_id, from_stop_id, to_stop_id, mode, chosen_by) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (trip_id, from_stop_id, to_stop_id) DO UPDATE SET mode = excluded.mode, chosen_by = excluded.chosen_by, updated_at = now()`,
        [access.trip.id, fromStopId, toStopId, mode, access.userId],
      );
    }
    logger.info('Impact', `${access.userId} set ${spec.from.name} → ${spec.to.name} to ${mode ?? 'the default'} in trip ${access.trip.id}`);
    return this.report(access, { network: false });
  }

  async pledges(access: TripAccess): Promise<PledgeSummary> {
    const data = await this.load(access, { stops: false, expenses: false });
    return summarisePledges(data.ticks, data.members.map(m => m.memberId), access.memberId);
  }

  /** The caller ticks (or unticks) one of their own pledges */
  async setPledge(access: TripAccess, input: unknown) {
    const body = (input && typeof input === 'object' ? input : {}) as { pledgeId?: unknown; taken?: unknown };
    if (typeof body.pledgeId !== 'string' || !PLEDGE_IDS.has(body.pledgeId)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'pledgeId must be one of the squad pledges');
    }
    if (typeof body.taken !== 'boolean') throw new ApiError(400, 'VALIDATION_ERROR', 'taken must be true or false');
    if (body.taken) {
      await this.db.pool.query(
        'INSERT INTO impact_pledges (trip_id, user_id, pledge_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [access.trip.id, access.userId, body.pledgeId],
      );
    } else {
      await this.db.pool.query('DELETE FROM impact_pledges WHERE trip_id = $1 AND user_id = $2 AND pledge_id = $3', [access.trip.id, access.userId, body.pledgeId]);
    }
    const report = await this.report(access, { network: false });
    return { pledges: report.pledges, score: report.score };
  }
}

