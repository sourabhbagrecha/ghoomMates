// Vibe Swipe for a squad: what everyone's swipes add up to. Pure functions over the members' tastes and their
// answers to the trip's cards, plus loadSquad, the one database read the squad route and the itinerary share.
//
// Privacy rule: likes and loves may carry a first name; a nope or a deal-breaker never does. Card tallies keep
// nopes as a count only, and deal-breakers come out as an anonymous union, so no output can say who said no.
import type { ClientSession, Db } from '../db.ts';
import type { CardKind, PrefAnswerDoc, SquadInsights, SquadMember, StyleRule } from '../prefs/contract.ts';
import {
  AXES, DEALBREAKERS, DIETS, STYLE_KEYS, confidenceOf, overallConfidence, round2, styleConfidence, styleValue, tasteFromVibe, vibeOf,
  type Axis, type CardPlace, type Dealbreaker, type Diet, type StyleKey, type Taste, type Vibe,
} from '../prefs/taste.ts';
import type { TripAccess } from './service.ts';
import { squadProfile, type SquadProfile } from './vibe.ts';

/** A trip member as the group maths sees them */
export type Mate = {
  userId: string;
  /** First name, made unique within the squad */
  name: string;
  colour: string | null;
  picture: string | null;
  persona: string | null;
  /** null: no quiz data yet. They are left out of the maths and listed as pending. */
  taste: Taste | null;
  /** The vibe the maths uses: the swiped taste's posterior means, or a legacy quiz's six numbers as stored */
  vibe: Vibe | null;
  /** Per-axis confidence, 0–1 (a legacy quiz counts as about four cards' worth: 0.5) */
  confidence: Vibe | null;
  /** The taste came from swiping (users.preferences.taste), not from a legacy six-number vibe */
  swiped: boolean;
  /** users.preferences.taste.updatedAt, for the itinerary's regenerate nudge */
  tasteUpdatedAt: string | null;
  /** Hard noes: the taste's, plus 'early-starts' when they told GhoomMate they're not a morning person */
  dealbreakers: Dealbreaker[];
  diet: Diet | null;
};

export type SquadData = { members: Mate[]; answers: PrefAnswerDoc[] };

const isAxis = (value: unknown): value is Axis => AXES.includes(value as Axis);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/* Reading profiles */

/** users.preferences.taste when it is a well-formed StoredTaste with at least one answer, else null */
export function readTaste(value: unknown): { taste: Taste; updatedAt: string | null } | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, any>;
  if (raw.v !== 2 || !raw.axes || typeof raw.axes !== 'object') return null;
  const axes = {} as Taste['axes'];
  for (const axis of AXES) {
    const beta = raw.axes[axis];
    if (!beta || !finite(beta.a) || !finite(beta.b) || beta.a <= 0 || beta.b <= 0) return null;
    axes[axis] = { a: beta.a, b: beta.b };
  }
  const style: Taste['style'] = {};
  for (const key of STYLE_KEYS) {
    const stat = raw.style?.[key];
    if (stat && finite(stat.sum) && finite(stat.weight) && stat.weight >= 0) style[key] = { sum: stat.sum, weight: stat.weight };
  }
  const tags: Record<string, number> = {};
  if (raw.tags && typeof raw.tags === 'object') for (const [tag, score] of Object.entries(raw.tags)) if (finite(score)) tags[tag] = score;
  const answered = finite(raw.answered) ? raw.answered : 0;
  if (answered <= 0) return null;
  const taste: Taste = {
    v: 2, axes, style, tags,
    dealbreakers: Array.isArray(raw.dealbreakers) ? DEALBREAKERS.filter(d => raw.dealbreakers.includes(d)) : [],
    diet: DIETS.includes(raw.diet) ? raw.diet : null,
    answered,
  };
  const updatedAt = typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt)) ? raw.updatedAt : null;
  return { taste, updatedAt };
}

/** A legacy users.preferences.vibe with all six axes, clamped to 0–1, else null */
export function readVibe(value: unknown): Vibe | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (!AXES.every(a => finite(raw[a]))) return null;
  return Object.fromEntries(AXES.map(a => [a, clamp01(raw[a] as number)])) as Vibe;
}

