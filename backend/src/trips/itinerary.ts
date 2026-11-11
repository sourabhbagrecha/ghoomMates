import { randomUUID } from 'node:crypto';
import { ApiError, integer, object, requireThat, text } from '../expenses/domain.ts';
import { transaction, type ClientSession, type Database, type Db } from '../db.ts';
import { logger } from '../logger.ts';
import { cityOf, crowdBrief, crowdForStop } from '../heritage/crowd.ts';
import type { TripAccess } from './service.ts';
import { allocateSpotlights, rebalance, squadBrief, squadProfile, VIBE_AXES, type Fairness, type SquadProfile, type Vibe } from './vibe.ts';

export const STOP_TAGS = ['Adventure', 'Food', 'Chill', 'Culture', 'Nightlife', 'Shops', 'Stay', 'Travel'] as const;
const RSVPS = ['going', 'maybe', 'skip'] as const;
// A meal or a check-in near a ghat isn't a visit to it, so these stops get no crowd meter
const CROWDLESS_TAGS = new Set(['Food', 'Stay', 'Travel']);
const MAX_DAYS = 14;
const TIME = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

// forMembers: who the stop was planned for (empty for whole-group stops). axis: the vibe it serves, or 'group'.
// split: a split slot, where the options run in parallel for different members instead of pick-then-alternative.
export type DraftStop = { time: string; title: string; tag: string; place: string; notes: string; forMembers?: string[]; axis?: string; split?: boolean };
// Each slot holds the suggested stop first, then alternatives the app can swap to.
export type DraftDay = { title: string; slots: DraftStop[][] };
export type Draft = { days: DraftDay[]; tip: string; source: 'gemini' | 'template' };
export type SquadSummary = { sharedLoves: string[]; splits: string[]; vetoes: string[] };

function minutesOf(time: string) {
  const match = TIME.exec(time.trim());
  if (!match) return 0;
  const h = Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return Math.min(1439, h * 60 + Math.min(59, Number(match[2])));
}

function normaliseTime(value: unknown) {
  if (value === undefined || value === null || value === '') return '';
  requireThat(typeof value === 'string' && TIME.test(value.trim()), 'time must look like "05:30 PM"');
  const [, h, m, period] = TIME.exec(value.trim())!;
  return `${h.padStart(2, '0')}:${m} ${period.toUpperCase()}`;
}

function stopInput(value: unknown) {
  const s = object(value);
  const tag = s.tag === undefined || s.tag === '' ? '' : String(s.tag);
  requireThat(tag === '' || STOP_TAGS.includes(tag as never), `tag must be one of ${STOP_TAGS.join(', ')}`);
  const opt = (v: unknown, field: string, max: number) => {
    if (v === undefined || v === null || v === '') return '';
    requireThat(typeof v === 'string' && v.length <= max, `${field} must be at most ${max} characters`);
    return v.trim();
  };
  const time = normaliseTime(s.time);
  return { time, minutes: minutesOf(time), title: text(s.title, 'title', 200), tag, place: opt(s.place, 'place', 200), notes: opt(s.notes, 'notes', 2000) };
}

const parseDate = (value: string) => new Date(`${value}T00:00:00Z`);

/** "2026-11-12" for day 3 of a trip starting 2026-11-10; null without dates */
export function dateOfDay(startDate: string | null, day: number) {
  if (!startDate) return null;
  const date = parseDate(startDate);
  date.setUTCDate(date.getUTCDate() + day - 1);
  return date.toISOString().slice(0, 10);
}

/** Number of days in the trip: its date range, the flexible length picked when creating it, or 3. */
export function tripLength(trip: TripAccess['trip']) {
  if (trip.start_date) {
    const end = trip.end_date ?? trip.start_date;
    return Math.min(MAX_DAYS, Math.round((parseDate(end).getTime() - parseDate(trip.start_date).getTime()) / 86_400_000) + 1);
  }
  const flexible = Number((trip.details as { flexibleDays?: unknown }).flexibleDays);
  return Number.isInteger(flexible) && flexible > 0 ? Math.min(MAX_DAYS, flexible) : 3;
}

/**
 * A trip that gets shorter keeps every stop: the ones planned for days that no longer exist move to the new last day
 * (their times stay), and the day titles shrink with the trip. Returns how many stops moved.
 * Call it in the same transaction that saves the new dates.
 */
