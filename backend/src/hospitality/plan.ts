// Demand forecast, procurement list, food miles and waste estimate for a host kitchen. Pure functions, no I/O:
// the API, the tests and the Gemini menu all share them.
//
// The model, in one paragraph: covers per meal are the squad bookings (real) plus a modelled walk-in baseline that
// follows the weekday, season and festivals. The month's six-dish thali turns covers into kilos of ingredients, each
// assigned to the nearest partner farm that grows it in season (else the wholesale market). Food miles compare that
// to buying everything wholesale; waste avoided compares cooking to a known head-count with an open buffet.
import { dayFactor } from '../heritage/crowd.ts';
import { resolve, thaliFor, type Dish } from './dishes.ts';
import { FARM_BY_ID, roadKm, type Farm, type Host } from './partners.ts';
import { ingredient, ingredientName, isAvailable, isFresh, isPerishable, type IngredientId } from './produce.ts';
import { addMix, DIETS, emptyMix, MEALS, mixTotal, splitMix, type Diet, type DietMix, type Meal } from './types.ts';

/* Assumptions: every number below is an estimate, documented with sources in backend/docs/hospitality.md */

/** Average distance produce travels to reach an Udaipur kitchen through the mandi chain (onions from Maharashtra, potatoes from UP and Punjab, greens and tomatoes from Gujarat and MP). Not measured. */
export const WHOLESALE_KM = 250;
/** kg CO₂e per tonne-km for general road freight (GLEC Framework default) */
export const CO2E_PER_TONNE_KM = 0.08;
/** Share of prepared food left over when a kitchen cooks for an unknown crowd (open buffet) */
export const OPEN_BUFFET_SURPLUS = 0.22;
/** Share left over when it cooks to a known head-count with a small safety margin */
export const BOOKED_SURPLUS = 0.06;
/** Share of perishable produce that spoils when bought in bulk from the wholesale market */
export const BULK_SPOILAGE = 0.06;
/** …and when ordered twice a week from nearby farms against a forecast */
export const FORECAST_SPOILAGE = 0.02;
/** Walk-in guests' diets; squads' own diets are counted from their bookings */
export const WALK_IN_SHARES: DietMix = { veg: 0.9, jain: 0.07, vegan: 0.03 };

/* Dates: everything is the date in India (IST, UTC+5:30) */

const DAY_MS = 86_400_000;
export const istDate = (now = new Date()) => new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
export const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
export const monthOf = (date: string) => Number(date.slice(5, 7));
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
/** "Mon, 2 Nov" */
export const dateLabel = (date: string) => `${weekdayOf(date)}, ${Number(date.slice(8))} ${MONTHS[monthOf(date) - 1]}`;

/* Demand */

export type Booking = {
  id: string;
  hostId: string;
  tripId: string;
  /** The squad's name, e.g. "Goa Gang" */
  group: string;
  date: string;
  meal: Meal;
  /** "08:00 PM" */
  time: string;
  headcount: number;
  dietary: DietMix;
  note: string;
};

/** Whole numbers that add up to the headcount: Jain and vegan as given (capped), everyone else vegetarian */
export function normaliseMix(input: Partial<DietMix> | null | undefined, headcount: number): DietMix {
  const whole = (n: unknown) => Math.max(0, Math.floor(Number(n) || 0));
  const jain = Math.min(whole(input?.jain), headcount);
  const vegan = Math.min(whole(input?.vegan), headcount - jain);
  return { veg: headcount - jain - vegan, jain, vegan };
}

/** Small steady wobble per host, day and meal so the baseline looks like a real week, not a flat line */
function wobble(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return 0.92 + ((h >>> 0) % 17) / 100;
}

/** Modelled walk-in covers for one meal: the host's weekday baseline × weekend, season and festival factors */
export function walkInBaseline(host: Host, date: string, meal: Meal): number {
  if (!host.meals.includes(meal)) return 0;
  return Math.round(host.walkIns[meal] * dayFactor(date).factor * wobble(`${host.id}:${date}:${meal}`));
}

