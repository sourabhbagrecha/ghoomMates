// The destination inventory: one hand-researched guide per city or region, with the sights, experiences, hidden gems,
// food, culture and day trips GhoomMates can suggest. Each guide lives in src/places/cities/<id>.ts and is registered
// in src/places/index.ts. tests/places/places.test.ts checks every guide against the rules written on each field.
import type { Vibe } from '../voice/experiences.ts';

/** What kind of thing an item is. One per item; pick the one a traveller would search for. */
export const ITEM_KINDS = [
  'sight',       // a monument, fort, palace, temple, museum or landmark you go and see
  'experience',  // something you do with a guide or operator: a walk, a boat ride, a safari, a show
  'workshop',    // a hands-on craft or cooking class
  'food',        // a specific eatery, street, market stall or dish trail
  'nature',      // a lake, waterfall, viewpoint, meadow, beach or park
  'adventure',   // a trek, a ride, a paddle, a dive: physical effort is the point
  'wellness',    // yoga, ayurveda, meditation, a hot spring
  'spiritual',   // an aarti, a monastery prayer, a pilgrimage walk (living worship, not just the building)
  'nightlife',   // bars, live music, night markets, evening shows
  'shopping',    // a bazaar, a craft cluster, a co-op where you buy direct from makers
  'day-trip',    // a place more than an hour away worth a full or half day
  'neighbourhood', // a quarter, village or street worth wandering, or a good base to stay
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** Who an item suits. List every one that genuinely fits. */
export const TRAVELLERS = ['solo', 'couples', 'friends', 'families', 'kids', 'seniors', 'budget', 'luxury', 'photographers', 'foodies', 'history-buffs', 'adventurers', 'spiritual'] as const;
export type Traveller = (typeof TRAVELLERS)[number];

/** How hard it is on the body */
export const EFFORTS = ['easy', 'moderate', 'hard'] as const;
export type Effort = (typeof EFFORTS)[number];

/** When in the day it is best */
export const TIMES_OF_DAY = ['sunrise', 'morning', 'midday', 'afternoon', 'sunset', 'evening', 'night', 'any'] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

/** 1 = January … 12 = December */
export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type PlaceItem = {
  /** Globally unique kebab-case id, prefixed with the guide id: "hampi-vittala-temple" */
  id: string;
  /** Proper name as signboards and maps show it: "Vittala Temple" */
  name: string;
  kind: ItemKind;
  /** Lesser-known, uncrowded or locals-only. Roughly a quarter to a third of a guide's items. */
  gem: boolean;
  /** Neighbourhood, village or landmark it sits in: "Hampi Bazaar", "12 km from Leh" */
  area: string;
  /** WGS84 from OpenStreetMap/Google Maps, 4 decimals. Must be within 250 km of the guide's centre. */
  lat: number;
  lng: number;
  /** How strongly it speaks to each of the six quiz axes, 0–1 in steps of 0.1. At least one axis ≥ 0.6. */
  vibe: Partial<Vibe>;
  /** Who it suits, at least one */
  goodFor: Traveller[];
  effort: Effort;
  /** Best time of day to be there */
  bestTime: TimeOfDay;
  /** Opening hours as people would say them ("6 AM–6 PM, closed Fri"), or "Open all day" */
  hours: string;
  /** Typical time spent, in hours (0.5–14) */
  durationHours: number;
  /** Rough cost per person in rupees for an Indian traveller: entry, ticket, meal or activity. 0 when free. */
  costRupees: number;
  /** Months it is open or worth it, when not all year (e.g. a pass that shuts in winter). Omit for all year. */
  months?: Month[];
  /** One vivid line GhoomMate can pitch it with (≤ 160 characters) */
  pitch: string;
  /** One line of history, legend or cultural meaning (≤ 220 characters). Required for sight, spiritual and day-trip. */
  story?: string;
  /** One practical insider tip: timing, what to order, where to enter, what to avoid (≤ 200 characters) */
  tip: string;
  /** How to visit lightly and respectfully: dress, waste, wildlife, local economy (≤ 160 characters). Optional. */
  care?: string;
};

/** A dish or drink the place is known for */
export type Dish = { name: string; what: string; where?: string; veg: boolean };

/** A festival or seasonal event worth planning around */
export type Festival = { name: string; months: Month[]; what: string };

export type CityGuide = {
  /** kebab-case, matches the file name: "leh-ladakh" */
  id: string;
  /** Display name: "Leh-Ladakh" */
  name: string;
  /** State or union territory */
  state: string;
  /** Lower-case strings that, found in a trip's destination, mean this guide ("leh", "ladakh", "nubra") */
  aliases: string[];
  /** Centre point for distance checks and maps */
  lat: number;
  lng: number;
  /** How far from the centre items may be, in km. Defaults to 250; set it only for spread-out regions. */
  radiusKm?: number;
  /** One-paragraph summary of what the place is like and who loves it (≤ 400 characters) */
  summary: string;
  /** Best months to go */
  bestMonths: Month[];
  /** Months to avoid and why, in one line */
  avoid: string;
  /** Mid-range daily spend per person in rupees, [low, high] */
  budgetPerDayRupees: [number, number];
  /** Ideal trip length in days, [min, max] */
  idealDays: [number, number];
  /** How to get there: nearest airport and railhead with distances, and road notes (≤ 300 characters) */
  gettingThere: string;
  /** How to get around once there, with typical fares (≤ 300 characters) */
  gettingAround: string;
  /** Neighbourhoods or villages to stay in and who each suits (≤ 300 characters) */
  whereToStay: string;
  /** Permits, altitude, connectivity, cash, safety and similar must-knows */
  practical: string[];
  /** Local customs and how to be a good guest */
  etiquette: string[];
  /** Signature dishes and drinks, at least 6 */
  dishes: Dish[];
  /** Festivals and seasonal events, at least 3 */
  festivals: Festival[];
  /** The things to see and do, 35–60 */
  items: PlaceItem[];
  /** Where the facts came from: site names or URLs, at least 3 */
  sources: string[];
};