export async function fitStopsToLength(db: Db, tripId: string, length: number, session?: ClientSession) {
  const moved = await db.collection('trip_stops').updateMany({ trip_id: tripId, day_number: { $gt: length } }, { $set: { day_number: length } }, { session });
  await db.collection('trips').updateOne(
    { _id: tripId as any, [`day_titles.${length}`]: { $exists: true } },
    [{ $set: { day_titles: { $slice: ['$day_titles', length] } } }],
    { session },
  );
  return moved.modifiedCount;
}

/**
 * Deletes stops and what hung off them (the old ON DELETE rules): their RSVPs and impact legs go, maker bookings and
 * hospitality reservations stay but lose the stop link.
 */
export async function deleteStopsCascade(db: Db, stopIds: string[], session?: ClientSession) {
  if (!stopIds.length) return;
  const ids = { $in: stopIds };
  // One at a time: a transaction's operations can't run in parallel on its session
  await db.collection('trip_stop_rsvps').deleteMany({ stop_id: ids }, { session });
  await db.collection('impact_legs').deleteMany({ $or: [{ from_stop_id: ids }, { to_stop_id: ids }] }, { session });
  await db.collection('maker_bookings').updateMany({ stop_id: ids }, { $unset: { stop_id: '' } }, { session });
  await db.collection('hospitality_reservations').updateMany({ stop_id: ids }, { $unset: { stop_id: '' } }, { session });
  await db.collection('trip_stops').deleteMany({ _id: ids as any }, { session });
}

export class ItineraryService {
  private database: Database;
  private db: Db;
  private geminiKey?: string;
  private geminiModel: string;

  constructor(database: Database, env = process.env) {
    this.database = database;
    this.db = database.db;
    this.geminiKey = env.GEMINI_API_KEY || undefined;
    // Lite with minimal thinking drafts a multi-day plan in under 10 seconds
    this.geminiModel = env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  }

  get aiEnabled() {
    return Boolean(this.geminiKey);
  }

  async itinerary(access: TripAccess, userId: string) {
    const trip = access.trip;
    const [docs, members, row] = await Promise.all([
      this.db.collection('trip_stops').find({ trip_id: trip.id }).sort({ day_number: 1, minutes: 1, created_at: 1 }).toArray(),
      this.db.collection('trip_members').find({ trip_id: trip.id }).sort({ joined_at: 1 }).toArray(),
      this.db.collection('trips').findOne({ _id: trip.id as any }, { projection: { day_titles: 1 } }),
    ]);
    const rsvpDocs = await this.db.collection('trip_stop_rsvps').find({ stop_id: { $in: docs.map(s => s._id) } }).toArray();
    // RSVPs from people who left the trip don't count
    const memberOf = new Map(members.map(m => [m.user_id as string, m.ledger_member_id as string]));
    const stops = docs.map(s => ({
      id: s._id as unknown as string, day_number: s.day_number as number, time: s.time as string, title: s.title as string,
      tag: s.tag as string, place: s.place as string, notes: s.notes as string,
      rsvps: rsvpDocs.filter(r => r.stop_id === s._id && memberOf.has(r.user_id)).map(r => ({ memberId: memberOf.get(r.user_id)!, userId: r.user_id, rsvp: r.rsvp })),
    }));
    const titles: string[] = row?.day_titles ?? [];
    const length = Math.max(tripLength(trip), titles.length, ...stops.map(s => s.day_number));
    const city = cityOf(trip.destination || trip.name);
    return {
      days: Array.from({ length }, (_, i) => {
        const dayStops = stops.filter(s => s.day_number === i + 1);
        const date = dateOfDay(trip.start_date, i + 1);
        return {
          number: i + 1,
          title: titles[i] ?? '',
          stops: dayStops.map(s => {
            const rsvps = s.rsvps as { memberId: string; userId: string; rsvp: string }[];
            const minutes = s.time ? minutesOf(s.time) : null;
            const taken = dayStops.filter(o => o.id !== s.id && o.time).map(o => minutesOf(o.time));
            const out = new Set(rsvps.filter(r => r.rsvp !== 'going').map(r => r.memberId));
            const mine = rsvps.find(r => r.userId === userId)?.rsvp;
            return {
              id: s.id, dayNumber: s.day_number, time: s.time, title: s.title, tag: s.tag, place: s.place, notes: s.notes,
              // Everyone is going unless they said otherwise
              going: members.map(m => m.ledger_member_id).filter(id => !out.has(id)),
              myRsvp: mine ?? 'going',
              answered: mine !== undefined,
              // How busy the heritage site is at that time, and a nudge off-peak
              crowd: CROWDLESS_TAGS.has(s.tag) ? null : crowdForStop({ title: s.title, place: s.place, minutes }, { city, date, taken }),
            };
          }),
        };
      }),
    };
  }

