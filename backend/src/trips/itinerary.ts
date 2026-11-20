import { randomUUID } from 'node:crypto';
import { ApiError, integer, object, requireThat, text } from '../expenses/domain.ts';
import { transaction, type ClientSession, type Database, type Db } from '../db.ts';
import { logger } from '../logger.ts';
import { spendGemini } from '../gemini.ts';
import { cityOf, crowdBrief, crowdForStop } from '../heritage/crowd.ts';
import type { Dealbreaker, Diet } from '../prefs/taste.ts';
import { tripCity } from '../prefs/registry.ts';
import { guideBrief, guideFor, monthOf, rankItems, stopTag, type CityGuide, type ItemKind, type Month, type PlaceItem } from '../places/index.ts';
import type { Vibe } from '../voice/experiences.ts';
import type { TripAccess } from './service.ts';
import {
  blamesSomeone, cardWhy, clockTime, consensus, constraintsBrief, dealbreakerUnion, groupStart, groupStyle, loadSquad, profileOf, safeWhy,
  shortlistBrief, shortlistOf, slotsPerDay, stopWhy, strictestDiet, type CardTally, type Shortlist,
} from './squad.ts';
import { allocateSpotlights, rebalance, squadBrief, VIBE_AXES, type Axis, type Fairness, type SquadProfile } from './vibe.ts';

export const STOP_TAGS = ['Adventure', 'Food', 'Chill', 'Culture', 'Nightlife', 'Shops', 'Stay', 'Travel'] as const;
const RSVPS = ['going', 'maybe', 'skip'] as const;
// A meal or a check-in near a ghat isn't a visit to it, so these stops get no crowd meter
const CROWDLESS_TAGS = new Set(['Food', 'Stay', 'Travel']);
const MAX_DAYS = 14;
const TIME = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

// forMembers: who the stop was planned for (empty for whole-group stops). axis: the vibe it serves, or 'group'.
// split: a split slot, where the options run in parallel for different members instead of pick-then-alternative.
// why: one line on why it's in the plan (never says who said no). cardId: the Vibe Swipe trip card it came from.
export type DraftStop = {
  time: string; title: string; tag: string; place: string; notes: string;
  forMembers?: string[]; axis?: string; split?: boolean; why?: string | null; cardId?: string | null;
};
// Each slot holds the suggested stop first, then alternatives the app can swap to.
export type DraftDay = { title: string; slots: DraftStop[][] };
// shortlist: built without Gemini from the squad's swiped trip cards (Udaipur and Goa)
export type Draft = { days: DraftDay[]; tip: string; source: 'gemini' | 'shortlist' | 'template' };
export type SquadSummary = { sharedLoves: string[]; splits: string[]; vetoes: string[] };
/** Whose swipes a draft is built on: members with quiz data out of everyone, and the first names still to swipe */
export type DraftBasis = { answered: number; total: number; pending: string[] };

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
  return { ...baseInput(s), ...whyInput(s) };
}

