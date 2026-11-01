// The Makers of Udaipur rules: who is near a heritage stop, what a fair price looks like, and which workshop slots
// are free. Pure functions with no I/O, so the API, the tests and the voice agent can share them.
import { CRAFT_BY_ID, ITEM_SIZES, type Craft, type ItemSize, type PriceBand } from './crafts.ts';
import { CLOSED_DATES, MAKERS, type Maker } from './makers.ts';
import { SITE_BY_ID, SITES } from '../heritage/sites.ts';

/* Distance and getting there */

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Old-city lanes wind: walk 1.3× the straight line at 80 m a minute */
export const walkMinutes = (km: number) => Math.max(1, Math.round((km * 1000 * 1.3) / 80));
/** Roads out of town: 1.3× the straight line at 50 km/h, plus 8 minutes to park and find the lane, to the nearest 5 */
export const driveMinutes = (km: number) => Math.max(10, Math.round(((km * 1.3 * 60) / 50 + 8) / 5) * 5);
/** Beyond this the app says "drive" instead of "walk" */
export const WALKABLE_KM = 2.5;

export type Route = {
  siteId: string;
  siteName: string;
  km: number;
  mode: 'walk' | 'drive';
  minutes: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** From a heritage site to a maker's door */
export function routeFrom(maker: Maker, siteId: string): Route {
  const site = SITE_BY_ID.get(siteId);
  if (!site) throw new Error(`Unknown heritage site ${siteId}`);
  const km = haversineKm(maker, site);
  const walk = km <= WALKABLE_KM;
  return { siteId, siteName: site.name, km: round2(km), mode: walk ? 'walk' : 'drive', minutes: walk ? walkMinutes(km) : driveMinutes(km) };
}

/** Village makers are measured from the City Palace, since no heritage site is close */
const ANCHOR_SITE = 'city-palace';
const NEARBY_KM = 5;

/** The heritage site closest to the maker, or the City Palace when the studio is out in a village */
export function nearestRoute(maker: Maker): Route {
  let best = SITES[0];
  let bestKm = Infinity;
  for (const site of SITES) {
    const km = haversineKm(maker, site);
    if (km < bestKm) [best, bestKm] = [site, km];
  }
  return routeFrom(maker, bestKm <= NEARBY_KM ? best.id : ANCHOR_SITE);
}

/* Makers and crafts */

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

export function tagsFor(maker: Maker) {
  const tags: string[] = [];
  if (maker.generation > 1) tags.push(`${ORDINALS[maker.generation] ?? `${maker.generation}th`} generation`);
  if (maker.womenLed) tags.push('Women-led');
  if (nearestRoute(maker).mode === 'drive') tags.push('Day trip');
  if (maker.workshop.minAge <= 8) tags.push('Kids welcome');
  return tags;
}

export type MakerSummary = {
  id: string;
  name: string;
  craftIds: string[];
  crafts: { id: string; name: string; hindi: string; cover: string }[];
  studio: string;
  area: string;
  lat: number;
  lng: number;
  tagline: string;
  generation: number;
  yearsWorking: number;
  languages: string[];
  womenLed: boolean;
  tags: string[];
  workshop: { title: string; durationMin: number; pricePerPerson: number; minPeople: number; maxPeople: number };
  /** The heritage site closest to the studio */
  nearest: Route;
  /** From the site passed as `near`, when there is one */
  fromSite: Route | null;
};

export function summarise(maker: Maker, near: string | null = null): MakerSummary {
  const { workshop } = maker;
  return {
    id: maker.id,
    name: maker.name,
    craftIds: maker.craftIds,
    crafts: maker.craftIds.map(id => CRAFT_BY_ID.get(id)!).map(c => ({ id: c.id, name: c.name, hindi: c.hindi, cover: c.cover })),
    studio: maker.studio,
    area: maker.area,
    lat: maker.lat,
    lng: maker.lng,
    tagline: maker.tagline,
    generation: maker.generation,
    yearsWorking: maker.yearsWorking,
    languages: maker.languages,
    womenLed: maker.womenLed,
    tags: tagsFor(maker),
    workshop: {
      title: workshop.title,
      durationMin: workshop.durationMin,
      pricePerPerson: workshop.pricePerPerson,
      minPeople: workshop.minPeople,
      maxPeople: workshop.maxPeople,
    },
    nearest: nearestRoute(maker),
    fromSite: near ? routeFrom(maker, near) : null,
  };
}

/**
 * Makers who work with a craft (or all of them), and with `near`, sorted by distance from that heritage site,
 * nearest first. `maxKm` keeps only the makers within that straight-line distance.
 */
export function listMakers(options: { craft?: string | null; near?: string | null; maxKm?: number | null } = {}): MakerSummary[] {
  const { craft = null, near = null, maxKm = null } = options;
  const site = near ? SITE_BY_ID.get(near) : undefined;
  const rows = MAKERS.filter(m => !craft || m.craftIds.includes(craft)).map(maker => ({ maker, km: site ? haversineKm(maker, site) : 0 }));
  const within = site && maxKm !== null ? rows.filter(r => r.km <= maxKm) : rows;
  if (site) within.sort((a, b) => a.km - b.km || a.maker.name.localeCompare(b.maker.name));
  return within.map(r => summarise(r.maker, site ? site.id : null));
}

/* Fair prices */

/** Up to 10% above the top of the band is still fair; beyond 30% is a tourist price; under 60% of the bottom is too cheap to be handmade */
export const FAIR_SLACK = 1.1;
export const TOURIST_ABOVE = 1.3;
export const TOO_LOW_BELOW = 0.6;

export type PriceVerdict = 'fair' | 'a-bit-high' | 'tourist-price' | 'too-low';

export type PriceCheck = {
  craftId: string;
  craftName: string;
  size: ItemSize;
  /** What the size means for this craft */
  item: string;
  quoted: number;
  fair: { min: number; max: number };
  verdict: PriceVerdict;
  headline: string;
  advice: string;
  /** What to offer first; null when the quote is fair or too cheap to haggle */
  counter: number | null;
  /** Pay no more than this */
  walkAway: number;
  /** Rupees above the top of the fair range, 0 when it is not above it */
  overBy: number;
  /** Quote divided by the top of the fair range */
  multiple: number;
  /** Shown when the seller called it an antique */
  antiqueNote: string | null;
};

/** Round to a figure people actually say out loud: ₹10 steps under 500, ₹50 under 5,000, ₹100 under 25,000, else ₹500 */
export function niceRound(n: number) {
  const step = n < 500 ? 10 : n < 5000 ? 50 : n < 25000 ? 100 : 500;
  return Math.round(n / step) * step;
}

export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function priceBand(craft: Craft, size: ItemSize): PriceBand {
  return craft.prices.find(p => p.size === size)!;
}

export function fairPriceCheck(craftId: string, size: ItemSize, quoted: number, options: { antique?: boolean } = {}): PriceCheck {
  const craft = CRAFT_BY_ID.get(craftId);
  if (!craft) throw new Error(`Unknown craft ${craftId}`);
  if (!ITEM_SIZES.includes(size)) throw new Error(`Unknown size ${size}`);
  if (!Number.isFinite(quoted) || quoted <= 0) throw new Error('The quoted price must be above zero');
  const { min, max, item } = priceBand(craft, size);
  const multiple = Math.round((quoted / max) * 10) / 10;
  const overBy = Math.max(0, Math.round(quoted - max));

  let verdict: PriceVerdict;
  if (quoted < min * TOO_LOW_BELOW) verdict = 'too-low';
  else if (quoted <= max * FAIR_SLACK) verdict = 'fair';
  else if (quoted <= max * TOURIST_ABOVE) verdict = 'a-bit-high';
  else verdict = 'tourist-price';

  const range = `${inr(min)} to ${inr(max)}`;
  let headline: string;
  let advice: string;
  let counter: number | null = null;
  if (verdict === 'fair') {
    headline = 'Fair price';
    advice = `${inr(quoted)} sits inside the usual ${range} for a handmade piece this size. A friendly “best price?” is fine, but nobody is overcharging you.`;
  } else if (verdict === 'a-bit-high') {
    counter = niceRound(min + (max - min) * 0.6);
    headline = 'A bit high';
    advice = `Handmade work this size usually runs ${range}. Offer ${inr(counter)} and settle at ${inr(max)} or less.`;
  } else if (verdict === 'tourist-price') {
    counter = niceRound(min + (max - min) * 0.4);
    headline = 'Tourist price';
    advice = `That is ${multiple}× the top of the usual ${range} for this size. Offer ${inr(counter)}, and walk away above ${inr(max)}.`;
  } else {
    headline = 'Cheaper than handmade can be';
    advice = `Handmade work this size rarely sells below ${inr(min)}. At ${inr(quoted)} it is probably printed, moulded or machine-made: check the signs before you pay.`;
  }

  return {
    craftId,
    craftName: craft.name,
    size,
    item,
    quoted: Math.round(quoted),
    fair: { min, max },
    verdict,
    headline,
    advice,
    counter,
    walkAway: max,
    overBy,
    multiple,
    antiqueNote: options.antique
      ? `Anything over 100 years old needs ASI clearance to leave India (Antiquities and Art Treasures Act, 1972), and a genuine antique is priced by a dealer’s certificate, not by a bazaar quote. At ${inr(quoted)}, treat it as new work aged to look old and judge it by the fair range.`
      : null,
  };
}

/* Workshop slots */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** A slot is bookable until this long before it starts */
export const LEAD_MINUTES = 180;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** "10:30 am" → "10:30 AM"; null when it is not a 12-hour time */
export function normaliseSlot(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  if (hour < 1 || hour > 12 || Number(match[2]) > 59) return null;
  return `${String(hour).padStart(2, '0')}:${match[2]} ${match[3].toUpperCase()}`;
}

export function slotMinutes(slot: string) {
  const match = /^(\d{2}):(\d{2}) (AM|PM)$/.exec(slot)!;
  return ((Number(match[1]) % 12) + (match[3] === 'PM' ? 12 : 0)) * 60 + Number(match[2]);
}

/** The date and minutes after midnight in India right now */
export function indiaNow(now: Date) {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return { date: ist.toISOString().slice(0, 10), minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
}

export type SlotInfo = {
  time: string;
  /** People who can still join this slot */
  spotsLeft: number;
  available: boolean;
  /** Why it can't be booked */
  reason: 'past' | 'full' | null;
};

export type DayAvailability = {
  date: string;
  open: boolean;
  /** "Closed on Sundays", "Diwali: studios close for Lakshmi Puja" */
  closedReason: string | null;
  slots: SlotInfo[];
};

/**
 * The workshop slots on a date. `booked` is how many people are already booked per slot, so a slot is full once
 * fewer than the minimum group could still join. Slots that start within three hours (or have passed) are closed.
 */
export function availabilityFor(maker: Maker, date: string, booked: Record<string, number> = {}, now = new Date()): DayAvailability {
  const closed = CLOSED_DATES.find(c => c.date === date);
  if (closed) return { date, open: false, closedReason: closed.reason, slots: [] };

  const weekday = weekdayOf(date);
  const times = [...new Set(maker.workshop.weekly.filter(w => w.days.includes(weekday)).flatMap(w => w.times))].sort((a, b) => slotMinutes(a) - slotMinutes(b));
  if (!times.length) return { date, open: false, closedReason: `Closed on ${WEEKDAYS[weekday]}s`, slots: [] };

  const today = indiaNow(now);
  const { maxPeople, minPeople } = maker.workshop;
  const slots = times.map((time): SlotInfo => {
    const spotsLeft = Math.max(0, maxPeople - (booked[time] ?? 0));
    const past = date < today.date || (date === today.date && slotMinutes(time) < today.minutes + LEAD_MINUTES);
    const full = spotsLeft < minPeople;
    return { time, spotsLeft, available: !past && !full, reason: past ? 'past' : full ? 'full' : null };
  });
  return { date, open: true, closedReason: null, slots };
}

/** What goes into the itinerary stop's notes: who, how much, where, what you take away */
export function stopNotes(maker: Maker, people: number, total: number, note: string) {
  const { workshop } = maker;
  return [
    `${people} ${people === 1 ? 'person' : 'people'} · ${durationLabel(workshop.durationMin)} · ${inr(total)} (${inr(workshop.pricePerPerson)} each). Pay ${maker.name.split(' ')[0]} directly on the day, by UPI or cash.`,
    `At ${maker.studio}, ${maker.area}.`,
    `You take away ${workshop.makes.charAt(0).toLowerCase()}${workshop.makes.slice(1)}.`,
    note && `Your note: ${note}`,
  ].filter(Boolean).join(' ');
}

/* Questions a visitor might ask */

export type Faq = { q: string; a: string; keywords: string[] };

const firstName = (maker: Maker) => maker.name.split(' ')[0];
const STOP_WORDS = new Set(['the', 'a', 'an', 'is', 'are', 'do', 'does', 'can', 'could', 'we', 'you', 'i', 'it', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'my', 'our', 'what', 'how', 'will', 'there', 'this', 'that', 'with', 'be', 'at', 'me', 'us', 'your']);

/** "prices" and "price" meet at "pric", "making" and "make" at "mak" */
const stem = (word: string) => (word.length > 3 ? word.replace(/(ing|ed|es|s)$/, '').replace(/e$/, '') : word);

const words = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9₹\s]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP_WORDS.has(w)).map(stem);