  // Replaces the whole plan, e.g. when the organiser shares the draft with the squad.
  async replace(access: TripAccess, userId: string, input: unknown) {
    const body = object(input);
    requireThat(Array.isArray(body.days) && body.days.length >= 1 && body.days.length <= MAX_DAYS, `Provide between 1 and ${MAX_DAYS} days`);
    const days = body.days.map(value => {
      const day = object(value);
      requireThat(Array.isArray(day.stops) && day.stops.length <= 20, 'Each day can have at most 20 stops');
      const title = day.title === undefined || day.title === '' ? '' : text(day.title, 'day title', 120);
      return { title, stops: (day.stops as unknown[]).map(stopInput) };
    });
    await transaction(this.database, async (session) => {
      const old = await this.db.collection('trip_stops').find({ trip_id: access.trip.id }, { projection: { _id: 1 }, session }).toArray();
      await deleteStopsCascade(this.db, old.map(s => s._id as unknown as string), session);
      await this.db.collection('trips').updateOne({ _id: access.trip.id as any }, { $set: { day_titles: days.map(d => d.title) } }, { session });
      const now = new Date();
      const rows = days.flatMap((d, i) => d.stops.map(s => ({ _id: randomUUID() as any, trip_id: access.trip.id, day_number: i + 1, ...s, created_by: userId, created_at: now })));
      if (rows.length) await this.db.collection('trip_stops').insertMany(rows, { session });
    });
    return this.itinerary(access, userId);
  }

  async addStop(access: TripAccess, userId: string, input: unknown) {
    const body = object(input);
    const day = integer(body.dayNumber, 'dayNumber', 1, 60);
    const stop = stopInput(body);
    const id = randomUUID();
    await transaction(this.database, async (session) => {
      const now = new Date();
      await this.db.collection('trip_stops').insertOne({ _id: id as any, trip_id: access.trip.id, day_number: day, ...stop, created_by: userId, created_at: now }, { session });
      // Whoever adds a stop is going
      await this.db.collection('trip_stop_rsvps').insertOne({ stop_id: id, user_id: userId, rsvp: 'going', updated_at: now }, { session });
    });
    return { id };
  }

  private async assertStop(access: TripAccess, stopId: string) {
    requireThat(/^[0-9a-f-]{36}$/i.test(stopId), 'Invalid stop id');
    const row = await this.db.collection('trip_stops').findOne({ _id: stopId as any, trip_id: access.trip.id }, { projection: { _id: 1 } });
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Stop not found');
  }

  async updateStop(access: TripAccess, stopId: string, input: unknown) {
    await this.assertStop(access, stopId);
    const body = object(input);
    const stop = stopInput(body);
    const day = body.dayNumber === undefined ? null : integer(body.dayNumber, 'dayNumber', 1, 60);
    await this.db.collection('trip_stops').updateOne({ _id: stopId as any }, { $set: { ...stop, ...(day === null ? {} : { day_number: day }) } });
    return { id: stopId };
  }

  async deleteStop(access: TripAccess, stopId: string) {
    await this.assertStop(access, stopId);
    await transaction(this.database, (session) => deleteStopsCascade(this.db, [stopId], session));
  }

  async rsvp(access: TripAccess, userId: string, stopId: string, input: unknown) {
    await this.assertStop(access, stopId);
    const rsvp = object(input).rsvp;
    requireThat(RSVPS.includes(rsvp as never), 'rsvp must be going, maybe or skip');
    await this.db.collection('trip_stop_rsvps').updateOne({ stop_id: stopId, user_id: userId }, { $set: { rsvp, updated_at: new Date() } }, { upsert: true });
    return { rsvp };
  }

  /* Draft generation */

