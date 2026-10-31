// Twelve Mewari dishes with what goes into one thali portion. A host's thali is six of them, picked for the month.
// Portions are raw-ingredient grams (dry flour, dal, ghee, fresh produce) for one guest; spices and salt are bought
// separately and left out, so every quantity here is something a partner farm can actually grow or make.
import { ingredient, type IngredientId } from './produce.ts';
import type { Diet } from './types.ts';

export type Slot = 'starter' | 'main' | 'sabzi' | 'side' | 'sweet';
export type Portion = { ingredient: IngredientId; grams: number };

/** An adaptation for a diet: ingredients swapped (null drops one) plus what the kitchen tells the guest */
export type Swap = { replace: Partial<Record<IngredientId, IngredientId | null>>; note: string };

export type Dish = {
  id: string;
  name: string;
  hindi: string;
  slot: Slot;
  /** Months it is cooked */
  months: number[];
  /** Months it is at its best, with the key ingredient fresh */
  peak: number[];
  /** One line on where it comes from. Folklore is called folklore. */
  story: string;
  /** What to do with the leftovers or trimmings of this dish */
  zeroWaste: string;
  serving: Portion[];
  /** Missing = fine as it is; a Swap = adaptable; 'no' = leave it out for these guests */
  jain?: Swap | 'no';
  vegan?: Swap | 'no';
};

const all = Array.from({ length: 12 }, (_, i) => i + 1);
const months = (...list: number[]) => list;
const p = (id: IngredientId, grams: number): Portion => ({ ingredient: id, grams });

const NO_ONION = 'Cooked with hing, no onion or garlic';
const OIL_FOR_GHEE: Swap['replace'] = { ghee: 'oil' };

