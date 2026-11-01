// Mewar's farm calendar and the ingredients a Mewari thali is cooked from.
// Seasons follow the Udaipur-region cropping pattern: kharif maize and bajra sown with the monsoon and harvested in
// Sep–Oct, rabi wheat, gram and winter greens sown in Oct–Nov and cut in Feb–Apr, ker and sangri picked in the dry
// spring and sun-dried for the year. See backend/docs/hospitality.md for sources.

export const INGREDIENT_IDS = [
  'wheat', 'makki', 'bajra', 'besan', 'dal', 'groundnut', 'jaggery',
  'ghee', 'dahi', 'paneer',
  'tomato', 'onion', 'garlic', 'potato', 'green-chilli', 'greens', 'tinda', 'kaddu',
  'ker', 'sangri', 'kachri', 'oil',
] as const;
export type IngredientId = (typeof INGREDIENT_IDS)[number];

export type IngredientGroup = 'grain' | 'pulse' | 'dairy' | 'vegetable' | 'greens' | 'wild' | 'sweetener' | 'pantry';

export type Ingredient = {
  id: IngredientId;
  name: string;
  hindi: string;
  group: IngredientGroup;
  /** Months (1–12) when it comes fresh off the fields around Udaipur; empty for things made every day (dairy) */
  peak: number[];
  /** Keeps after harvest (grain, dried pods, ghee), so any month's menu can use it from a partner farm */
  storable: boolean;
  /** Fine in a Jain kitchen: no onion, garlic or root vegetables */
  jain: boolean;
  /** No milk, ghee, curd or paneer */
  vegan: boolean;
};

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
/** Months wrapping the year end, e.g. wrap(11, 3) = Nov, Dec, Jan, Feb, Mar */
const wrap = (from: number, to: number) => (from <= to ? range(from, to) : [...range(from, 12), ...range(1, to)]);

export const INGREDIENTS: Ingredient[] = [
  { id: 'wheat', name: 'Wheat flour (atta)', hindi: 'गेहूँ', group: 'grain', peak: range(3, 5), storable: true, jain: true, vegan: true },
  { id: 'makki', name: 'Makki (maize flour)', hindi: 'मक्की', group: 'grain', peak: range(9, 11), storable: true, jain: true, vegan: true },
  { id: 'bajra', name: 'Bajra (pearl millet)', hindi: 'बाजरा', group: 'grain', peak: range(9, 11), storable: true, jain: true, vegan: true },
  { id: 'besan', name: 'Besan (gram flour)', hindi: 'बेसन', group: 'pulse', peak: range(3, 4), storable: true, jain: true, vegan: true },
  { id: 'dal', name: 'Dal (mixed lentils)', hindi: 'दाल', group: 'pulse', peak: range(10, 12), storable: true, jain: true, vegan: true },
  { id: 'groundnut', name: 'Groundnut', hindi: 'मूँगफली', group: 'pulse', peak: range(10, 11), storable: true, jain: true, vegan: true },
  { id: 'jaggery', name: 'Jaggery (gur)', hindi: 'गुड़', group: 'sweetener', peak: wrap(11, 3), storable: true, jain: true, vegan: true },
  { id: 'ghee', name: 'Ghee', hindi: 'घी', group: 'dairy', peak: [], storable: true, jain: true, vegan: false },
  { id: 'dahi', name: 'Dahi (curd and buttermilk)', hindi: 'दही', group: 'dairy', peak: [], storable: false, jain: true, vegan: false },
  { id: 'paneer', name: 'Paneer', hindi: 'पनीर', group: 'dairy', peak: [], storable: false, jain: true, vegan: false },
  { id: 'tomato', name: 'Tomato', hindi: 'टमाटर', group: 'vegetable', peak: wrap(10, 3), storable: false, jain: true, vegan: true },
  { id: 'onion', name: 'Onion', hindi: 'प्याज़', group: 'vegetable', peak: range(3, 5), storable: true, jain: false, vegan: true },
  { id: 'garlic', name: 'Garlic', hindi: 'लहसुन', group: 'vegetable', peak: range(2, 4), storable: true, jain: false, vegan: true },
  { id: 'potato', name: 'Potato', hindi: 'आलू', group: 'vegetable', peak: range(2, 3), storable: true, jain: false, vegan: true },
  { id: 'green-chilli', name: 'Green chilli', hindi: 'हरी मिर्च', group: 'vegetable', peak: wrap(7, 2), storable: false, jain: true, vegan: true },
  { id: 'greens', name: 'Seasonal greens', hindi: 'साग', group: 'greens', peak: [...range(7, 10), ...wrap(11, 3)], storable: false, jain: true, vegan: true },
  { id: 'tinda', name: 'Tinda (apple gourd)', hindi: 'टिंडा', group: 'vegetable', peak: range(4, 8), storable: false, jain: true, vegan: true },
  { id: 'kaddu', name: 'Kaddu (pumpkin)', hindi: 'कद्दू', group: 'vegetable', peak: range(8, 12), storable: false, jain: true, vegan: true },
  { id: 'ker', name: 'Ker (dried berries)', hindi: 'केर', group: 'wild', peak: range(3, 5), storable: true, jain: true, vegan: true },
  { id: 'sangri', name: 'Sangri (dried khejri pods)', hindi: 'सांगरी', group: 'wild', peak: range(4, 5), storable: true, jain: true, vegan: true },
  { id: 'kachri', name: 'Kachri (dried wild melon)', hindi: 'काचरी', group: 'wild', peak: range(9, 10), storable: true, jain: true, vegan: true },
  { id: 'oil', name: 'Cold-pressed oil', hindi: 'तेल', group: 'pantry', peak: [], storable: true, jain: true, vegan: true },
];

