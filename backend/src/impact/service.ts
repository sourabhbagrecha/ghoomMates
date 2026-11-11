// Reads a trip's squad, itinerary, expenses and the squad's picks from MongoDB, builds the Green Trip report, and
// stores the squad's choices (ride modes, pledges). It never writes to the trips, itinerary or expenses collections.
import { isDuplicateKey } from '../db.ts';
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
    const [trip, member] = await Promise.all([
      this.db.db.collection<any>('trips').findOne({ _id: tripId }),
      this.db.db.collection('trip_members').findOne({ trip_id: tripId, user_id: userId }),
    ]);
    if (!trip || !member) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
    return {
      userId,
      memberId: member.ledger_member_id,
      trip: {
        id: trip._id, name: trip.name, groupName: trip.group_name, destination: trip.destination ?? '',
        startDate: trip.start_date ?? null, expenseGroupId: trip.expense_group_id,
        dayTitles: Array.isArray(trip.day_titles) ? trip.day_titles.map(String) : [],
      },
    };
  }

  private async load(access: TripAccess, what: { stops?: boolean; expenses?: boolean } = { stops: true, expenses: true }): Promise<Loaded> {
    const tripId = access.trip.id;
    const db = this.db.db;
    const [members, stops, picks, pledges, expenses] = await Promise.all([
      // Members with a profile and a ledger member, in ledger order
      db.collection('trip_members').aggregate<Record<string, any>>([
        { $match: { trip_id: tripId } },
        { $lookup: { from: 'users', localField: 'user_id', foreignField: '_id', as: 'user' } },
        { $lookup: { from: 'group_members', localField: 'ledger_member_id', foreignField: '_id', as: 'ledger' } },
        { $unwind: '$user' },
        { $unwind: '$ledger' },
        { $sort: { 'ledger.position': 1 } },
        { $project: { member_id: '$ledger_member_id', user_id: 1, name: '$user.name' } },
      ]).toArray(),
      what.stops === false ? [] : db.collection<any>('trip_stops')
        .find({ trip_id: tripId }, { projection: { day_number: 1, time: 1, minutes: 1, title: 1, tag: 1, place: 1 } })
        .sort({ day_number: 1, minutes: 1, created_at: 1 })
        .toArray(),
      db.collection('impact_legs').find({ trip_id: tripId }, { projection: { from_stop_id: 1, to_stop_id: 1, mode: 1 } }).toArray(),
      db.collection('impact_pledges').find({ trip_id: tripId }, { projection: { user_id: 1, pledge_id: 1 } }).toArray(),
      what.expenses === false ? [] : db.collection<any>('expenses')
        .find({ group_id: access.trip.expenseGroupId }, { projection: { description: 1, amount_paise: 1, category: 1 } })
        .sort({ sequence: -1 })
        .limit(MAX_EXPENSES)
        .toArray(),
    ]);
    // A pledge counts for the member who ticked it, while they are still in the trip
    const memberOf = new Map(members.map(r => [r.user_id as string, r.member_id as string]));
    return {
      members: members.map(r => ({ memberId: r.member_id, userId: r.user_id, name: r.name })),
      stops: stops.map(r => ({
        id: r._id, dayNumber: r.day_number, time: r.time ?? '', minutes: r.minutes ?? 0, title: r.title, tag: r.tag ?? '', place: r.place ?? '',
      })),
      picks: new Map(picks.filter(r => isMode(r.mode)).map(r => [legKey(r.from_stop_id, r.to_stop_id), r.mode as Mode])),
      ticks: pledges.filter(r => memberOf.has(r.user_id)).map(r => ({ pledgeId: r.pledge_id, memberId: memberOf.get(r.user_id)! })),
      expenses: expenses.map(r => ({ id: r._id, description: String(r.description), amountPaise: Number(r.amount_paise), category: String(r.category ?? 'other') })),
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

    const legs = this.db.db.collection('impact_legs');
    const leg = { trip_id: access.trip.id, from_stop_id: fromStopId, to_stop_id: toStopId };
    if (mode === null) {
      await legs.deleteOne(leg);
    } else {
      await legs.updateOne(leg, { $set: { mode, chosen_by: access.userId, updated_at: new Date() } }, { upsert: true });
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
    const pledges = this.db.db.collection('impact_pledges');
    const pledge = { trip_id: access.trip.id, user_id: access.userId, pledge_id: body.pledgeId };
    if (body.taken) {
      // Already ticked is fine (a double tap racing itself hits the unique index)
      await pledges.updateOne(pledge, { $setOnInsert: { created_at: new Date() } }, { upsert: true }).catch((err) => {
        if (!isDuplicateKey(err)) throw err;
      });
    } else {
      await pledges.deleteOne(pledge);
    }
    const report = await this.report(access, { network: false });
    return { pledges: report.pledges, score: report.score };
  }
}