export const DISHES: Dish[] = [
  {
    id: 'makki-ki-raab', name: 'Makki ki raab', hindi: 'मक्की की राब', slot: 'starter',
    months: months(10, 11, 12, 1, 2), peak: months(11, 12, 1),
    story: 'A warm porridge of maize and buttermilk that Mewar’s farmers sip on cold winter mornings.',
    zeroWaste: 'Stir leftover raab into tomorrow’s makki roti dough instead of water.',
    serving: [p('makki', 35), p('dahi', 110), p('green-chilli', 2)],
    jain: { replace: {}, note: NO_ONION },
    vegan: 'no',
  },
  {
    id: 'mirchi-vada', name: 'Mirchi vada', hindi: 'मिर्ची वड़ा', slot: 'starter',
    months: all, peak: months(8, 9, 10, 11, 12, 1, 2),
    story: 'Fat green chillies stuffed with spiced potato, dipped in besan and fried: Rajasthan’s crisp, fiery street snack.',
    zeroWaste: 'Crumble leftover mirchi vada into the stuffing for tomorrow’s paratha.',
    serving: [p('green-chilli', 55), p('potato', 60), p('besan', 28)],
    jain: { replace: { potato: 'paneer' }, note: 'Stuffed with spiced paneer instead of potato' },
  },
  {
    id: 'dal-baati-churma', name: 'Dal baati churma', hindi: 'दाल बाटी चूरमा', slot: 'main',
    months: all, peak: [],
    story: 'Mewar’s warrior meal: wheat baatis baked in embers, dunked in ghee, with five-lentil dal. Folklore credits Bappa Rawal’s army.',
    zeroWaste: 'Crush leftover baatis into tomorrow’s churma with a spoon of ghee and jaggery; nothing goes in the bin.',
    serving: [p('wheat', 85), p('dal', 35), p('ghee', 28), p('jaggery', 18), p('tomato', 25), p('garlic', 4)],
    jain: { replace: { garlic: null }, note: 'Dal tempered with hing and cumin, no garlic' },
    vegan: { replace: OIL_FOR_GHEE, note: 'Baati brushed with cold-pressed oil instead of ghee' },
  },
  {
    id: 'makki-roti-saag', name: 'Makki roti & winter saag', hindi: 'मक्की रोटी और साग', slot: 'sabzi',
    months: months(11, 12, 1, 2, 3), peak: months(11, 12, 1, 2),
    story: 'Griddle-baked maize rotis with slow-cooked winter greens: methi, palak and bathua from the kitchen gardens.',
    zeroWaste: 'Cook the methi and palak stalks into tomorrow’s dal rather than binning them.',
    serving: [p('makki', 70), p('greens', 140), p('ghee', 14), p('garlic', 5), p('green-chilli', 3)],
    jain: { replace: { garlic: null }, note: 'Greens tempered with hing, no garlic' },
    vegan: { replace: OIL_FOR_GHEE, note: 'Rotis and greens finished with oil instead of ghee' },
  },
  {
    id: 'kaddu-ki-sabzi', name: 'Kaddu ki sabzi', hindi: 'कद्दू की सब्ज़ी', slot: 'sabzi',
    months: months(8, 9, 10, 11, 12), peak: months(10, 11, 12),
    story: 'Sweet-and-sour pumpkin with a hint of jaggery, the humble hero of every North Indian feast.',
    zeroWaste: 'Wash and roast the kaddu seeds for a crunchy snack, and give the peel to the compost pit.',
    serving: [p('kaddu', 130), p('jaggery', 8), p('green-chilli', 3), p('ghee', 6)],
    vegan: { replace: OIL_FOR_GHEE, note: 'Made with oil instead of ghee' },
  },
  {
    id: 'tinda-masala', name: 'Tinda masala', hindi: 'टिंडा मसाला', slot: 'sabzi',
    months: months(4, 5, 6, 7, 8), peak: months(5, 6, 7),
    story: 'Tender apple gourd simmered in a tomato masala: the cooling summer sabzi of Rajasthan’s kitchen gardens.',
    zeroWaste: 'Tinda peel is tender: cook it into a quick chutney with tomato and chilli.',
    serving: [p('tinda', 130), p('tomato', 25), p('ghee', 8), p('green-chilli', 3)],
    jain: { replace: {}, note: NO_ONION },
    vegan: { replace: OIL_FOR_GHEE, note: 'Made with oil instead of ghee' },
  },
  {
    id: 'ker-sangri', name: 'Ker sangri', hindi: 'केर सांगरी', slot: 'sabzi',
    months: all, peak: months(3, 4, 5, 6),
    story: 'Desert berries and khejri pods, picked in spring and dried to last the year: scarcity turned into celebration.',
    zeroWaste: 'Fold leftover ker sangri into tomorrow’s stuffed parathas.',
    serving: [p('ker', 18), p('sangri', 22), p('dahi', 30), p('ghee', 10), p('green-chilli', 3)],
    jain: { replace: {}, note: NO_ONION },
    vegan: { replace: { dahi: null, ghee: 'oil' }, note: 'Cooked in oil with a tangy amchur finish instead of curd' },
  },
  {
    id: 'gatte-ki-sabzi', name: 'Gatte ki sabzi', hindi: 'गट्टे की सब्ज़ी', slot: 'sabzi',
    months: all, peak: months(5, 6, 7, 8),
    story: 'Besan dumplings simmered in spiced curd: a village dish for the days the kitchen garden gave nothing.',
    zeroWaste: 'Slice leftover gatte and shallow-fry them for a crisp tea-time snack.',
    serving: [p('besan', 55), p('dahi', 70), p('ghee', 12), p('green-chilli', 4)],
    jain: { replace: {}, note: NO_ONION },
    vegan: 'no',
  },
  {
    id: 'bajre-ki-roti', name: 'Bajre ki roti & lasun chutney', hindi: 'बाजरे की रोटी', slot: 'side',
    months: months(10, 11, 12, 1, 2), peak: months(12, 1, 2),
    story: 'Rustic bajra rotis smeared with ghee and eaten with fiery garlic chutney: the winter fuel of the hill farms.',
    zeroWaste: 'Crumble leftover bajra rotis into churi with ghee and jaggery for breakfast.',
    serving: [p('bajra', 65), p('ghee', 14), p('garlic', 8), p('green-chilli', 3)],
    jain: { replace: { garlic: 'kachri' }, note: 'Served with kachri chutney instead of garlic chutney' },
    vegan: { replace: OIL_FOR_GHEE, note: 'Rotis brushed with oil instead of ghee' },
  },
  {
    id: 'rajasthani-kadhi', name: 'Rajasthani kadhi', hindi: 'राजस्थानी कढ़ी', slot: 'side',
    months: all, peak: [],
    story: 'Tangy buttermilk-and-besan kadhi, thin and golden: the cooling answer to a fiery thali.',
    zeroWaste: 'Use curd that is a day from turning sour for tomorrow’s kadhi instead of throwing it out.',
    serving: [p('dahi', 100), p('besan', 22), p('ghee', 8), p('green-chilli', 3)],
    jain: { replace: {}, note: NO_ONION },
    vegan: 'no',
  },
  {
    id: 'kachri-chutney', name: 'Kachri-tamatar chutney', hindi: 'काचरी की चटनी', slot: 'side',
    months: all, peak: months(10, 11, 12, 1, 2, 3),
    story: 'Dried wild melon ground with tomato and chilli: a tart little chutney from the hill villages.',
    zeroWaste: 'Stir leftover chutney into tomorrow’s dal for a tangy finish.',
    serving: [p('kachri', 8), p('tomato', 45), p('green-chilli', 3), p('jaggery', 4)],
  },
  {
    id: 'lapsi', name: 'Lapsi', hindi: 'लापसी', slot: 'sweet',
    months: all, peak: [],
    story: 'Broken wheat roasted in ghee and jaggery: the sweet that blesses weddings and new beginnings in Mewar.',
    zeroWaste: 'Press leftover lapsi into small ladoos for the squad’s road snacks.',
    serving: [p('wheat', 55), p('ghee', 22), p('jaggery', 35)],
    vegan: { replace: OIL_FOR_GHEE, note: 'Roasted in cold-pressed oil instead of ghee' },
  },
];