function baseInput(s: Record<string, unknown>) {
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

const NO_WHY = { axis: null, for_members: [] as string[], split: false, why: null, card_id: null };
type WhyFields = { axis: string | null; for_members: string[]; split: boolean; why: string | null; card_id: string | null };

/**
 * The "why is this here" fields a stop carries, as stored on trip_stops. Missing fields get their defaults, or with
 * `partial` are left out so an edit that doesn't send them keeps what's saved.
 */
function whyInput(s: Record<string, unknown>, partial = false): Partial<WhyFields> {
  const out: Partial<WhyFields> = partial ? {} : { ...NO_WHY, for_members: [] };
  const given = (key: string) => s[key] !== undefined;
  const optText = (value: unknown, field: string, max: number) => {
    if (value === null || value === '') return null;
    requireThat(typeof value === 'string' && value.trim().length <= max, `${field} must be at most ${max} characters`);
    return (value as string).trim() || null;
  };
  if (given('axis')) {
    requireThat(s.axis === null || s.axis === '' || VIBE_AXES.includes(s.axis as Axis) || s.axis === 'group', `axis must be one of ${VIBE_AXES.join(', ')} or group`);
    out.axis = s.axis === '' ? null : s.axis as string | null;
  }
  if (given('forMembers')) {
    const list = s.forMembers === null ? [] : s.forMembers;
    requireThat(Array.isArray(list) && list.length <= 10 && list.every(n => typeof n === 'string' && n.trim().length > 0 && n.trim().length <= 40), 'forMembers must be up to 10 names of at most 40 characters');
    out.for_members = (list as string[]).map(n => n.trim());
  }
  if (given('split')) {
    requireThat(s.split === null || typeof s.split === 'boolean', 'split must be true or false');
    out.split = s.split === true;
  }
  if (given('why')) out.why = optText(s.why, 'why', 120);
  if (given('cardId')) out.card_id = optText(s.cardId, 'cardId', 80);
  return out;
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
    const [docs, members, row, squad] = await Promise.all([
      this.db.collection('trip_stops').find({ trip_id: trip.id }).sort({ day_number: 1, minutes: 1, created_at: 1 }).toArray(),
      this.db.collection('trip_members').find({ trip_id: trip.id }).sort({ joined_at: 1 }).toArray(),
      this.db.collection('trips').findOne({ _id: trip.id as any }, { projection: { day_titles: 1, itinerary_generated_at: 1 } }),
      loadSquad(this.db, trip.id, { answers: false }),
    ]);
    // Stale: someone swiped after the plan was last shared, or the plan predates the squad's swipes altogether
    const generatedAt = row?.itinerary_generated_at instanceof Date ? row.itinerary_generated_at.getTime() : null;
    const stale = docs.length > 0 && (generatedAt === null
      ? squad.members.some(m => m.swiped)
      : squad.members.some(m => m.tasteUpdatedAt !== null && Date.parse(m.tasteUpdatedAt) > generatedAt));
    const pending = squad.members.filter(m => !m.vibe).map(m => m.name);
    const rsvpDocs = await this.db.collection('trip_stop_rsvps').find({ stop_id: { $in: docs.map(s => s._id) } }).toArray();
    // RSVPs from people who left the trip don't count
    const memberOf = new Map(members.map(m => [m.user_id as string, m.ledger_member_id as string]));
    const stops = docs.map(s => ({
      id: s._id as unknown as string, day_number: s.day_number as number, time: s.time as string, title: s.title as string,
      tag: s.tag as string, place: s.place as string, notes: s.notes as string,
      axis: (s.axis ?? null) as string | null, forMembers: Array.isArray(s.for_members) ? s.for_members as string[] : [],
      split: s.split === true, why: (s.why ?? null) as string | null, cardId: (s.card_id ?? null) as string | null,
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
              axis: s.axis, forMembers: s.forMembers, split: s.split, why: s.why, cardId: s.cardId,
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
      stale,
      pending,
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
      const now = new Date();
      // itinerary_generated_at: when the squad's plan was last shared, for the "swipes changed, regenerate?" nudge
      await this.db.collection('trips').updateOne({ _id: access.trip.id as any }, { $set: { day_titles: days.map(d => d.title), itinerary_generated_at: now } }, { session });
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
    // The why-fields are only changed when sent, so an ordinary edit keeps them
    const stop = baseInput(body);
    const why = whyInput(body, true);
    const day = body.dayNumber === undefined ? null : integer(body.dayNumber, 'dayNumber', 1, 60);
    await this.db.collection('trip_stops').updateOne({ _id: stopId as any }, { $set: { ...stop, ...why, ...(day === null ? {} : { day_number: day }) } });
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

  async draft(access: TripAccess, input: unknown) {
    const body = input && typeof input === 'object' ? input as Record<string, unknown> : {};
    const trip = access.trip;
    const days = tripLength(trip);
    const details = trip.details as { tweaks?: unknown; budgetLabel?: unknown };
    const tweaks = (Array.isArray(body.tweaks) ? body.tweaks : Array.isArray(details.tweaks) ? details.tweaks : [])
      .filter((t): t is string => typeof t === 'string').slice(0, 10);
    const onlyDay = body.day === undefined ? null : integer(body.day, 'day', 1, days);
    const deck = tripCity(trip);
    const squad = await planningSquad(this.db, trip.id, deck);
    const place = trip.destination || trip.name;

    // Gemini first (one call), then the squad's swiped cards for Udaipur and Goa, then the fixed templates
    let draft: Draft | null = null;
    if (this.geminiKey) {
      try {
        draft = { ...await this.generate({ place, days, startDate: trip.start_date, budget: String(details.budgetLabel ?? trip.budget ?? ''), tweaks, squad, onlyDay }), source: 'gemini' };
      } catch (err: any) {
        logger.warn('Itinerary', `Gemini draft failed (${err.message}); using the fallback plan`);
      }
    }
    if (!draft && deck) {
      draft = shortlistDraft({ city: deck, days, onlyDay, shortlist: squad.shortlist, start: squad.start, slots: squad.slots, dealbreakers: squad.dealbreakers, diet: squad.diet });
    }
    const guide = guideFor(place);
    draft ??= cityOf(place) === 'Udaipur'
      ? udaipurDraft(onlyDay ? 1 : days, onlyDay)
      : guide
        ? guideDraft(guide, days, { onlyDay, vibe: squad.profile?.blended ?? null, month: monthOf(trip.start_date) })
        : templateDraft(place, onlyDay ? 1 : days);
    const explained = explainDraft(draft, squad.shortlist, squad.names, squad.profile !== null);
    // Gemini's tip is free text too: never let it say who isn't into something
    const tip = blamesSomeone(explained.tip, squad.names) ? 'Tell me what to change and I’ll rework the plan.' : explained.tip;
    return { ...withFairness({ ...explained, tip }, squad.profile), basis: squad.basis };
  }

  private async generate(args: {
    place: string; days: number; startDate: string | null; budget: string; tweaks: string[]; squad: PlanningSquad; onlyDay: number | null;
  }): Promise<Omit<Draft, 'source'>> {
    const { place, days, startDate, budget, tweaks, squad, onlyDay } = args;
    const city = cityOf(place);
    const guide = guideFor(place);
    const { profile, shortlist } = squad;
    // Spotlights are planned across the whole trip so a regenerated day keeps its share of the rotation
    const spotlights = profile ? allocateSpotlights(profile, days, squad.slots) : [];
    const slotCount = squad.style.pace.voters ? `${squad.slots}` : '3 to 5';
    const prompt = [
      `Plan a ${days}-day group trip to ${place}${startDate ? ` starting ${startDate}` : ''} for ${squad.size} friend${squad.size === 1 ? '' : 's'} from India.`,
      budget && `Budget per person: ${budget}.`,
      profile && squadBrief(profile, onlyDay ? spotlights.slice(onlyDay - 1, onlyDay) : spotlights, onlyDay ?? 1),
      constraintsBrief(squad.style, squad.diet, squad.dealbreakers),
      shortlistBrief(shortlist, squad.members),
      tweaks.length && `Requested tweaks: ${tweaks.join(', ')}.`,
      onlyDay ? `Only plan day ${onlyDay} of ${days}, with fresh ideas.` : `Plan every day from day 1 to day ${days}.`,
      'Day 1 starts with arriving and checking in; the last day ends with heading home.',
      `Each day: a short catchy title and ${slotCount} time slots in order. Each slot has 2 options: the best pick first, then a good alternative at the same time.`,
      `Use real, specific places in ${place}. Times in 12-hour format like "09:30 AM". Tags: ${STOP_TAGS.join(', ')}.`,
      'notes: one practical tip (timing, cost in ₹, what to carry). Also give one overall tip for the group.',
      'why: one short line (at most 100 characters) on why the option suits the squad, such as who it is for or that everyone liked it. Never mention who dislikes or said no to anything, in why or in notes.',
      'Travel responsibly: popular heritage sites get overcrowded, so visit them in their quiet windows, not at peak. Every day include at least one lesser-known gem, and favour local family-run eateries and artisans over chains.',
      'Group nearby stops so the squad can walk or take a shared e-rickshaw between them.',
      guide && `What we know about ${guide.name} (researched; prefer these real places, use their names as written, and you may add others you are sure of):\n${guideBrief(guide, { vibe: profile?.blended ?? null, month: monthOf(startDate) })}`,
      city && `Crowd forecast for ${city}'s heritage sites${startDate ? ' around the trip dates' : ''}:\n${crowdBrief(city, startDate)}\nSchedule each site you use inside its quiet window, and use the site names above so the app can track crowds.`,
    ].filter(Boolean).join('\n');

    const stop = {
      type: 'OBJECT',
      properties: {
        time: { type: 'STRING' }, title: { type: 'STRING' }, tag: { type: 'STRING', enum: [...STOP_TAGS] },
        place: { type: 'STRING' }, notes: { type: 'STRING' },
        axis: { type: 'STRING', enum: [...VIBE_AXES, 'group'] }, forMembers: { type: 'ARRAY', items: { type: 'STRING' } }, split: { type: 'BOOLEAN' },
        why: { type: 'STRING' }, card: { type: 'STRING' },
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

    await spendGemini('Itinerary');
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
      type GeminiStop = Partial<DraftStop> & { card?: unknown };
      const parsed = JSON.parse(raw) as { days?: { title?: string; slots?: { options?: GeminiStop[] }[] }[]; tip?: string };
      const names = new Set(squad.names);
      const clean = (s: GeminiStop): DraftStop | null => {
        if (!s.title) return null;
        const time = TIME.test(String(s.time ?? '').trim()) ? normaliseTime(s.time) : '';
        const tag = STOP_TAGS.includes(s.tag as never) ? s.tag! : 'Chill';
        const axis = VIBE_AXES.includes(s.axis as never) || s.axis === 'group' ? s.axis! : VIBE_AXES.find(a => a === tag.toLowerCase()) ?? 'group';
        // Gemini may quote a shortlist id with its brackets; anything not on the shortlist is dropped
        const card = typeof s.card === 'string' ? s.card.trim().replace(/^\[|\]$/g, '') : '';
        return {
          time, title: String(s.title).slice(0, 200), tag,
          place: String(s.place ?? '').slice(0, 200), notes: String(s.notes ?? '').slice(0, 500),
          axis, forMembers: Array.isArray(s.forMembers) ? s.forMembers.filter(n => names.has(n)) : [], split: s.split === true,
          why: typeof s.why === 'string' ? s.why : null, cardId: shortlist.byId.has(card) ? card : null,
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

/* The squad, as the planner sees it */

export type PlanningSquad = Awaited<ReturnType<typeof planningSquad>>;

/**
 * Everything a draft needs from the squad's Vibe Swipe data, read once: the vibe profile (members with data, each
 * weighted by how sure we are of them), the group rules, the strictest diet, the anonymous deal-breakers and the
 * shortlist of swiped trip cards. Members without data are left out of the maths and listed in basis.pending.
 */
export async function planningSquad(db: Db, tripId: string, city: string | null) {
  const { members, answers } = await loadSquad(db, tripId, { city });
  const withData = members.filter(m => m.vibe);
  const style = groupStyle(withData);
  // Safety constraints count for everyone, quiz or not
  const dealbreakers = dealbreakerUnion(members);
  const basis: DraftBasis = { answered: withData.length, total: members.length, pending: members.filter(m => !m.vibe).map(m => m.name) };
  return {
    size: members.length,
    names: members.map(m => m.name),
    members,
    profile: profileOf(members),
    style,
    diet: strictestDiet(members),
    dealbreakers,
    start: groupStart(style, dealbreakers),
    slots: slotsPerDay(style.pace.value),
    shortlist: shortlistOf(consensus(answers, members)),
    basis,
  };
}

/**
 * Settles each draft stop's axis, forMembers, split, cardId and why. A stop from a shortlisted card gets its why
 * from the swipes (only likers and lovers are named); any other stop keeps Gemini's why unless it names someone next
 * to a no, else one derived from who it's for ("Picked for Riya · food") when the squad has quiz data.
 */
export function explainDraft(draft: Draft, shortlist: Shortlist, names: string[], derive: boolean): Draft {
  const known = new Set(names);
  const explain = (stop: DraftStop): DraftStop => {
    const card = stop.cardId ? shortlist.byId.get(stop.cardId) : undefined;
    const axis = VIBE_AXES.includes(stop.axis as Axis) || stop.axis === 'group' ? stop.axis! : VIBE_AXES.find(a => a === stop.tag.toLowerCase()) ?? 'group';
    const forMembers = (stop.forMembers ?? []).filter(n => known.has(n)).slice(0, 10);
    const why = card ? cardWhy(card) : safeWhy(stop.why, names) ?? (derive ? stopWhy({ forMembers, axis, tag: stop.tag }) : null);
    // Notes and titles are Gemini's free text as well: drop any that name someone next to a no
    const notes = blamesSomeone(stop.notes, names) ? '' : stop.notes;
    const title = blamesSomeone(stop.title, names) ? card?.title ?? (stop.place || stop.tag) : stop.title;
    return { ...stop, title, notes, axis, forMembers, split: stop.split === true, why: why ? why.slice(0, 120) : null, cardId: card?.cardId ?? null };
  };
  return { ...draft, days: draft.days.map(d => ({ ...d, slots: d.slots.map(slot => slot.map(explain)) })) };
}

/* A plan from the squad's swiped cards, without Gemini (Udaipur and Goa) */

export type ShortlistPlan = {
  city: 'Udaipur' | 'Goa';
  days: number;
  onlyDay?: number | null;
  shortlist: Shortlist;
  /** Group start, minutes after midnight */
  start: number;
  slots: number;
  dealbreakers: Dealbreaker[];
  diet: Diet | null;
};

const AXIS_TAG: Record<Axis, string> = { adventure: 'Adventure', food: 'Food', nightlife: 'Nightlife', culture: 'Culture', chill: 'Chill', shops: 'Shops' };
const WATER = /\b(swim\w*|snorkel\w*|kayak\w*|canoe\w*|paddl\w*|scuba|div(?:e|ing)|raft\w*|surf\w*|parasail\w*|jet ?ski\w*)\b/i;
const HEIGHTS = /\b(paraglid\w*|zip-?lin\w*|steep|rock climb\w*|rappel\w*|bungee)\b/i;
const LONG_DRIVE = /\bday trip\b|\b\d{2,}\s*km\b/i;
// Picks don't butt up against each other: 30 minutes to get between them
const BUFFER = 30;

/** "2.5 hrs" or "90 min" in minutes; 2 hours when unknown */
export function durationOf(text: string | undefined) {
  const hours = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i.exec(text ?? '');
  if (hours) return Math.round(Number(hours[1]) * 60);
  const minutes = /(\d+)\s*(?:m|min|mins|minutes)\b/i.exec(text ?? '');
  return minutes ? Number(minutes[1]) : 120;
}

const topAxis = (axes: Partial<Record<Axis, number>>) => {
  let best: Axis | null = null;
  for (const axis of VIBE_AXES) if ((axes[axis] ?? 0) > 0 && (best === null || (axes[axis] ?? 0) > (axes[best] ?? 0))) best = axis;
  return best;
};

type CityKit = {
  arrive: string; middle: string; leave: string; oneDay: string;
  stay: { title: string; place: string; notes: string };
  lunch: (diet: Diet | null) => { title: string; place: string; notes: string };
  dinner: (diet: Diet | null) => { title: string; place: string; notes: string };
  wander: { title: string; tag: string; place: string; notes: string };
};

const CITY_KIT: Record<ShortlistPlan['city'], CityKit> = {
  Udaipur: {
    arrive: 'Hello, City of Lakes', middle: 'The squad’s Udaipur', leave: 'Last chai, then home', oneDay: 'Udaipur in a day',
    stay: { title: 'Check in at a family-run haveli homestay', place: 'Lal Ghat, old city', notes: 'Family-run havelis keep the money in the old city. Refill bottles at the host’s RO tap.' },
    lunch: () => ({ title: 'Mewari thali at a family-run bhojanalaya', place: 'Old city, Udaipur', notes: 'Unlimited thali, around ₹200 a head.' }),
    dinner: () => ({ title: 'Rooftop dinner at a family-run place by Lal Ghat', place: 'Lal Ghat, Udaipur', notes: 'Book ahead for the squad; ask for the seasonal Mewari sabzis.' }),
    wander: { title: 'Old city lanes and the lake ghats', tag: 'Culture', place: 'Gangaur Ghat, Udaipur', notes: 'Free, and best before the midday heat.' },
  },
  Goa: {
    arrive: 'Susegad starts here', middle: 'The squad’s Goa', leave: 'Last sunset, then home', oneDay: 'Goa in a day',
    stay: { title: 'Check in at a family-run guesthouse', place: 'North Goa', notes: 'Family-run guesthouses keep the money in the village. Refill bottles instead of buying plastic.' },
    lunch: diet => (diet && diet !== 'non-veg'
      ? { title: 'Veg Goan thali at a family-run kitchen', place: 'Panaji', notes: 'Around ₹250 a head: khatkhate, tondak and sol kadhi.' }
      : { title: 'Fish curry rice at a family-run kitchen', place: 'Panaji', notes: 'Around ₹300 a head; the catch of the day is the cheapest thing on the menu.' }),
    dinner: diet => ({
      title: 'Dinner at a family-run beach shack',
      place: 'North Goa',
      notes: diet && diet !== 'non-veg' ? 'Ask for the veg xacuti and mushroom cafreal.' : 'Order the catch of the day, cooked recheado or cafreal.',
    }),
    wander: { title: 'Fontainhas lanes and the Mandovi promenade', tag: 'Culture', place: 'Fontainhas, Panaji', notes: 'Free; go early before the heat.' },
  },
};

const DIET_NOTE: Record<Diet, string> = {
  'non-veg': '',
  eggetarian: 'Order vegetarian and egg dishes for the table.',
  veg: 'Order vegetarian for the table.',
  vegan: 'Order vegan for the table: no dairy or ghee.',
  jain: 'Order Jain food for the table: no onion, garlic or root vegetables.',
};

type Pick = { card: CardTally; from: number; to: number };

/**
 * A plan built from the squad's shortlisted trip cards when Gemini is off or fails: must-dos first, then whole-group
 * favourites, each at its own start time, spread across the days with a second option where another pick starts
 * close by. Honours the group start time, slots per day and the deal-breakers. null when fewer than three shortlisted
 * cards have a start time, so the caller falls back to the fixed templates.
 */
export function shortlistDraft(plan: ShortlistPlan): Draft | null {
  const { city, shortlist, dealbreakers, diet } = plan;
  const kit = CITY_KIT[city];
  const total = Math.max(1, plan.days);
  const slots = Math.min(5, Math.max(3, plan.slots));
  const seen = new Set<string>();
  const timed = [...shortlist.mustDos, ...shortlist.consensus].filter(card => {
    if (seen.has(card.cardId)) return false;
    seen.add(card.cardId);
    return TIME.test(card.place?.startTime?.trim() ?? '');
  });
  if (timed.length < 3) return null;

  const lateCap = dealbreakers.includes('late-nights') ? 22 * 60 : Infinity;
  const candidates: Pick[] = timed.flatMap(card => {
    const from = minutesOf(card.place!.startTime!);
    const length = durationOf(card.place?.duration);
    const to = from + length;
    const words = [card.title, card.tags.join(' '), card.place?.pitch ?? ''].join(' ');
    if (from < plan.start || to > lateCap) return [];
    if (dealbreakers.includes('water') && WATER.test(words)) return [];
    if (dealbreakers.includes('heights') && HEIGHTS.test(words)) return [];
    if (dealbreakers.includes('long-drives') && (length > 6 * 60 || LONG_DRIVE.test(`${words} ${card.place?.area ?? ''}`))) return [];
    return [{ card, from, to }];
  });

  // Where picks can go each day: arrival afternoons, full middle days, a morning before checking out
  const windowOf = (day: number) => {
    if (total === 1) return { from: plan.start + 30, until: Math.min(lateCap, 21 * 60), cap: Math.max(1, slots - 2) };
    if (day === 0) return { from: Math.max(plan.start, 15 * 60), until: lateCap, cap: Math.max(1, slots - 2) };
    if (day === total - 1) return { from: plan.start, until: 12 * 60, cap: Math.max(0, slots - 3) };
    return { from: plan.start, until: lateCap, cap: Math.max(1, slots - 1) };
  };
  const fits = (day: number, p: Pick) => p.from >= windowOf(day).from && p.to <= windowOf(day).until;
  const clashes = (list: Pick[], p: Pick) => list.some(o => p.from < o.to + BUFFER && o.from < p.to + BUFFER);

  const picks: Pick[][] = Array.from({ length: total }, () => []);
  const leftovers: Pick[] = [];
  for (const p of candidates) {
    const order = picks.map((list, day) => ({ day, n: list.length })).sort((a, b) => a.n - b.n || a.day - b.day);
    const spot = order.find(({ day }) => fits(day, p) && picks[day].length < windowOf(day).cap && !clashes(picks[day], p));
    if (spot) picks[spot.day].push(p);
    else leftovers.push(p);
  }
  if (picks.every(list => !list.length)) return null;

  // A second option for a slot: a leftover that starts within 90 minutes of the pick
  const options = picks.map(list => list.sort((a, b) => a.from - b.from).map(p => [p]));
  for (const p of leftovers) {
    let best: { slot: Pick[]; gap: number } | null = null;
    for (let day = 0; day < total; day++) {
      if (!fits(day, p)) continue;
      for (const slot of options[day]) {
        const gap = Math.abs(slot[0].from - p.from);
        if (slot.length < 2 && gap <= 90 && (!best || gap < best.gap)) best = { slot, gap };
      }
    }
    best?.slot.push(p);
  }

  const cardStop = (p: Pick): DraftStop => {
    const place = p.card.place ?? {};
    const axis = topAxis(p.card.axes);
    const notes = [place.pitch, place.priceRupees ? `About ₹${place.priceRupees} a head` : '', place.duration ? `Takes ${place.duration}` : '']
      .filter(Boolean).join('. ');
    return {
      time: normaliseTime(place.startTime), title: p.card.title.slice(0, 200), tag: axis ? AXIS_TAG[axis] : 'Culture',
      place: (place.area ?? '').slice(0, 200), notes: notes.slice(0, 500),
      axis: axis ?? 'group', forMembers: p.card.lovers.slice(0, 10), split: false, cardId: p.card.cardId,
    };
  };
  const mealNote = (base: string) => [base, diet ? DIET_NOTE[diet] : '', dealbreakers.includes('spicy') ? 'Ask for mild versions too.' : ''].filter(Boolean).join(' ');
  const LOCAL = 'Family-run, so the money stays local';

  const planDay = (day: number): DraftDay => {
    const list = picks[day];
    const out: { at: number; options: DraftStop[] }[] = options[day].map(slot => ({ at: slot[0].from, options: slot.map(cardStop) }));
    const add = (at: number, stop: Omit<DraftStop, 'time'>) => out.push({ at, options: [{ time: clockTime(at), ...stop }] });
    const busy = (from: number, to: number) => list.some(p => p.from < to && from < p.to);
    // Lunch goes in the first free hour around 1 PM; a pick that runs through all of them (a cooking class) is lunch
    const lunch = (at: number) => {
      const free = [at, at + 30, at - 60, at + 60, at + 90].find(t => !busy(t, t + 60));
      if (free === undefined) return;
      const meal = kit.lunch(diet);
      add(free, { title: meal.title, tag: 'Food', place: meal.place, notes: mealNote(meal.notes), why: LOCAL });
    };
    const dinner = () => {
      if (out.length >= slots || busy(19 * 60 + 30, 21 * 60) || 20 * 60 >= lateCap) return;
      const meal = kit.dinner(diet);
      add(20 * 60, { title: meal.title, tag: 'Food', place: meal.place, notes: mealNote(meal.notes), why: LOCAL });
    };
    let title = kit.middle;
    if (total === 1) {
      title = kit.oneDay;
      add(plan.start, { title: `Arrive in ${city} and drop your bags`, tag: 'Travel', place: '', notes: 'Leave the bags with a café or your host for the day.' });
      lunch(13 * 60);
      const lastEnd = Math.max(0, ...list.map(p => p.to));
      add(Math.min(23 * 60, Math.max(18 * 60, lastEnd + BUFFER)), { title: 'Head home', tag: 'Travel', place: '', notes: 'Share one cab to the airport or station.' });
    } else if (day === 0) {
      title = kit.arrive;
      add(12 * 60, { title: kit.stay.title, tag: 'Stay', place: kit.stay.place, notes: kit.stay.notes });
      lunch(13 * 60 + 30);
      dinner();
    } else if (day === total - 1) {
      title = kit.leave;
      add(12 * 60, { title: 'Check out', tag: 'Stay', place: '', notes: 'Settle up in GhoomMates before you leave!' });
      lunch(13 * 60);
      add(15 * 60, { title: 'Head home', tag: 'Travel', place: '', notes: 'Share one cab to the airport or station.' });
    } else {
      title = `${kit.middle} · Day ${day + 1}`;
      if (!list.length) add(plan.start, { title: kit.wander.title, tag: kit.wander.tag, place: kit.wander.place, notes: kit.wander.notes });
      lunch(13 * 60);
      dinner();
    }
    return { title, slots: out.sort((a, b) => a.at - b.at).map(s => s.options) };
  };

  const full = Array.from({ length: total }, (_, day) => planDay(day));
  return {
    days: plan.onlyDay ? [full[Math.min(total, plan.onlyDay) - 1]] : full,
    tip: 'Built from the squad’s swipes: everyone’s must-dos and whole-group favourites at their usual start times. Book the guided ones a day ahead.',
    source: 'shortlist',
  };
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

/**
 * A plan from a destination guide, without Gemini: every stop a real, researched place, ranked for the squad's blended
 * vibe and in season for the trip month. Each day has a morning sight, a local lunch, an afternoon experience, a sunset
 * spot and an evening out, at least one lesser-known gem, and no place twice. Trips of 4+ days get a day trip.
 */
export function guideDraft(guide: CityGuide, days: number, opts: { onlyDay?: number | null; vibe?: Vibe | null; month?: Month | null } = {}): Draft {
  const ranked = rankItems(guide, { vibe: opts.vibe, month: opts.month }).map(r => r.item);
  const used = new Set<string>();
  const stop = (time: string, item: PlaceItem): DraftStop => ({
    time, title: item.name, tag: stopTag(item), place: item.area,
    notes: `${item.tip}${item.costRupees ? ` Around ₹${item.costRupees.toLocaleString('en-IN')} a head.` : ''}`.slice(0, 500),
  });
  /** The best two unused items of these kinds, preferring the given times of day; marks them used */
  const slot = (time: string, kinds: ItemKind[], prefer: PlaceItem['bestTime'][] = [], wantGem = false): DraftStop[] => {
    const pool = ranked.filter(i => kinds.includes(i.kind) && !used.has(i.id));
    const score = (i: PlaceItem) => (prefer.includes(i.bestTime) ? 2 : 0) + (wantGem && i.gem ? 1 : 0);
    const picks = [...pool].sort((a, b) => score(b) - score(a)).slice(0, 2);
    for (const p of picks) used.add(p.id);
    return picks.map(p => stop(time, p));
  };
  const fill = (slots: DraftStop[][]) => slots.filter(s => s.length > 0);
  const stay = (time: string, title: string, notes: string): DraftStop[] => [{ time, title, tag: 'Stay', place: '', notes }];

  const arrive = (): DraftDay => ({
    title: `Hello, ${guide.name}`,
    slots: fill([
      stay('12:00 PM', 'Check in', guide.whereToStay.slice(0, 500)),
      slot('01:30 PM', ['food']),
      slot('04:00 PM', ['neighbourhood', 'sight', 'shopping'], ['afternoon', 'any']),
      slot('05:30 PM', ['nature', 'sight', 'spiritual'], ['sunset'], true),
      slot('08:00 PM', ['food', 'nightlife'], ['evening', 'night']),
    ]),
  });
  const full = (n: number): DraftDay => {
    const day: DraftDay = {
      title: `${guide.name}, day ${n}`,
      slots: fill([
        slot('07:00 AM', ['sight', 'spiritual', 'nature', 'adventure', 'wellness'], ['sunrise', 'morning']),
        slot('01:00 PM', ['food'], ['midday', 'any']),
        slot('03:00 PM', ['experience', 'workshop', 'shopping', 'sight', 'neighbourhood'], ['afternoon', 'any'], true),
        slot('05:30 PM', ['nature', 'sight', 'spiritual', 'adventure'], ['sunset']),
        slot('08:00 PM', ['food', 'nightlife', 'experience'], ['evening', 'night']),
      ]),
    };
    // Every day gets a lesser-known gem: swap one in as the afternoon alternative if none made it
    if (!day.slots.flat().some(s => guide.items.find(i => i.name === s.title)?.gem)) {
      const gem = ranked.find(i => i.gem && !used.has(i.id) && i.kind !== 'day-trip');
      if (gem && day.slots[2]) { used.add(gem.id); day.slots[2] = [day.slots[2][0], stop(day.slots[2][0].time, gem)]; }
    }
    return day;
  };
  const trip = (): DraftDay | null => {
    const out = slot('07:30 AM', ['day-trip'], ['any', 'morning', 'sunrise']);
    if (!out.length) return null;
    return { title: `Day trip: ${out[0].title}`, slots: fill([out, slot('08:00 PM', ['food', 'nightlife'], ['evening', 'night'])]) };
  };
  const leave = (): DraftDay => ({
    title: 'Last chai, then home',
    slots: fill([
      slot('08:30 AM', ['food', 'nature', 'wellness', 'neighbourhood'], ['sunrise', 'morning']),
      slot('10:30 AM', ['shopping', 'workshop'], ['morning', 'any']),
      stay('12:00 PM', 'Check out', 'Settle up in GhoomMates before you leave!'),
      [{ time: '03:00 PM', title: 'Head home', tag: 'Travel', place: '', notes: guide.gettingThere.slice(0, 500) }],
    ]),
  });

  const total = Math.max(1, days);
  const planDay = (i: number): DraftDay => {
    if (opts.onlyDay) return full(opts.onlyDay);
    if (i === 0) return arrive();
    if (i === total - 1 && total > 1) return leave();
    // The second full day of a 4+ day trip goes out of town
    return (total >= 4 && i === 2 && trip()) || full(i + 1);
  };
  return {
    days: opts.onlyDay ? [planDay(0)] : Array.from({ length: total }, (_, i) => planDay(i)),
    tip: `Built from our ${guide.name} guide: real places in season, a lesser-known gem every day. ${guide.practical[0] ?? ''}`.trim().slice(0, 300),
    source: 'template',
  };
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