export type MealForecast = { booked: number; walkIn: number; covers: number; bookings: Booking[] };

export type DayForecast = {
  date: string;
  weekday: string;
  /** "Mon, 2 Nov" */
  label: string;
  month: number;
  /** "weekend", "Diwali"… when the baseline is lifted or dimmed */
  dayNote: string | null;
  meals: Record<Meal, MealForecast>;
  booked: number;
  walkIn: number;
  covers: number;
  diets: { booked: DietMix; walkIn: DietMix; total: DietMix };
};

export function forecastDay(host: Host, date: string, bookings: Booking[]): DayForecast {
  const meals = {} as Record<Meal, MealForecast>;
  for (const meal of MEALS) {
    const mine = bookings.filter(b => b.date === date && b.meal === meal);
    const booked = mine.reduce((sum, b) => sum + b.headcount, 0);
    // Walk-ins only fill the seats the squads left
    const walkIn = Math.max(0, Math.min(walkInBaseline(host, date, meal), host.capacity - booked));
    meals[meal] = { booked, walkIn, covers: booked + walkIn, bookings: mine };
  }
  const booked = MEALS.reduce((sum, m) => sum + meals[m].booked, 0);
  const walkIn = MEALS.reduce((sum, m) => sum + meals[m].walkIn, 0);
  const bookedDiets = bookings.filter(b => b.date === date).reduce((mix, b) => addMix(mix, normaliseMix(b.dietary, b.headcount)), emptyMix());
  const walkInDiets = splitMix(walkIn, WALK_IN_SHARES);
  const note = dayFactor(date);
  return {
    date, weekday: weekdayOf(date), label: dateLabel(date), month: monthOf(date), dayNote: note.reason,
    meals, booked, walkIn, covers: booked + walkIn,
    diets: { booked: bookedDiets, walkIn: walkInDiets, total: addMix(bookedDiets, walkInDiets) },
  };
}

export function forecastDays(host: Host, from: string, days: number, bookings: Booking[]): DayForecast[] {
  return Array.from({ length: days }, (_, i) => forecastDay(host, addDays(from, i), bookings));
}

/* Ingredients */

/** Kilos of each ingredient to cook these dishes for a mix of guests; a dish that can't be adapted for a diet skips those guests */
export function dishNeeds(dishes: Dish[], mix: DietMix): Map<IngredientId, number> {
  const kg = new Map<IngredientId, number>();
  for (const dish of dishes) {
    for (const diet of DIETS) {
      const guests = mix[diet];
      const served = guests > 0 ? resolve(dish, diet) : null;
      if (!served?.ok) continue;
      for (const portion of served.serving) kg.set(portion.ingredient, (kg.get(portion.ingredient) ?? 0) + guests * portion.grams / 1000);
    }
  }
  return kg;
}

/** Which partner farm supplies an ingredient in a month: the nearest of the host's farms that grows it, else null */
export function supplierFor(host: Host, id: IngredientId, month: number): { farm: Farm; km: number } | null {
  if (!isAvailable(id, month)) return null;
  let best: { farm: Farm; km: number } | null = null;
  for (const farmId of host.farmIds) {
    const farm = FARM_BY_ID.get(farmId);
    if (!farm?.produce.includes(id)) continue;
    const km = roadKm(host, farm);
    if (!best || km < best.km || (km === best.km && farm.organic && !best.farm.organic)) best = { farm, km };
  }
  return best;
}

export type PlanItem = {
  ingredientId: IngredientId;
  name: string;
  kg: number;
  /** The part of kg that squad bookings account for */
  squadKg: number;
  /** What to ask for: kg rounded up to the next half kilo */
  orderKg: number;
  /** Picked this month (as opposed to a stored harvest like flour or dried pods) */
  fresh: boolean;
  /** For market items: why a farm isn't supplying it */
  reason?: 'out-of-season' | 'no-partner' | 'pantry';
};

export type FarmOrder = {
  farmId: string;
  name: string;
  village: string;
  organic: boolean;
  /** Estimated road km to this kitchen */
  km: number;
  items: PlanItem[];
  totalKg: number;
};