export const durationLabel = (minutes: number) => (minutes < 120 ? `${minutes} min` : `${minutes / 60} hrs`);

/** Everything the app knows about a maker and their craft, as questions with answers */
export function faqFor(maker: Maker): Faq[] {
  const craft = CRAFT_BY_ID.get(maker.craftIds[0])!;
  const { workshop } = maker;
  const near = nearestRoute(maker);
  const where = near.mode === 'walk'
    ? `${near.minutes} min on foot from ${near.siteName}`
    : `about ${near.minutes} min by road from ${near.siteName}`;
  const times = [...new Set(workshop.weekly.flatMap(w => w.times))].sort((a, b) => slotMinutes(a) - slotMinutes(b)).join(', ');
  const price = craft.prices.map(p => `${p.item}: ${inr(p.min)} to ${inr(p.max)}`).join('; ');
  const gi = craft.gi
    ? `Yes. ${craft.name} is registered as “${craft.gi.name}”${craft.gi.year ? ` (${craft.gi.year})` : ''} in the Geographical Indications Registry.`
    : `${craft.name} does not have a Geographical Indication tag, so ask the maker to show you the work being made instead of relying on a label.`;
  const entry = (q: string, a: string, keywords: string[]): Faq => ({ q, a, keywords });

  return [
    ...maker.faq.map(f => entry(f.q, f.a, words(f.q))),
    entry('How long is the workshop?', `${workshop.title} takes ${durationLabel(workshop.durationMin)}. Slots: ${times}.`, ['workshop', 'long', 'duration', 'time', 'hour', 'minute', 'take', 'slot', 'when', 'start', 'schedule']),
    entry('What does it cost?', `${inr(workshop.pricePerPerson)} per person, so ${inr(workshop.pricePerPerson * 6)} for a squad of six. Pay ${firstName(maker)} directly on the day.`, ['cost', 'price', 'pay', 'fee', 'rupee', 'much', 'expensive', 'ticket', 'charge', 'workshop', 'book']),
    entry('How many people can come?', `${workshop.minPeople} to ${workshop.maxPeople} people per session.`, ['group', 'people', 'squad', 'size', 'many', 'minimum', 'maximum', 'friend', 'team', 'family', 'large', 'big']),
    entry('Can children join?', workshop.minAge <= 8 ? `Yes, from age ${workshop.minAge}.` : `Ages ${workshop.minAge} and up.`, ['kid', 'child', 'children', 'age', 'toddler', 'baby', 'teen', 'young']),
    entry('What do we take away?', `${workshop.makes}.`, ['take', 'home', 'keep', 'make', 'souvenir', 'bring', 'get', 'learn', 'create']),
    entry('Which languages do they speak?', `${firstName(maker)} speaks ${maker.languages.join(', ')}.`, ['language', 'speak', 'english', 'hindi', 'french', 'gujarati', 'urdu', 'mewari', 'marwari', 'talk', 'translate']),
    entry('Where is the studio?', `In ${maker.area}, ${where}.`, ['where', 'address', 'location', 'find', 'reach', 'direction', 'near', 'walk', 'far', 'distance', 'area', 'drive', 'cab']),
    entry('Who is the maker?', maker.story, ['who', 'generation', 'family', 'story', 'year', 'experience', 'women', 'led', 'about', 'background', 'learn']),
    entry(`How is ${craft.name.toLowerCase()} made?`, craft.steps.map((s, i) => `${i + 1}. ${s}`).join(' '), ['made', 'process', 'step', 'technique', 'method', 'craft', 'material', 'pigment', 'how', 'work']),
    entry('How do I spot the real thing?', `Handmade looks like this: ${craft.authentic.slice(0, 3).join('; ')}. Machine-made often has ${craft.machineMade[0].charAt(0).toLowerCase()}${craft.machineMade[0].slice(1)}.`, ['real', 'fake', 'authentic', 'genuine', 'spot', 'machine', 'handmade', 'copy', 'print', 'tell', 'difference', 'original', 'duplicate', 'antique']),
    entry('What is a fair price?', `Estimates for a handmade piece bought direct: ${price}. ${craft.priceNote}`, ['fair', 'bargain', 'haggle', 'overpay', 'tourist', 'worth', 'buy', 'shop', 'negotiate', 'discount', 'price']),
    entry('Does it have a GI tag?', gi, ['gi', 'geographical', 'indication', 'tag', 'certified', 'registered', 'protected', 'certificate', 'label']),
    entry('How do I care for it?', craft.care, ['care', 'clean', 'wash', 'maintain', 'store', 'preserve', 'last', 'damage', 'travel', 'pack']),
    entry('What is the history?', craft.history, ['history', 'old', 'origin', 'started', 'tradition', 'ancient', 'century', 'royal', 'king', 'maharana']),
  ];
}