/** First names, with a last initial (or a number) where two members share one */
export function firstNames(fullNames: string[]): string[] {
  const parts = fullNames.map(n => String(n ?? '').trim().split(/\s+/).filter(Boolean));
  const first = parts.map(p => (p[0] ?? 'Mate').slice(0, 30));
  const named = first.map((name, i) => {
    if (first.filter(f => f === name).length < 2) return name;
    const initial = parts[i][1]?.[0];
    return initial ? `${name} ${initial.toUpperCase()}.` : name;
  });
  const seen = new Map<string, number>();
  return named.map(name => {
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : `${name} ${n}`;
  });
}

type UserDoc = { _id: unknown; name?: unknown; picture?: unknown; preferences?: Record<string, any> | null };

/** One member's data from their users document (name already made unique) */
export function mateFrom(user: UserDoc, name: string): Mate {
  const prefs = user.preferences && typeof user.preferences === 'object' ? user.preferences : {};
  const stored = readTaste(prefs.taste);
  const legacy = stored ? null : readVibe(prefs.vibe);
  const taste = stored?.taste ?? (legacy ? tasteFromVibe(legacy) : null);
  const notes = Array.isArray(prefs.ghoomate?.notes) ? prefs.ghoomate.notes as { noEarlyStarts?: unknown }[] : [];
  const noEarlyStarts = notes.some(n => n && n.noEarlyStarts === true);
  return {
    userId: String(user._id),
    name,
    colour: typeof prefs.colour === 'string' ? prefs.colour : null,
    picture: typeof user.picture === 'string' ? user.picture : null,
    persona: typeof prefs.persona === 'string' ? prefs.persona : null,
    taste,
    vibe: stored ? vibeOf(stored.taste) : legacy,
    confidence: taste ? confidenceOf(taste) : null,
    swiped: Boolean(stored),
    tasteUpdatedAt: stored?.updatedAt ?? null,
    dealbreakers: DEALBREAKERS.filter(d => taste?.dealbreakers.includes(d) || (d === 'early-starts' && noEarlyStarts)),
    diet: taste?.diet ?? (DIETS.includes(prefs.diet) ? prefs.diet as Diet : null),
  };
}

/** Every member of the trip (in joining order) with their taste, and the answers to this trip's cards */
export async function loadSquad(db: Db, tripId: string, options: { answers?: boolean } = {}): Promise<SquadData> {
  const rows = await db.collection('trip_members').find({ trip_id: tripId }, { projection: { user_id: 1, joined_at: 1 } }).sort({ joined_at: 1 }).toArray();
  const ids = rows.map(r => r.user_id as string);
  const [users, answers] = await Promise.all([
    db.collection('users').find({ _id: { $in: ids } as any }, { projection: { name: 1, picture: 1, preferences: 1 } }).toArray(),
    options.answers === false
      ? Promise.resolve([])
      : db.collection('pref_answers').find({ user_id: { $in: ids }, scope: tripId }).toArray(),
  ]);
  const byId = new Map(users.map(u => [String(u._id), u as UserDoc]));
  const present = ids.flatMap(id => (byId.has(id) ? [byId.get(id)!] : []));
  const names = firstNames(present.map(u => String(u.name ?? '')));
  return { members: present.map((u, i) => mateFrom(u, names[i])), answers: answers as unknown as PrefAnswerDoc[] };
}

/**
 * pref_answers cascade (there are no foreign keys): deleting a trip takes every answer to its cards; a member who
 * leaves or is removed takes only theirs. Pass the session of the transaction doing the delete.
 */
export async function deleteTripAnswers(db: Db, tripId: string, userId?: string, session?: ClientSession) {
  const filter = userId ? { scope: tripId, user_id: userId } : { scope: tripId };
  return (await db.collection('pref_answers').deleteMany(filter, { session })).deletedCount;
}

/** The Explore catalogue city of a trip, from its destination or name */
export function deckCity(place: string | null | undefined): 'Udaipur' | 'Goa' | null {
  const text = place ?? '';
  if (/udaipur/i.test(text)) return 'Udaipur';
  if (/\bgoa\b/i.test(text)) return 'Goa';
  return null;
}

/* Group rules */

export type GroupStyleEntry = { value: number; rule: StyleRule; label: string; voters: number };
export type GroupStyle = Record<StyleKey, GroupStyleEntry>;