  // The squad's vibe: every member's quiz scores (0–1 per axis), kept per member rather than averaged.
  private async squadVibe(tripId: string) {
    const members = await this.db.collection('trip_members').find({ trip_id: tripId }, { projection: { user_id: 1 } }).toArray();
    const rows = await this.db.collection('users').find({ _id: { $in: members.map(m => m.user_id) } as any }, { projection: { name: 1, preferences: 1 } }).toArray();
    const vibes = rows
      .map(r => ({ name: String(r.name).split(' ')[0], vibe: r.preferences?.vibe as Record<string, number> | undefined }))
      .filter(r => r.vibe && VIBE_AXES.every(a => typeof r.vibe![a] === 'number'));
    return { size: rows.length, profile: squadProfile(vibes.map(v => ({ name: v.name, vibe: v.vibe as Vibe }))) };
  }

  async draft(access: TripAccess, input: unknown) {
    const body = input && typeof input === 'object' ? input as Record<string, unknown> : {};
    const trip = access.trip;
    const days = tripLength(trip);
    const details = trip.details as { tweaks?: unknown; budgetLabel?: unknown };
    const tweaks = (Array.isArray(body.tweaks) ? body.tweaks : Array.isArray(details.tweaks) ? details.tweaks : [])
      .filter((t): t is string => typeof t === 'string').slice(0, 10);
    const onlyDay = body.day === undefined ? null : integer(body.day, 'day', 1, days);
    const squad = await this.squadVibe(trip.id);
    const place = trip.destination || trip.name;

    let draft: Draft | null = null;
    if (this.geminiKey) {
      try {
        draft = { ...await this.generate({ place, days, startDate: trip.start_date, budget: String(details.budgetLabel ?? trip.budget ?? ''), tweaks, squad, onlyDay }), source: 'gemini' };
      } catch (err: any) {
        logger.warn('Itinerary', `Gemini draft failed (${err.message}); using the template plan`);
      }
    }
    draft ??= cityOf(place) === 'Udaipur' ? udaipurDraft(onlyDay ? 1 : days, onlyDay) : templateDraft(place, onlyDay ? 1 : days);
    return withFairness(draft, squad.profile);
  }