export const INGREDIENT_BY_ID = new Map(INGREDIENTS.map(i => [i.id, i]));

export const ingredient = (id: IngredientId): Ingredient => INGREDIENT_BY_ID.get(id)!;

/** Which greens are on the fields: winter saag, monsoon leaves, or nothing in the summer heat */
export function greensName(month: number): string {
  if (month >= 11 || month <= 3) return 'Methi, palak & bathua';
  if (month >= 7 && month <= 10) return 'Chaulai & lal saag';
  return 'Seasonal greens';
}

/** The ingredient's name for a month (greens change with the season) */
export function ingredientName(id: IngredientId, month: number): string {
  return id === 'greens' ? greensName(month) : ingredient(id).name;
}

/** Fresh off the fields this month: a partner farm can deliver it picked, not stored. Dairy is delivered daily. */
export function isFresh(id: IngredientId, month: number): boolean {
  const item = ingredient(id);
  return item.group === 'dairy' || item.peak.includes(month);
}

/** A farm can supply it this month: it's in season, or it's a stored harvest (grain, dried pods, ghee) */
export function isAvailable(id: IngredientId, month: number): boolean {
  const item = ingredient(id);
  return item.group !== 'pantry' && (item.storable || item.group === 'dairy' || item.peak.includes(month));
}

/** Spoils within days, so ordering it fresh to a forecast matters (fresh vegetables, greens, curd, paneer) */
export const isPerishable = (id: IngredientId): boolean => !ingredient(id).storable && ingredient(id).group !== 'pantry';

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export type MonthNote = {
  /** Short name of the season, shown on cards */
  season: string;
  /** Name of the month's thali */
  thali: string;
  /** What's happening on the farms */
  note: string;
};

export const MONTH_NOTES: Record<number, MonthNote> = {
  1: { season: 'Winter saag season', thali: 'Winter saag thali', note: 'Methi, palak and bathua are at their sweetest; makki and bajra rotis with ghee are the staple, and the new gur is in.' },
  2: { season: 'Mustard and greens', thali: 'Mustard-fields thali', note: 'Mustard flowers colour the fields; winter greens, peas and tomatoes are in full flow.' },
  3: { season: 'Wheat and gram ripen', thali: 'First-ker thali', note: 'The rabi harvest begins, and the first ker berries are picked in the dry hills.' },
  4: { season: 'Ker-sangri picking', thali: 'Ker-sangri thali', note: 'Wheat is cut; ker berries and green sangri pods are picked and sun-dried to last the year.' },
  5: { season: 'Summer gourds', thali: 'Summer gourd thali', note: 'Tinda from the kitchen gardens, dried ker-sangri from the hills, and thin chaas to beat the heat.' },
  6: { season: 'Waiting for the rains', thali: 'Pre-monsoon pantry thali', note: 'Stored grain, dairy and dried ker-sangri do the cooking until the monsoon breaks.' },
  7: { season: 'Monsoon sowing', thali: 'Monsoon-sowing thali', note: 'Makki and bajra go into the wet fields; green chillies, tinda and chaulai leaves come in.' },
  8: { season: 'Monsoon greens', thali: 'Monsoon green thali', note: 'Rain-fed fields turn green; first kaddu, tinda and lal saag, with crisp mirchi vada weather.' },
  9: { season: 'Kharif ripens', thali: 'Harvest-eve thali', note: 'Bajra and makki ripen; kachri is picked and dried for the year.' },
  10: { season: 'Kharif harvest', thali: 'Kharif harvest thali', note: 'New makki, bajra, groundnut and pulses come in; kaddu is at its sweetest and rabi sowing begins.' },
  11: { season: 'Makki season', thali: 'Makki season thali', note: 'New-crop makki and bajra, the first winter greens and tomatoes, and warm makki ki raab in the mornings.' },
  12: { season: 'Winter saag season', thali: 'Saag and kaddu thali', note: 'Methi, palak and bathua at their best, fresh gur, and kaddu in every kitchen.' },
};
