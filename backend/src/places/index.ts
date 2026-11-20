// The destination inventory: every guide, finding the guide for a trip, ranking a guide's items for a person or a
// squad, and the compact brief the itinerary prompt is grounded on. Pure: no database, no network.
import { VIBE_AXES, type Vibe, type VibeAxis } from '../voice/experiences.ts';
import type { CityGuide, ItemKind, Month, PlaceItem, TimeOfDay, Traveller } from './types.ts';
import { guide as agra } from './cities/agra.ts';
import { guide as chettinad } from './cities/chettinad.ts';
import { guide as choptaTungnath } from './cities/chopta-tungnath.ts';
import { guide as dzukouValley } from './cities/dzukou-valley.ts';
import { guide as gandikota } from './cities/gandikota.ts';
import { guide as goa } from './cities/goa.ts';
import { guide as gokarna } from './cities/gokarna.ts';
import { guide as gurez } from './cities/gurez.ts';
import { guide as hampi } from './cities/hampi.ts';
import { guide as jaisalmer } from './cities/jaisalmer.ts';
import { guide as kaziranga } from './cities/kaziranga.ts';
import { guide as kulluManali } from './cities/kullu-manali.ts';
import { guide as lakshadweep } from './cities/lakshadweep.ts';
import { guide as lehLadakh } from './cities/leh-ladakh.ts';
import { guide as majuli } from './cities/majuli.ts';
import { guide as meghalaya } from './cities/meghalaya.ts';
import { guide as orchha } from './cities/orchha.ts';
import { guide as rannOfKutch } from './cities/rann-of-kutch.ts';
import { guide as rishikesh } from './cities/rishikesh.ts';
import { guide as satpura } from './cities/satpura.ts';
import { guide as spitiValley } from './cities/spiti-valley.ts';
import { guide as tawang } from './cities/tawang.ts';
import { guide as udaipur } from './cities/udaipur.ts';
import { guide as varanasi } from './cities/varanasi.ts';
import { guide as ziroValley } from './cities/ziro-valley.ts';

export * from './types.ts';

export const GUIDES: CityGuide[] = [
  chettinad, orchha, majuli, hampi, udaipur, varanasi, agra, tawang, gurez, choptaTungnath, spitiValley, kulluManali, lehLadakh,
  rishikesh, dzukouValley, ziroValley, gandikota, meghalaya, rannOfKutch, jaisalmer, lakshadweep, gokarna, goa, satpura, kaziranga,
];

export const GUIDE_BY_ID = new Map(GUIDES.map(g => [g.id, g]));
export const ITEM_BY_ID = new Map(GUIDES.flatMap(g => g.items.map(item => [item.id, { guide: g, item }] as const)));

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every name a guide answers to, longest first so "south goa" beats "goa" and "old manali" beats "manali" */
const MATCHERS = GUIDES
  .flatMap(g => [g.id.replace(/-/g, ' '), g.name.toLowerCase(), ...g.aliases].map(alias => ({ guide: g, alias })))
  .sort((a, b) => b.alias.length - a.alias.length)
  .map(({ guide, alias }) => ({ guide, re: new RegExp(`(^|[^a-z])${escape(alias).replace(/[\s–-]+/g, '[\\s–-]*')}([^a-z]|$)`, 'i') }));

/** The guide for a trip destination like "Hampi, Karnataka" or "Spiti", or null when we have none */
export function guideFor(destination: string | null | undefined): CityGuide | null {
  const text = (destination ?? '').trim();
  if (!text) return null;
  return MATCHERS.find(m => m.re.test(text))?.guide ?? null;
}

/** The month (1–12) of an ISO date like "2027-01-14", or null */
export function monthOf(isoDate: string | null | undefined): Month | null {
  const match = /^\d{4}-(\d{2})-\d{2}/.exec(isoDate ?? '');
  const month = match ? Number(match[1]) : NaN;
  return month >= 1 && month <= 12 ? (month as Month) : null;
}

/** Open (or worth it) in that month */
export const inSeason = (item: PlaceItem, month: Month | null) => !month || !item.months || item.months.includes(month);

/** Weighted mean of the person's scores over the axes the item speaks to, 0–100 (same maths as the guide experiences) */
export function itemFit(item: PlaceItem, vibe: Vibe): number {
  const axes = VIBE_AXES.filter(axis => (item.vibe[axis] ?? 0) > 0);
  const weight = axes.reduce((sum, axis) => sum + item.vibe[axis]!, 0);
  return weight ? Math.round((axes.reduce((sum, axis) => sum + item.vibe[axis]! * vibe[axis], 0) / weight) * 100) : 0;
}

/** The axis an item is mostly about */
export const itemAxis = (item: PlaceItem): VibeAxis =>
  VIBE_AXES.reduce((best, axis) => ((item.vibe[axis] ?? 0) > (item.vibe[best] ?? 0) ? axis : best));