  private async generate(args: {
    place: string; days: number; startDate: string | null; budget: string; tweaks: string[];
    squad: Awaited<ReturnType<ItineraryService['squadVibe']>>; onlyDay: number | null;
  }): Promise<Omit<Draft, 'source'>> {
    const { place, days, startDate, budget, tweaks, squad, onlyDay } = args;
    const city = cityOf(place);
    const { profile } = squad;
    // Spotlights are planned across the whole trip so a regenerated day keeps its share of the rotation
    const spotlights = profile ? allocateSpotlights(profile, days) : [];
    const prompt = [
      `Plan a ${days}-day group trip to ${place}${startDate ? ` starting ${startDate}` : ''} for ${squad.size} friend${squad.size === 1 ? '' : 's'} from India.`,
      budget && `Budget per person: ${budget}.`,
      profile && squadBrief(profile, onlyDay ? spotlights.slice(onlyDay - 1, onlyDay) : spotlights, onlyDay ?? 1),
      tweaks.length && `Requested tweaks: ${tweaks.join(', ')}.`,
      onlyDay ? `Only plan day ${onlyDay} of ${days}, with fresh ideas.` : `Plan every day from day 1 to day ${days}.`,
      'Day 1 starts with arriving and checking in; the last day ends with heading home.',
      'Each day: a short catchy title and 3 to 5 time slots in order. Each slot has 2 options: the best pick first, then a good alternative at the same time.',
      `Use real, specific places in ${place}. Times in 12-hour format like "09:30 AM". Tags: ${STOP_TAGS.join(', ')}.`,
      'notes: one practical tip (timing, cost in ₹, what to carry). Also give one overall tip for the group.',
      'Travel responsibly: popular heritage sites get overcrowded, so visit them in their quiet windows, not at peak. Every day include at least one lesser-known gem, and favour local family-run eateries and artisans over chains.',
      'Group nearby stops so the squad can walk or take a shared e-rickshaw between them.',
      city && `Crowd forecast for ${city}'s heritage sites${startDate ? ' around the trip dates' : ''}:\n${crowdBrief(city, startDate)}\nSchedule each site you use inside its quiet window, and use the site names above so the app can track crowds.`,
    ].filter(Boolean).join('\n');

    const stop = {
      type: 'OBJECT',
      properties: {
        time: { type: 'STRING' }, title: { type: 'STRING' }, tag: { type: 'STRING', enum: [...STOP_TAGS] },
        place: { type: 'STRING' }, notes: { type: 'STRING' },
        axis: { type: 'STRING', enum: [...VIBE_AXES, 'group'] }, forMembers: { type: 'ARRAY', items: { type: 'STRING' } }, split: { type: 'BOOLEAN' },
      },
      required: ['time', 'title', 'tag', 'place', 'notes'],
    };
    const schema = {
      type: 'OBJECT',
      properties: {
        days: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { title: { type: 'STRING' }, slots: { type: 'ARRAY', items: { type: 'OBJECT', properties: { options: { type: 'ARRAY', items: stop } }, required: ['options'] } } },
            required: ['title', 'slots'],
          },
        },
        tip: { type: 'STRING' },
      },
      required: ['days', 'tip'],
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 40_000);
    const started = Date.now();
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.geminiKey! },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: schema,
            temperature: onlyDay ? 1 : 0.7,
            ...(this.geminiModel.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: 'minimal' } } : {}),
          },
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const raw = data.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
      const parsed = JSON.parse(raw) as { days?: { title?: string; slots?: { options?: Partial<DraftStop>[] }[] }[]; tip?: string };
      const names = new Set(profile?.members.map(m => m.name) ?? []);
      const clean = (s: Partial<DraftStop>): DraftStop | null => {
        if (!s.title) return null;
        const time = TIME.test(String(s.time ?? '').trim()) ? normaliseTime(s.time) : '';
        const tag = STOP_TAGS.includes(s.tag as never) ? s.tag! : 'Chill';
        const axis = VIBE_AXES.includes(s.axis as never) || s.axis === 'group' ? s.axis! : VIBE_AXES.find(a => a === tag.toLowerCase()) ?? 'group';
        return {
          time, title: String(s.title).slice(0, 200), tag,
          place: String(s.place ?? '').slice(0, 200), notes: String(s.notes ?? '').slice(0, 500),
          axis, forMembers: Array.isArray(s.forMembers) ? s.forMembers.filter(n => names.has(n)) : [], split: s.split === true,
        };
      };
      const planned = (parsed.days ?? []).slice(0, onlyDay ? 1 : days).map(d => ({
        title: String(d.title ?? '').slice(0, 120),
        slots: (d.slots ?? []).map(s => (s.options ?? []).map(clean).filter((o): o is DraftStop => o !== null)).filter(o => o.length > 0).slice(0, 6)
          // A split slot needs both camps' options; with one left it's an ordinary stop
          .map(o => {
            const split = o.length > 1 && o.some(x => x.split);
            return o.map(x => ({ ...x, split }));
          }),
      }));
      if (!planned.length || planned.every(d => !d.slots.length)) throw new Error('empty plan');
      logger.info('Itinerary', `Gemini (${this.geminiModel}) drafted ${planned.length} day(s) for ${place} in ${Date.now() - started}ms`);
      return { days: planned, tip: String(parsed.tip ?? '').slice(0, 300) };
    } finally {
      clearTimeout(timer);
    }
  }
}

// Used when Gemini isn't configured or fails, so trip creation never blocks on the AI.
/** Reorders options for fairness and adds the per-member scores and squad summary; unchanged without quiz results */
export function withFairness(draft: Draft, profile: SquadProfile | null): Draft & { fairness: Fairness | null; squad: SquadSummary | null } {
  if (!profile) return { ...draft, fairness: null, squad: null };
  const { days, fairness } = rebalance(draft.days, profile);
  const byClass = (cls: string) => VIBE_AXES.filter(a => profile.axes[a].class === cls);
  return {
    ...draft, days, fairness,
    squad: { sharedLoves: byClass('love'), splits: byClass('split'), vetoes: VIBE_AXES.filter(a => profile.axes[a].min < 0.2) },
  };
}