/** The best answer to a free-text question from the curated FAQ, or null when nothing matches */
export function bestFaq(maker: Maker, question: string): Faq | null {
  const asked = words(question);
  if (!asked.length) return null;
  let best: { faq: Faq; score: number } | null = null;
  for (const faq of faqFor(maker)) {
    const keywords = new Set(faq.keywords.map(stem));
    const own = new Set(words(faq.q));
    const score = asked.reduce((total, w) => total + (keywords.has(w) ? 1 : 0) + (own.has(w) ? 0.5 : 0), 0);
    // One keyword hit at least: a word that only repeats the question's own wording is not a match
    if (score >= 1 && (!best || score > best.score)) best = { faq, score };
  }
  return best?.faq ?? null;
}

/** The facts Gemini may answer from, and nothing else */
export function groundingFacts(maker: Maker): string {
  const craft = CRAFT_BY_ID.get(maker.craftIds[0])!;
  const facts = [
    `Maker: ${maker.name}, ${maker.tagline.toLowerCase()}. ${maker.generation} generation${maker.generation === 1 ? '' : 's'} in the craft, ${maker.yearsWorking} years working${maker.womenLed ? ', a women-led studio' : ''}.`,
    `Craft: ${craft.name} (${craft.hindi}) from ${craft.origin}. ${craft.tagline}.`,
    `Workshop: ${maker.workshop.title}. ${maker.workshop.blurb}`,
    ...faqFor(maker).map(f => `${f.q} ${f.a}`),
  ];
  return facts.map(f => `- ${f}`).join('\n');
}