// Least misery where one unhappy member spoils it for everyone (an early alarm, a price, a long walk, a crowd);
// the middle ground for pace; the mean for time together; and the keenest member for eco (it costs nobody).
const RULES: Record<StyleKey, StyleRule> = {
  mornings: 'least-misery', budget: 'least-misery', walking: 'least-misery', crowds: 'least-misery',
  pace: 'median', together: 'mean', eco: 'most-pleasure',
};
/** styleConfidence a member needs on a dimension before their vote counts (about half a card's worth) */
const STYLE_VOTE = 0.2;
export const ECO_FIRST = 0.6;
/** "No early starts": nothing before this for the whole group */
export const EARLY_START = 8 * 60 + 30;

/** 10:30 AM for the latest riser (0), 8:30 AM in the middle, 6:30 AM for early birds (1), on the half hour */
export const startMinutes = (mornings: number) => Math.round((630 - 240 * clamp01(mornings)) / 30) * 30;
/** 3 slots a day for a slow squad, 4 in the middle, 5 for a packed one */
export const slotsPerDay = (pace: number) => 3 + Math.round(2 * clamp01(pace));
/** How many SPLIT or free slots a day the squad is happy with */
export const freeSlots = (together: number) => (together >= 0.67 ? 1 : together >= 0.34 ? 2 : 3);