export type Procurement = {
  covers: number;
  farms: FarmOrder[];
  market: PlanItem[];
  totalKg: number;
  localKg: number;
  /** By weight, 0–1 */
  localShare: number;
  /** Kilos of perishable produce ordered from farms, which an order-to-forecast cuts spoilage on */
  perishableLocalKg: number;
  /** Kilos of ingredients cooked for squad bookings */
  squadKg: number;
};

type Need = { id: IngredientId; month: number; kg: number; squadKg: number; farm: Farm | null; km: number };

/** One decimal place, and never -0 */
const round1 = (n: number) => Math.round(n * 10) / 10 || 0;
export const orderKgFor = (kg: number) => Math.max(0.5, Math.ceil(kg * 2 - 1e-9) / 2);

/** The shopping list for days of covers: kilos per ingredient, grouped by the partner farm that supplies it */
export function buildProcurement(host: Host, days: { month: number; total: DietMix; booked: DietMix }[]): Procurement {
  const needs = new Map<string, Need>();
  let covers = 0;
  for (const day of days) {
    covers += mixTotal(day.total);
    const thali = thaliFor(day.month);
    const all = dishNeeds(thali, day.total);
    const squad = dishNeeds(thali, day.booked);
    for (const [id, kg] of all) {
      const supplier = supplierFor(host, id, day.month);
      const key = `${id}|${supplier?.farm.id ?? 'market'}`;
      const entry = needs.get(key) ?? { id, month: day.month, kg: 0, squadKg: 0, farm: supplier?.farm ?? null, km: supplier?.km ?? 0 };
      entry.kg += kg;
      entry.squadKg += squad.get(id) ?? 0;
      needs.set(key, entry);
    }
  }

  const item = (n: Need, reason?: PlanItem['reason']): PlanItem => ({
    ingredientId: n.id, name: ingredientName(n.id, n.month), kg: round1(n.kg), squadKg: round1(n.squadKg), orderKg: orderKgFor(n.kg),
    fresh: isFresh(n.id, n.month), ...(reason ? { reason } : {}),
  });
  const farms = new Map<string, FarmOrder>();
  const market: PlanItem[] = [];
  for (const n of needs.values()) {
    if (n.farm) {
      const order = farms.get(n.farm.id) ?? { farmId: n.farm.id, name: n.farm.name, village: n.farm.village, organic: n.farm.organic, km: n.km, items: [], totalKg: 0 };
      order.items.push(item(n));
      order.totalKg += n.kg;
      farms.set(n.farm.id, order);
    } else {
      const reason = ingredient(n.id).group === 'pantry' ? 'pantry'
        : host.farmIds.some(id => FARM_BY_ID.get(id)?.produce.includes(n.id)) ? 'out-of-season' : 'no-partner';
      market.push(item(n, reason));
    }
  }
  const orders = [...farms.values()].map(o => ({ ...o, totalKg: round1(o.totalKg), items: o.items.sort((a, b) => b.kg - a.kg) })).sort((a, b) => a.km - b.km);
  const localKg = [...needs.values()].filter(n => n.farm).reduce((sum, n) => sum + n.kg, 0);
  const totalKg = [...needs.values()].reduce((sum, n) => sum + n.kg, 0);
  return {
    covers,
    farms: orders,
    market: market.sort((a, b) => b.kg - a.kg),
    totalKg: round1(totalKg),
    localKg: round1(localKg),
    localShare: totalKg ? localKg / totalKg : 0,
    perishableLocalKg: [...needs.values()].filter(n => n.farm && isPerishable(n.id)).reduce((sum, n) => sum + n.kg, 0),
    squadKg: [...needs.values()].reduce((sum, n) => sum + n.squadKg, 0),
  };
}

/** The shopping list for 100 ordinary covers in a month: what a host's sourcing looks like before any squad books */
export function typicalPlan(host: Host, month: number): Procurement {
  return buildProcurement(host, [{ month, total: splitMix(100, WALK_IN_SHARES), booked: emptyMix() }]);
}