export function templateDraft(place: string, days: number): Draft {
  const day = (i: number): DraftDay => {
    if (i === 0) {
      return {
        title: `Arrive in ${place}`,
        slots: [
          [{ time: '12:00 PM', title: 'Check in and freshen up', tag: 'Stay', place: '', notes: 'Drop the bags, grab water and SIM data if needed.' }],
          [
            { time: '01:30 PM', title: `Local lunch in ${place}`, tag: 'Food', place: '', notes: 'Ask your host for their favourite spot.' },
            { time: '01:30 PM', title: 'Street food walk', tag: 'Food', place: '', notes: 'Carry cash for small stalls.' },
          ],
          [
            { time: '05:00 PM', title: `Sunset viewpoint in ${place}`, tag: 'Chill', place: '', notes: 'Get there 20 minutes early for a good spot.' },
            { time: '05:00 PM', title: 'Old town stroll', tag: 'Culture', place: '', notes: 'Comfortable shoes.' },
          ],
          [{ time: '08:00 PM', title: 'Squad dinner', tag: 'Food', place: '', notes: 'Book ahead for groups.' }],
        ],
      };
    }
    if (i === days - 1 && days > 1) {
      return {
        title: 'Last bites, then home',
        slots: [
          [
            { time: '09:30 AM', title: 'Slow breakfast', tag: 'Food', place: '', notes: 'Check out by noon.' },
            { time: '09:30 AM', title: 'Morning market visit', tag: 'Shops', place: '', notes: 'Souvenirs for home.' },
          ],
          [{ time: '12:00 PM', title: 'Check out', tag: 'Stay', place: '', notes: 'Settle up in GhoomMates before you leave!' }],
          [{ time: '03:00 PM', title: 'Head home', tag: 'Travel', place: '', notes: 'Leave buffer for traffic.' }],
        ],
      };
    }
    return {
      title: `Explore ${place} · Day ${i + 1}`,
      slots: [
        [
          { time: '08:30 AM', title: 'Morning adventure', tag: 'Adventure', place: '', notes: 'Start early to beat the crowds.' },
          { time: '08:30 AM', title: 'Heritage walk', tag: 'Culture', place: '', notes: 'Hire a local guide.' },
        ],
        [{ time: '01:00 PM', title: 'Lunch at a local favourite', tag: 'Food', place: '', notes: 'Try the regional thali.' }],
        [
          { time: '04:00 PM', title: 'Café hopping', tag: 'Chill', place: '', notes: 'Good time to sort photos.' },
          { time: '04:00 PM', title: 'Local market', tag: 'Shops', place: '', notes: 'Bargain politely.' },
        ],
        [
          { time: '08:00 PM', title: 'Night out', tag: 'Nightlife', place: '', notes: 'Plan the ride back.' },
          { time: '08:00 PM', title: 'Bonfire and games', tag: 'Chill', place: '', notes: 'Carry a speaker.' },
        ],
      ],
    };
  };
  return { days: Array.from({ length: Math.max(1, days) }, (_, i) => day(i)), tip: 'Tell me what to change and I’ll rework the plan.', source: 'template' };
}