/** "08:30 AM" */
export function clockTime(minutes: number) {
  const m = Math.max(0, Math.min(1439, Math.round(minutes)));
  const h = Math.floor(m / 60);
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

function combine(rule: StyleRule, values: number[]) {
  if (rule === 'least-misery') return Math.min(...values);
  if (rule === 'most-pleasure') return Math.max(...values);
  if (rule === 'median') return median(values);
  return values.reduce((s, v) => s + v, 0) / values.length;
}

const band = (value: number, low: string, mid: string, high: string) => (value < 0.34 ? low : value < 0.67 ? mid : high);

// Short and human, and never about a person: least-misery values are set by someone, but the label doesn't say who
function styleLabel(key: StyleKey, value: number) {
  switch (key) {
    case 'mornings': return `Group plans start around ${clockTime(startMinutes(value)).replace(/^0/, '')}, set by the latest riser`;
    case 'pace': {
      const n = slotsPerDay(value);
      return `${n} stops a day: ${n === 3 ? 'an easy pace' : n === 4 ? 'a steady pace' : 'a packed pace'}`;
    }
    case 'budget': return band(value, 'Budget-friendly picks that suit every wallet', 'Mid-range picks that suit every wallet', 'Room to splurge: everyone’s happy to spend');
    case 'walking': return band(value, 'Short walks, with rides between stops', 'Some walking, rides for the longer hops', 'Happy to walk all day');
    case 'crowds': return band(value, 'Busy spots only in their quiet windows', 'Popular spots at quieter hours', 'Crowds don’t bother the squad');
    case 'together': {
      const n = freeSlots(value);
      return value >= 0.67 ? 'Mostly together: at most 1 split or free slot a day' : `Up to ${n} split or free slots a day`;
    }
    case 'eco': return value >= ECO_FIRST ? 'Green picks: walking, e-rickshaws and family-run places' : 'No special green asks';
  }
}

/**
 * The squad's value per style dimension. Only members with a styleConfidence of 0.2 or more on a dimension vote on
 * it; with no votes it is 0.5 and the label says it's a default.
 */
export function groupStyle(members: { taste: Taste | null }[]): GroupStyle {
  const out = {} as GroupStyle;
  for (const key of STYLE_KEYS) {
    const values = members.flatMap(m => (m.taste && styleConfidence(m.taste.style[key]) >= STYLE_VOTE ? [styleValue(m.taste.style[key])] : []));
    const rule = RULES[key];
    const value = values.length ? round2(combine(rule, values)) : 0.5;
    const label = styleLabel(key, value);
    out[key] = { value, rule, label: values.length ? label : `${label} (a default until the squad swipes on it)`, voters: values.length };
  }
  return out;
}

/** When whole-group plans start: the mornings rule, and never before 8:30 AM if someone has ruled out early starts */
export const groupStart = (style: GroupStyle, dealbreakers: Dealbreaker[]) =>
  Math.max(startMinutes(style.mornings.value), dealbreakers.includes('early-starts') ? EARLY_START : 0);

/** The strictest diet in the squad (DIETS runs least to most strict); everyone eats at that level */
export function strictestDiet(members: { diet: Diet | null }[]): Diet | null {
  let at = -1;
  for (const m of members) if (m.diet) at = Math.max(at, DIETS.indexOf(m.diet));
  return at >= 0 ? DIETS[at] : null;
}

/** Everyone's hard noes as one anonymous list */
export function dealbreakerUnion(members: { dealbreakers: Dealbreaker[] }[]): Dealbreaker[] {
  return DEALBREAKERS.filter(d => members.some(m => m.dealbreakers.includes(d)));
}

/* Trip cards */

/** One trip card's swipes. Nopes are a count only: who said no is never kept. */
export type CardTally = {
  cardId: string;
  title: string;
  kind: CardKind;
  city: string | null;
  place: CardPlace | null;
  axes: Partial<Vibe>;
  tags: string[];
  /** First names, in squad order */
  likers: string[];
  lovers: string[];
  /** Likers and lovers, in squad order */
  fans: string[];
  nopes: number;
  /** Non-skip swipes */
  answered: number;
  /** Members with data who didn't answer but whose vibe fits it (≥ 0.65) */
  predicted: number;
  /** Members with data (at least 1) */
  members: number;
  score: number;
};

const PREDICTS = 0.65;

/** How well a card's axes suit a vibe: Σ weight·vibe / Σ weight */
export function fit(axes: Partial<Vibe>, vibe: Vibe) {
  let sum = 0;
  let weight = 0;
  for (const axis of AXES) {
    const w = axes[axis];
    if (!finite(w) || w <= 0) continue;
    sum += w * vibe[axis];
    weight += w;
  }
  return weight ? sum / weight : 0;
}

const latest = (a: PrefAnswerDoc, b: PrefAnswerDoc) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime();

/**
 * Tallies the trip's cards. score = (likes + 2·loves + 0.5·predicted − 2·nopes) / members with data.
 * mustDos: someone loved it · consensus: nobody said no and at least half of those who answered liked it ·
 * contested: has fans and at least one no.
 */
export function consensus(answers: PrefAnswerDoc[], members: Mate[]) {
  const position = new Map(members.map((m, i) => [m.userId, i]));
  const withData = members.filter(m => m.vibe);
  const M = Math.max(1, withData.length);
  const byCard = new Map<string, Map<string, PrefAnswerDoc>>();
  for (const answer of [...answers].sort(latest)) {
    if (!position.has(answer.user_id) || !answer.card || answer.card.kind === 'style' || typeof answer.card_id !== 'string') continue;
    const mine = byCard.get(answer.card_id) ?? new Map<string, PrefAnswerDoc>();
    // Newest first, so the first answer kept per member is their latest
    if (!mine.has(answer.user_id)) mine.set(answer.user_id, answer);
    byCard.set(answer.card_id, mine);
  }

  const tallies: CardTally[] = [];
  for (const [cardId, byUser] of byCard) {
    const list = [...byUser.values()];
    const snapshot = [...list].sort(latest)[0].card;
    const inOrder = members.filter(m => byUser.has(m.userId));
    const verdictOf = (m: Mate) => {
      const reply = byUser.get(m.userId)!.reply;
      return reply?.kind === 'swipe' ? reply.verdict : null;
    };
    const likers = inOrder.filter(m => verdictOf(m) === 'like').map(m => m.name);
    const lovers = inOrder.filter(m => verdictOf(m) === 'love').map(m => m.name);
    const nopes = inOrder.filter(m => verdictOf(m) === 'nope').length;
    const swiped = new Set(inOrder.filter(m => verdictOf(m) !== null).map(m => m.userId));
    const axes = snapshot.axes && typeof snapshot.axes === 'object' ? snapshot.axes : {};
    const predicted = withData.filter(m => !swiped.has(m.userId) && fit(axes, m.vibe!) >= PREDICTS).length;
    tallies.push({
      cardId,
      title: String(snapshot.title ?? cardId),
      kind: snapshot.kind,
      city: typeof snapshot.city === 'string' ? snapshot.city : null,
      place: snapshot.place && typeof snapshot.place === 'object' ? snapshot.place : null,
      axes,
      tags: Array.isArray(snapshot.tags) ? snapshot.tags.filter(t => typeof t === 'string') : [],
      likers, lovers,
      fans: inOrder.filter(m => verdictOf(m) === 'like' || verdictOf(m) === 'love').map(m => m.name),
      nopes,
      answered: swiped.size,
      predicted,
      members: M,
      score: round2((likers.length + 2 * lovers.length + 0.5 * predicted - 2 * nopes) / M),
    });
  }

  const byScore = (a: CardTally, b: CardTally) => b.score - a.score || a.title.localeCompare(b.title);
  return {
    tallies,
    mustDos: tallies.filter(t => t.lovers.length >= 1).sort((a, b) => b.lovers.length - a.lovers.length || byScore(a, b)),
    consensus: tallies.filter(t => t.nopes === 0 && t.answered >= 1 && t.fans.length >= Math.ceil(t.answered / 2)).sort(byScore),
    contested: tallies.filter(t => t.nopes >= 1 && t.fans.length >= 1).sort((a, b) => b.fans.length - a.fans.length || byScore(a, b)),
  };
}

/** What the itinerary works from: the best whole-group picks, every must-do and the split-slot material */
export type Shortlist = { consensus: CardTally[]; mustDos: CardTally[]; contested: CardTally[]; byId: Map<string, CardTally> };

export function shortlistOf(tally: ReturnType<typeof consensus>): Shortlist {
  const list = { consensus: tally.consensus.slice(0, 8), mustDos: tally.mustDos.slice(0, 12), contested: tally.contested.slice(0, 8) };
  const byId = new Map<string, CardTally>();
  for (const card of [...list.mustDos, ...list.consensus, ...list.contested]) byId.set(card.cardId, card);
  return { ...list, byId };
}

/* People */

/** The mate whose vibe is closest to yours: 1 − mean absolute difference over the axes, as a whole percentage */
export function twin(me: { userId: string; vibe: Vibe | null } | undefined, members: { userId: string; name: string; vibe: Vibe | null }[]) {
  if (!me?.vibe) return null;
  let best: { name: string; match: number } | null = null;
  for (const m of members) {
    if (m.userId === me.userId || !m.vibe) continue;
    const diff = AXES.reduce((s, a) => s + Math.abs(me.vibe![a] - m.vibe![a]), 0) / AXES.length;
    const match = Math.round((1 - diff) * 100);
    if (!best || match > best.match) best = { name: m.name, match };
  }
  return best;
}

const SQUAD_ADJECTIVE: Record<Axis, string> = {
  adventure: 'Thrill-Seeking', food: 'Hungry', nightlife: 'Night-Owl', culture: 'Curious', chill: 'Laid-Back', shops: 'Bargain-Hunting',
};
const SQUAD_NOUN: Record<Axis, string> = {
  adventure: 'Explorers', food: 'Foodies', nightlife: 'Party Starters', culture: 'Culture Buffs', chill: 'Daydreamers', shops: 'Shopaholics',
};

/** "The Hungry Explorers": an adjective from the squad's strongest blended axis and a plural noun from the next */
export function squadPersona(blended: Vibe | null): string | null {
  if (!blended) return null;
  const [first, second] = [...AXES].sort((x, y) => blended[y] - blended[x] || AXES.indexOf(x) - AXES.indexOf(y));
  return `The ${SQUAD_ADJECTIVE[first]} ${SQUAD_NOUN[second]}`;
}

/** The vibe profile of the members with data, each weighted by their confidence */
export function profileOf(members: Mate[]): SquadProfile | null {
  return squadProfile(members.flatMap(m => (m.vibe ? [{ name: m.name, vibe: m.vibe, ...(m.confidence ? { confidence: m.confidence } : {}) }] : [])));
}

/* Why-lines */

/** "Riya" · "Riya and Kabir" · "Riya, Kabir +2" */
export function namesLine(names: string[]) {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

/** Why a shortlisted card is on the plan. Only ever names the people who liked or loved it. */
export function cardWhy(card: CardTally): string {
  if (card.lovers.length) return `${namesLine(card.lovers)}’s must-do`;
  const fans = card.fans.length;
  if (card.nopes === 0 && fans > 0 && fans === card.answered && card.answered >= card.members) return `Everyone’s in · ${fans} of ${Math.max(fans, card.members)} liked`;
  return fans ? `Liked by ${namesLine(card.fans)}` : 'From the squad’s swipes';
}

/** A why from who a stop was planned for and the vibe it serves: "Picked for Riya · food" */
export function stopWhy(stop: { forMembers?: string[]; axis?: string | null; tag?: string }): string | null {
  const axis = isAxis(stop.axis) ? stop.axis : isAxis(stop.tag?.toLowerCase()) ? stop.tag!.toLowerCase() : null;
  if (stop.forMembers?.length) return `Picked for ${namesLine(stop.forMembers)}${axis ? ` · ${axis}` : ''}`;
  return axis ? `For the whole squad · ${axis}` : null;
}

const NEGATIVE = /\b(dislikes?|hates?|nope[sd]?|said no|not into|isn[’']?t into|aren[’']?t into|can[’']?t stand|doesn[’']?t (?:like|want)|don[’']?t (?:like|want)|won[’']?t|avoids?|skips?|veto(?:es|ed)?|refuses?)\b/i;

/** Gemini's why, trimmed to 120 characters; dropped if it names a member next to a no */
export function safeWhy(text: unknown, names: string[]): string | null {
  if (typeof text !== 'string') return null;
  const why = text.replace(/\s+/g, ' ').trim().slice(0, 120).trim();
  if (!why) return null;
  if (NEGATIVE.test(why) && names.some(n => why.toLowerCase().includes(n.toLowerCase()))) return null;
  return why;
}

/* Prompt blocks for the itinerary (one Gemini call; these only add text) */

const DIET_RULE: Record<Diet, string | null> = {
  'non-veg': null,
  eggetarian: 'vegetarian or egg dishes only (no meat or fish)',
  veg: 'vegetarian (no meat, fish or eggs)',
  vegan: 'vegan (no meat, fish, eggs, dairy or ghee)',
  jain: 'Jain (vegetarian, no eggs, onion, garlic or root vegetables)',
};

export const DEALBREAKER_RULE: Record<Dealbreaker, string> = {
  water: 'No swimming, snorkelling or kayaking for the whole group.',
  heights: 'No paragliding, ziplines or steep climbs for the whole group.',
  'early-starts': `Nothing before ${clockTime(EARLY_START)} for the whole group.`,
  'late-nights': 'Wrap up whole-group plans by 10 PM.',
  'long-drives': 'No leg over 90 minutes on the road.',
  crowds: 'Popular places only in their quiet windows.',
  spicy: 'Point out mild options at every meal.',
};

/** The "Group constraints" block. Only dimensions someone swiped on are stated; who set them never is. */
export function constraintsBrief(style: GroupStyle, diet: Diet | null, dealbreakers: Dealbreaker[]): string {
  const lines: string[] = [];
  const voted = (key: StyleKey) => style[key].voters > 0;
  if (voted('mornings') || dealbreakers.includes('early-starts')) lines.push(`Start whole-group plans at ${clockTime(groupStart(style, dealbreakers))} or later.`);
  if (voted('pace')) lines.push(`Pace: ${slotsPerDay(style.pace.value)} time slots a day (day 1 and the last day can have fewer).`);
  if (voted('budget')) lines.push(`Budget: ${band(style.budget.value, 'keep it budget-friendly: free sights, street food, shared rides', 'mid-range: a mix of free and paid experiences', 'happy to splurge on a few special experiences')}.`);
  if (voted('walking')) lines.push(`Walking: ${band(style.walking.value, 'keep walks short and use autos or cabs between stops', 'some walking is fine; ride for the longer hops', 'the squad is happy to walk between nearby stops')}.`);
  if (voted('crowds')) lines.push(`Crowds: ${band(style.crowds.value, 'avoid them; busy sites only in their quiet windows', 'popular spots are fine at quieter hours', 'crowds are fine')}.`);
  if (voted('together')) {
    const n = freeSlots(style.together.value);
    lines.push(`Time together: at most ${n} SPLIT or free slot${n === 1 ? '' : 's'} a day; the rest is whole-group.`);
  }
  if (voted('eco') && style.eco.value >= ECO_FIRST) lines.push('Eco: prefer walking, e-rickshaws and local family-run places.');
  const dietRule = diet ? DIET_RULE[diet] : null;
  if (dietRule) lines.push(`Diet: every meal stop must suit a ${dietRule} diet.`);
  for (const d of dealbreakers) lines.push(DEALBREAKER_RULE[d]);
  if (!lines.length) return '';
  return ['Group constraints (they hold for every whole-group slot; never say who any of them comes from):', ...lines.map(l => `- ${l}`)].join('\n');
}

function cardLine(card: CardTally) {
  const p = card.place ?? {};
  const details = [p.area, p.startTime && `starts ${p.startTime}`, p.priceRupees && `₹${p.priceRupees}`, p.duration].filter(Boolean);
  return `[${card.cardId}] ${card.title}${details.length ? ` (${details.join(', ')})` : ''}`;
}

/** The "Squad shortlist" block: consensus picks, each member's must-dos and split-slot material. Names fans only. */
export function shortlistBrief(list: Shortlist, members: { name: string }[]): string {
  if (!list.byId.size) return '';
  const lines = ['Squad shortlist: real experiences the squad swiped on. Use these first, at their area and start time.'];
  if (list.consensus.length) {
    lines.push('Whole-group favourites (nobody said no):');
    for (const card of list.consensus) lines.push(`- ${cardLine(card)} · ${card.fans.length} of ${card.answered} liked`);
  }
  const mustDos = members.flatMap(m => {
    const loved = list.mustDos.filter(c => c.lovers.includes(m.name));
    return loved.length ? [`- for ${m.name}: ${loved.map(cardLine).join('; ')}`] : [];
  });
  if (mustDos.length) lines.push('Must-dos (plan each one, as a spotlight for the people named):', ...mustDos);
  if (list.contested.length) {
    lines.push('Split-slot material (some are keen, not everyone: only as a SPLIT option for its fans):');
    for (const card of list.contested) lines.push(`- ${cardLine(card)} · for ${card.fans.join(', ')}`);
  }
  lines.push('When a stop is one of these, set card to its id (the text in brackets) and keep its area and start time.');
  return lines.join('\n');
}

/* Squad insights (GET /api/trips/:tripId/squad) */

export function buildInsights(args: { tripId: string; city: string | null; meId: string; members: Mate[]; answers: PrefAnswerDoc[] }): SquadInsights {
  const { tripId, city, meId, members, answers } = args;
  const withData = members.filter(m => m.vibe);
  const profile = profileOf(members);
  const axes = Object.fromEntries(AXES.map(axis => {
    const stats = profile?.axes[axis];
    return [axis, stats ? { mean: stats.mean, min: stats.min, max: stats.max, class: stats.class } : { mean: 0.5, min: 0.5, max: 0.5, class: 'neutral' as const }];
  })) as SquadInsights['axes'];
  const byClass = (cls: string) => AXES.filter(a => axes[a].class === cls);
  const style = groupStyle(withData);
  const tally = consensus(answers, members);
  const tripAnswered = new Map<string, number>();
  for (const a of answers) if (a.reply && a.reply.kind !== 'skip') tripAnswered.set(a.user_id, (tripAnswered.get(a.user_id) ?? 0) + 1);

  const squad: SquadMember[] = members.map(m => ({
    userId: m.userId,
    name: m.name,
    colour: m.colour,
    picture: m.picture,
    persona: m.persona,
    vibe: m.vibe,
    confidence: m.taste ? overallConfidence(m.taste) : 0,
    coreDone: m.swiped,
    tripAnswered: tripAnswered.get(m.userId) ?? 0,
    isMe: m.userId === meId,
  }));

  return {
    tripId,
    city,
    members: squad,
    pending: members.filter(m => !m.vibe).map(m => m.name),
    axes,
    sharedLoves: byClass('love'),
    splits: byClass('split'),
    vetoes: byClass('veto'),
    style: Object.fromEntries(STYLE_KEYS.map(k => [k, { value: style[k].value, rule: style[k].rule, label: style[k].label }])) as SquadInsights['style'],
    diet: strictestDiet(members),
    dealbreakers: dealbreakerUnion(members),
    mustDos: tally.mustDos.map(c => ({ cardId: c.cardId, title: c.title, fans: c.lovers })),
    consensus: tally.consensus.map(c => ({ cardId: c.cardId, title: c.title, likes: c.fans.length, answered: c.answered, fans: c.fans })),
    contested: tally.contested.map(c => ({ cardId: c.cardId, title: c.title, fans: c.fans })),
    twin: twin(members.find(m => m.userId === meId), withData),
    squadPersona: squadPersona(profile?.blended ?? null),
  };
}

export async function squadInsights(db: Db, access: TripAccess, userId: string): Promise<SquadInsights> {
  const { members, answers } = await loadSquad(db, access.trip.id);
  return buildInsights({ tripId: access.trip.id, city: deckCity(access.trip.destination || access.trip.name), meId: userId, members, answers });
}