/* Food miles */

export type FoodMiles = {
  /** Average km a kilo travels with the farm-direct plan */
  avgKm: number;
  /** Average km a kilo travels when everything comes through the wholesale market */
  baselineKm: number;
  /** Percent fewer food miles than the all-wholesale baseline */
  savedPercent: number;
  /** Tonne-km saved */
  savedTonneKm: number;
  co2eSavedKg: number;
};

export function foodMiles(plan: Procurement): FoodMiles {
  const farmKgKm = plan.farms.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.kg * o.km, 0), 0);
  const marketKgKm = plan.market.reduce((sum, i) => sum + i.kg * WHOLESALE_KM, 0);
  const kgKm = farmKgKm + marketKgKm;
  const kg = plan.farms.reduce((s, o) => s + o.items.reduce((t, i) => t + i.kg, 0), 0) + plan.market.reduce((s, i) => s + i.kg, 0);
  const avgKm = kg ? kgKm / kg : 0;
  const baselineKgKm = kg * WHOLESALE_KM;
  const savedTonneKm = (baselineKgKm - kgKm) / 1000;
  return {
    avgKm: Math.round(avgKm),
    baselineKm: WHOLESALE_KM,
    savedPercent: baselineKgKm ? Math.round((1 - kgKm / baselineKgKm) * 100) || 0 : 0,
    savedTonneKm: round1(savedTonneKm),
    co2eSavedKg: Math.max(0, Math.round(savedTonneKm * CO2E_PER_TONNE_KM * 10) / 10),
  };
}

/* Waste */

export type WasteEstimate = {
  bookedCovers: number;
  /** Food waste avoided by cooking squad bookings to their head-count instead of an open buffet, kg */
  overproductionKg: number;
  /** Spoilage avoided by ordering produce to the forecast from nearby farms, kg */
  spoilageKg: number;
  avoidedKg: number;
  /** For the host's notes: kg avoided per squad cover booked ahead */
  kgPerBookedCover: number;
};

/** Kilos of ingredients in one vegetarian thali of a month, for scale */
export function thaliKg(month: number): number {
  return [...dishNeeds(thaliFor(month), { veg: 1, jain: 0, vegan: 0 }).values()].reduce((sum, kg) => sum + kg, 0);
}

export function wasteAvoided(plan: Procurement, bookedCovers: number, month: number): WasteEstimate {
  const overproductionKg = round1(plan.squadKg * (OPEN_BUFFET_SURPLUS - BOOKED_SURPLUS));
  const spoilageKg = round1(plan.perishableLocalKg * (BULK_SPOILAGE - FORECAST_SPOILAGE));
  return {
    bookedCovers,
    overproductionKg,
    spoilageKg,
    // The parts are rounded first so the dashboard's numbers add up on screen
    avoidedKg: round1(overproductionKg + spoilageKg),
    kgPerBookedCover: Math.round((bookedCovers ? plan.squadKg / bookedCovers : thaliKg(month)) * (OPEN_BUFFET_SURPLUS - BOOKED_SURPLUS) * 1000) / 1000,
  };
}

/* Orders */

/** The WhatsApp message for one farm's order. We only build the link: nothing is sent from here. */
export function orderMessage(host: Host, order: FarmOrder, range: { from: string; to: string }, covers: number, squadCovers: number): string {
  const lines = order.items.map(i => `• ${i.name}: ${i.orderKg} kg`);
  return [
    `Namaste ${order.name}!`,
    `This is ${host.name}, ${host.area}, Udaipur.`,
    `We'd like to order for ${dateLabel(range.from)} to ${dateLabel(range.to)}, delivered by 7 AM on ${dateLabel(range.from)}:`,
    ...lines,
    `Planned covers: ${covers}${squadCovers ? `, including ${squadCovers} from squads booked on GhoomMates` : ''}.`,
    'Please confirm the quantities and rate. Dhanyavaad!',
  ].join('\n');
}

export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