export type ItemQuery = {
  vibe?: Vibe | null;
  kinds?: ItemKind[];
  /** Only lesser-known spots */
  gems?: boolean;
  traveller?: Traveller;
  month?: Month | null;
  maxCostRupees?: number | null;
  /** Leave out anything harder than this */
  maxEffort?: 'easy' | 'moderate' | 'hard';
  exclude?: string[];
};

const EFFORT_RANK = { easy: 0, moderate: 1, hard: 2 } as const;

/** A guide's items that fit the query, best first: by vibe fit when there is a vibe, else gems and cheaper first */
export function rankItems(guide: CityGuide, query: ItemQuery = {}): { item: PlaceItem; match: number | null }[] {
  return guide.items
    .filter(item =>
      (!query.kinds || query.kinds.includes(item.kind)) &&
      (!query.gems || item.gem) &&
      (!query.traveller || item.goodFor.includes(query.traveller)) &&
      inSeason(item, query.month ?? null) &&
      (query.maxCostRupees == null || item.costRupees <= query.maxCostRupees) &&
      (!query.maxEffort || EFFORT_RANK[item.effort] <= EFFORT_RANK[query.maxEffort]) &&
      !query.exclude?.includes(item.id))
    .map(item => ({ item, match: query.vibe ? itemFit(item, query.vibe) : null }))
    .sort((a, b) =>
      (b.match ?? 0) - (a.match ?? 0) || Number(b.item.gem) - Number(a.item.gem) || a.item.costRupees - b.item.costRupees || a.item.id.localeCompare(b.item.id));
}

const rupees = (n: number) => (n === 0 ? 'free' : `₹${n.toLocaleString('en-IN')}`);

/** One prompt line per item: everything a planner needs, nothing it doesn’t */
export const itemLine = (item: PlaceItem) =>
  `- ${item.name} [${item.kind}${item.gem ? ', gem' : ''}] ${item.area} · best ${item.bestTime} · ${item.hours} · ~${item.durationHours} h · ${rupees(item.costRupees)} · ${item.pitch} Tip: ${item.tip}`;

/**
 * The researched inventory as prompt text: the city's must-knows, then up to `limit` in-season items, ranked for the
 * squad's vibe but always keeping every kind and the gems represented.
 */
export function guideBrief(guide: CityGuide, opts: { vibe?: Vibe | null; month?: Month | null; limit?: number } = {}): string {
  const limit = opts.limit ?? 45;
  const ranked = rankItems(guide, { vibe: opts.vibe, month: opts.month }).map(r => r.item);
  // The best of each kind first, so a food-mad squad still sees the day trips; then the rest by rank
  const firsts = [...new Map(ranked.map(item => [item.kind, item] as const)).values()];
  const picked = [...new Set([...firsts, ...ranked])].slice(0, limit);
  const month = opts.month ? ` Trip month: ${opts.month}. Best months: ${guide.bestMonths.join(', ')}. ${guide.avoid}` : '';
  return [
    `${guide.name}, ${guide.state}. ${guide.summary}${month}`,
    `Getting around: ${guide.gettingAround}`,
    `Must-knows: ${guide.practical.join(' ')}`,
    `Signature food: ${guide.dishes.map(d => `${d.name}${d.where ? ` (${d.where})` : ''}`).join('; ')}.`,
    'Researched places (name [kind] area · best time · hours · time needed · cost per person · pitch · tip):',
    ...picked.map(itemLine),
  ].join('\n');
}

/** Itinerary stop tag for an item */
export function stopTag(item: PlaceItem): 'Adventure' | 'Food' | 'Chill' | 'Culture' | 'Nightlife' | 'Shops' {
  switch (item.kind) {
    case 'food': return 'Food';
    case 'nightlife': return 'Nightlife';
    case 'shopping': return 'Shops';
    case 'adventure': return 'Adventure';
    case 'nature': case 'wellness': return 'Chill';
    case 'sight': case 'spiritual': case 'neighbourhood': return 'Culture';
    default: {
      const axis = itemAxis(item);
      return axis === 'adventure' ? 'Adventure' : axis === 'food' ? 'Food' : axis === 'nightlife' ? 'Nightlife' : axis === 'shops' ? 'Shops' : axis === 'chill' ? 'Chill' : 'Culture';
    }
  }
}

/** Start time for an item's best time of day, in minutes after midnight */
export const START_OF: Record<TimeOfDay, number> = {
  sunrise: 6 * 60, morning: 9 * 60, midday: 12 * 60, afternoon: 15 * 60, sunset: 17 * 60 + 15, evening: 19 * 60 + 30, night: 21 * 60, any: 10 * 60,
};