export const DISH_BY_ID = new Map(DISHES.map(d => [d.id, d]));

export const SLOT_ORDER: Slot[] = ['starter', 'main', 'sabzi', 'sabzi', 'side', 'sweet'];

/** Dishes cooked in this month, seasonal ones first */
export function dishesIn(month: number): Dish[] {
  return DISHES.filter(d => d.months.includes(month));
}

/**
 * The six dishes of a month's thali: a starter, the main, two sabzis, a side and a sweet. In each slot the dish at its
 * seasonal best wins; on a tie the earlier one in DISHES does (seasonal dishes are listed before the pantry classics).
 */
export function thaliFor(month: number): Dish[] {
  const taken = new Set<string>();
  const picks: Dish[] = [];
  for (const slot of SLOT_ORDER) {
    const best = dishesIn(month)
      .filter(d => d.slot === slot && !taken.has(d.id))
      .sort((a, b) => Number(b.peak.includes(month)) - Number(a.peak.includes(month)))[0];
    if (!best) continue;
    taken.add(best.id);
    picks.push(best);
  }
  return picks;
}

/** The dish each month is known for, always one that is at its peak that month */
const SPECIAL_BY_MONTH: Record<number, string> = {
  1: 'makki-ki-raab', 2: 'makki-roti-saag', 3: 'ker-sangri', 4: 'ker-sangri', 5: 'ker-sangri', 6: 'tinda-masala',
  7: 'tinda-masala', 8: 'mirchi-vada', 9: 'mirchi-vada', 10: 'kaddu-ki-sabzi', 11: 'makki-ki-raab', 12: 'makki-roti-saag',
};

/** The dish to feature this month, e.g. makki ki raab in November */
export function specialFor(month: number): Dish {
  return DISH_BY_ID.get(SPECIAL_BY_MONTH[month] ?? '') ?? DISH_BY_ID.get('dal-baati-churma')!;
}

export type Resolved = { ok: true; serving: Portion[]; note: string | null } | { ok: false };

/** What a guest on this diet gets from the dish: its portion with swaps applied, or nothing if it can't be adapted */
export function resolve(dish: Dish, diet: Diet): Resolved {
  if (diet === 'veg') return { ok: true, serving: dish.serving, note: null };
  const swap = dish[diet];
  if (swap === 'no') return { ok: false };
  const suits = (id: IngredientId) => ingredient(id)[diet];
  if (!swap) return dish.serving.every(s => suits(s.ingredient)) ? { ok: true, serving: dish.serving, note: null } : { ok: false };
  const serving: Portion[] = [];
  for (const s of dish.serving) {
    const to = s.ingredient in swap.replace ? swap.replace[s.ingredient] : s.ingredient;
    if (to) serving.push({ ingredient: to, grams: s.grams });
  }
  // A swap must leave nothing the diet can't eat
  if (!serving.every(s => suits(s.ingredient))) return { ok: false };
  return { ok: true, serving, note: swap.note };
}

export const servingKg = (serving: Portion[]) => serving.reduce((sum, s) => sum + s.grams, 0) / 1000;