// Udaipur without Gemini: heritage sites in their quiet windows, a lesser-known gem every day, local kitchens and makers.
export function udaipurDraft(days: number, onlyDay: number | null = null): Draft {
  const s = (time: string, title: string, tag: string, place: string, notes: string): DraftStop => ({ time, title, tag, place, notes });
  const arrive: DraftDay = {
    title: 'Hello, City of Lakes',
    slots: [
      [s('12:00 PM', 'Check in at a lakeside haveli homestay', 'Stay', 'Lal Ghat, old city', 'Family-run havelis keep the money in the old city. Refill bottles at the host’s RO tap.')],
      [
        s('01:30 PM', 'Dal baati churma at a family kitchen', 'Food', 'Jagdish Chowk', 'Around ₹250 a head. Ask for the ghee on the side.'),
        s('01:30 PM', 'Kachori and chaat crawl', 'Food', 'Bada Bazaar', 'Carry small change for the stalls.'),
      ],
      [
        s('04:00 PM', 'Bagore ki Haveli rooms by daylight', 'Culture', 'Bagore ki Haveli, Gangaur Ghat', 'Quiet before the evening show crowd arrives.'),
        s('04:00 PM', 'Gulab Bagh garden walk', 'Chill', 'Gulab Bagh', 'Shady and almost empty on weekday afternoons.'),
      ],
      [
        s('05:30 PM', 'Sunset hike to Neemach Mata', 'Adventure', 'Neemach Mata hilltop, Fateh Sagar', 'A 20-minute climb. The sunset crowd is at Sajjangarh; you’ll have the view to yourselves.'),
        s('05:30 PM', 'Sunset at Moti Magri', 'Culture', 'Moti Magri', 'Maharana Pratap’s memorial with a lake view and few people.'),
      ],
      [s('08:00 PM', 'Rooftop thali by Lal Ghat', 'Food', 'Lal Ghat rooftops', 'Book ahead for the squad; seasonal Mewari sabzis.')],
    ],
  };
  const heritage: DraftDay = {
    title: 'Palaces before the rush',
    slots: [
      [
        s('07:00 AM', 'Jagdish Temple at morning aarti', 'Culture', 'Jagdish Temple', 'Locals only at this hour. Shoes off, shoulders covered.'),
        s('07:00 AM', 'Gangaur Ghat at sunrise', 'Chill', 'Gangaur Ghat', 'Washermen and pigeons, no tour groups yet.'),
      ],
      [s('09:30 AM', 'City Palace museum at opening', 'Culture', 'City Palace', 'Tour buses land around 11. Book online and be at the gate by 9:20 AM.')],
      [
        s('12:00 PM', 'Lake Pichola boat ride', 'Chill', 'Lake Pichola, Rameshwar Ghat jetty', 'Noon boats are half empty; the 5 PM sunset boats are packed.'),
        s('12:00 PM', 'Vintage car collection', 'Culture', 'Vintage car collection', 'The Maharanas’ Rolls-Royces, rarely busy.'),
      ],
      [s('01:30 PM', 'Mewari lunch at a local bhojanalaya', 'Food', 'Old city', 'Unlimited thali around ₹200.')],
      [
        s('06:00 PM', 'Puppet show at Bhartiya Lok Kala Mandal', 'Culture', 'Bhartiya Lok Kala Mandal', 'Kathputli by third-generation puppeteers. Tip them directly.'),
        s('06:00 PM', 'Dharohar folk dance', 'Culture', 'Bagore ki Haveli', 'Popular. Queue by 6:15 PM or you’ll be standing.'),
      ],
    ],
  };
  const gems: DraftDay = {
    title: 'Hidden Udaipur',
    slots: [
      [s('06:30 AM', 'Sunrise cycle along Fateh Sagar', 'Adventure', 'Fateh Sagar Lake', 'Rent cycles at the pal, ₹100 an hour.')],
      [
        s('09:00 AM', 'Moti Magri and the Maharana Pratap memorial', 'Culture', 'Moti Magri', 'Ask a gate guide for the Haldighati story.'),
        s('09:00 AM', 'Saheliyon ki Bari at opening', 'Culture', 'Saheliyon ki Bari', 'Gets busy from 11; go now.'),
      ],
      [s('11:30 AM', 'Ahar royal cenotaphs and museum', 'Culture', 'Ahar cenotaphs', '250 royal chhatris and a 4,000-year-old dig. Almost no one comes here.')],
      [s('01:30 PM', 'Lunch at a village dhaba', 'Food', 'Ahar', 'Makki ki roti and lassi from the farms around the city.')],
      [
        s('03:00 PM', 'Meet the makers at Shilpgram', 'Shops', 'Shilpgram crafts village', 'Buy straight from potters and weavers at their huts.'),
        s('03:00 PM', 'Miniature painters of Hathi Pol', 'Shops', 'Hathi Pol Bazaar', 'Watch a squirrel-hair brush at work; buy from the painter.'),
      ],
      [s('05:30 PM', 'Badi Lake at golden hour', 'Chill', 'Badi Lake', 'Quieter than Fateh Sagar. No snacks by the water: it’s a reservoir.')],
    ],
  };
  const leave: DraftDay = {
    title: 'Last chai, then home',
    slots: [
      [
        s('08:00 AM', 'Chai and poha by Gangaur Ghat', 'Food', 'Gangaur Ghat', 'Quiet mornings on the ghat.'),
        s('08:00 AM', 'Morning walk in Gulab Bagh', 'Chill', 'Gulab Bagh', 'Join the locals on their rounds.'),
      ],
      [s('10:30 AM', 'Pick up a miniature painting in Hathi Pol', 'Shops', 'Hathi Pol Bazaar', 'Before the evening crowd. Ask who painted it.')],
      [s('12:00 PM', 'Check out', 'Stay', '', 'Settle up in GhoomMates before you leave!')],
      [s('03:00 PM', 'Head home', 'Travel', '', 'Share one cab to the airport or station.')],
    ],
  };
  const middle = [heritage, gems];
  const plan = (i: number, total: number) => (i === 0 ? arrive : i === total - 1 && total > 1 ? leave : middle[(i - 1) % middle.length]);
  const planned = onlyDay ? [middle[(onlyDay - 1) % middle.length]] : Array.from({ length: Math.max(1, days) }, (_, i) => plan(i, days));
  return {
    days: planned,
    tip: 'Every heritage stop sits in its quiet window. Watch the crowd meter on each stop as the day goes.',
    source: 'template',
  };
}
