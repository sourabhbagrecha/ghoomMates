// The menu a host cooks on a day: the month's curated thali, or one Gemini composes from the same dishes.
// Gemini only chooses dishes (from an enum of real ids) and writes the stories and the zero-waste tip. Every quantity,
// farm and distance comes from our own data, so a made-up ingredient or farm can never reach the screen.
import { GeminiError, type Gemini } from '../gemini.ts';
import { logger } from '../logger.ts';
import { DISH_BY_ID, dishesIn, resolve, SLOT_ORDER, specialFor, thaliFor, type Dish, type Slot } from './dishes.ts';
import { dishNeeds, supplierFor } from './plan.ts';
import type { Host } from './partners.ts';
import { ingredientName, MONTH_NAMES, MONTH_NOTES, type IngredientId } from './produce.ts';
import { DIETS, mixTotal, type Diet, type DietMix } from './types.ts';

export type MenuIngredient = {
  ingredientId: IngredientId;
  name: string;
  gramsPerServing: number;
  /** Kilos for the covers this menu was made for */
  kg: number;
  /** The partner farm that supplies it this month; null when it comes from the market */
  farm: { id: string; name: string; village: string; km: number; organic: boolean } | null;
};

export type MenuDish = {
  id: string;
  name: string;
  hindi: string;
  slot: Slot;
  /** At its seasonal best this month */
  peak: boolean;
  story: string;
  ingredients: MenuIngredient[];
  /** What the kitchen does for the Jain or vegan guests in this mix */
  dietNotes: string[];
};

export type Menu = {
  source: 'gemini' | 'curated';
  /** The Gemini model that wrote it; null for the curated menu */
  model: string | null;
  hostId: string;
  date: string;
  month: number;
  season: string;
  covers: number;
  dietary: DietMix;
  title: string;
  intro: string;
  dishes: MenuDish[];
  zeroWasteTip: string;
  /** Kilos of ingredients for the covers, and the share that comes from partner farms */
  totalKg: number;
  localShare: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Dish → what goes in it, who grows it, and what the diet notes say, for these covers */
export function menuDish(host: Host, dish: Dish, month: number, mix: DietMix, story = dish.story): MenuDish {
  const kg = dishNeeds([dish], mix);
  const ingredients = dish.serving.map((portion): MenuIngredient => {
    const supplier = supplierFor(host, portion.ingredient, month);
    return {
      ingredientId: portion.ingredient,
      name: ingredientName(portion.ingredient, month),
      gramsPerServing: portion.grams,
      kg: round1(kg.get(portion.ingredient) ?? 0),
      farm: supplier && { id: supplier.farm.id, name: supplier.farm.name, village: supplier.farm.village, km: supplier.km, organic: supplier.farm.organic },
    };
  });
  const dietNotes = DIETS.filter((d): d is Exclude<Diet, 'veg'> => d !== 'veg' && mix[d] > 0).map(diet => {
    const served = resolve(dish, diet);
    const who = `${diet === 'jain' ? 'Jain' : 'Vegan'} (${mix[diet]})`;
    if (!served.ok) return `${who}: not adapted, serve an extra sabzi`;
    return served.note ? `${who}: ${served.note}` : `${who}: fine as it is`;
  });
  return { id: dish.id, name: dish.name, hindi: dish.hindi, slot: dish.slot, peak: dish.peak.includes(month), story, ingredients, dietNotes };
}

function assemble(host: Host, args: { source: Menu['source']; model?: string; date: string; month: number; covers: number; mix: DietMix; dishes: Dish[]; stories?: Map<string, string>; title: string; intro: string; tip: string }): Menu {
  const { month, mix, dishes } = args;
  const all = dishNeeds(dishes, mix);
  let totalKg = 0;
  let localKg = 0;
  for (const [id, kg] of all) {
    totalKg += kg;
    if (supplierFor(host, id, month)) localKg += kg;
  }
  return {
    source: args.source, model: args.model ?? null, hostId: host.id, date: args.date, month, season: MONTH_NOTES[month].season, covers: args.covers, dietary: mix,
    title: args.title, intro: args.intro,
    dishes: dishes.map(d => menuDish(host, d, month, mix, args.stories?.get(d.id))),
    zeroWasteTip: args.tip, totalKg: round1(totalKg), localShare: totalKg ? localKg / totalKg : 0,
  };
}

/** The tip of the month's special dish, else of the first dish that has one */
function curatedTip(dishes: Dish[], month: number): string {
  const special = specialFor(month);
  return (dishes.find(d => d.id === special.id) ?? dishes[0]).zeroWaste;
}

/** The hand-written menu for a month: no Gemini needed */
export function curatedMenu(host: Host, args: { date: string; month: number; covers: number; mix: DietMix }): Menu {
  const dishes = thaliFor(args.month);
  return assemble(host, { ...args, source: 'curated', dishes, title: MONTH_NOTES[args.month].thali, intro: MONTH_NOTES[args.month].note, tip: curatedTip(dishes, args.month) });
}

/* Gemini */

export const MENU_MAX_DISHES = 7;
const MAX_STORY = 200;
const MAX_TITLE = 48;
const MAX_INTRO = 240;
const MAX_TIP = 240;

export type RawMenu = { title?: unknown; intro?: unknown; dishes?: unknown; zeroWasteTip?: unknown };

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean && clean.length <= max ? clean : null;
};

/**
 * Checks what Gemini returned against the real dishes: unknown, repeated or out-of-season ids are dropped, a missing main
 * or sweet is added back, over-long or empty text falls back to the curated line. Returns null when too little survives.
 */
export function validateMenu(raw: unknown, month: number): { dishes: Dish[]; stories: Map<string, string>; title: string | null; intro: string | null; tip: string | null } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { title, intro, dishes, zeroWasteTip } = raw as RawMenu;
  if (!Array.isArray(dishes)) return null;
  const inSeason = new Set(dishesIn(month).map(d => d.id));
  const picked: Dish[] = [];
  const stories = new Map<string, string>();
  for (const entry of dishes) {
    const id = (entry as { id?: unknown })?.id;
    if (typeof id !== 'string' || !inSeason.has(id) || picked.some(d => d.id === id)) continue;
    const dish = DISH_BY_ID.get(id)!;
    picked.push(dish);
    const story = text((entry as { story?: unknown }).story, MAX_STORY);
    if (story) stories.set(id, story);
  }
  if (picked.length < 4) return null;
  // A thali always has the main and a sweet
  for (const required of ['dal-baati-churma', 'lapsi']) {
    if (!picked.some(d => d.id === required)) picked.push(DISH_BY_ID.get(required)!);
  }
  const ordered = picked.slice(0, MENU_MAX_DISHES).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  return { dishes: ordered, stories, title: text(title, MAX_TITLE), intro: text(intro, MAX_INTRO), tip: text(zeroWasteTip, MAX_TIP) };
}

export function menuSchema(month: number) {
  return {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING' },
      intro: { type: 'STRING' },
      dishes: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { id: { type: 'STRING', enum: dishesIn(month).map(d => d.id) }, story: { type: 'STRING' } },
          required: ['id', 'story'],
        },
      },
      zeroWasteTip: { type: 'STRING' },
    },
    required: ['title', 'intro', 'dishes', 'zeroWasteTip'],
  };
}

export function menuPrompt(host: Host, args: { date: string; month: number; covers: number; mix: DietMix }): { system: string; prompt: string } {
  const { month, mix, covers } = args;
  const pool = dishesIn(month).map(d => {
    const jain = resolve(d, 'jain').ok ? 'Jain ok' : 'no Jain';
    const vegan = resolve(d, 'vegan').ok ? 'vegan ok' : 'no vegan';
    const key = d.serving.slice().sort((a, b) => b.grams - a.grams).slice(0, 3).map(s => ingredientName(s.ingredient, month)).join(', ');
    return `- ${d.id}: ${d.name} (${d.slot}${d.peak.includes(month) ? ', at its best now' : ''}; ${jain}, ${vegan}; mainly ${key}) | seed: ${d.story}`;
  });
  const supplies = [...new Set(dishesIn(month).flatMap(d => d.serving.map(s => s.ingredient)))]
    .map(id => ({ id, supplier: supplierFor(host, id, month) }))
    .filter(s => s.supplier)
    .map(s => `${ingredientName(s.id, month)} from ${s.supplier!.farm.name}, ${s.supplier!.farm.village} (${s.supplier!.km} km)`);
  const guests = [`${mix.veg} vegetarian`, mix.jain ? `${mix.jain} Jain (no onion, garlic or root vegetables)` : '', mix.vegan ? `${mix.vegan} vegan (no milk, ghee or curd)` : ''].filter(Boolean).join(', ');
  const system = [
    'You are the head chef of a farm-to-table Mewari kitchen in Udaipur, Rajasthan, planning the day’s thali.',
    'Write warm, plain, specific English. Hindi food words are welcome. Never invent history: if a story is folklore, say folklore; otherwise describe the food, the season or the farm.',
  ].join(' ');
  const prompt = [
    `Kitchen: ${host.name} (${host.kind}), ${host.area}, Udaipur. Date: ${args.date} (${MONTH_NAMES[month - 1]}). Covers today: ${covers}. Guests: ${guests}.`,
    `Season on the farms: ${MONTH_NOTES[month].note}`,
    `Partner farms supply this month: ${supplies.join('; ')}.`,
    'Dishes you may choose from (use only these ids):',
    ...pool,
    'Compose today’s thali with 6 dishes: one starter, the main (dal-baati-churma), two sabzis, one side and one sweet. Prefer dishes at their best now and ones every guest in the mix can eat; if a Jain or vegan guest cannot eat a dish, note nothing, the kitchen adapts it.',
    'For each dish give a one-sentence story (max 22 words) tied to Mewar, the season or the farm that supplies it. Base it only on the dish’s seed and the farm facts above: do not add cooking methods, quantities, dates or history that are not there.',
    'Food facts: ker are dried berries, sangri are dried khejri tree pods, kachri is a dried wild melon (not a berry), raab is a maize-and-buttermilk porridge, baati is wheat dough baked in embers.',
    'title: a name for today’s thali (max 5 words). intro: one sentence (max 28 words) on what makes this thali seasonal.',
    'zeroWasteTip: one practical sentence (max 28 words) on using today’s leftovers or trimmings in tomorrow’s Mewari cooking (dal, parathas, kadhi, churma), not soups or stocks.',
  ].join('\n');
  return { system, prompt };
}

export type MenuRequest = { date: string; month: number; covers: number; mix: DietMix };

/**
 * Gemini's menu when it works. The smart model goes first; if it is busy or answers badly, the lite model gets one try
 * before the curated menu steps in, so a 503 in the middle of a demo still ends in a real menu most of the time.
 */
export async function composeMenu(gemini: Gemini, host: Host, req: MenuRequest, timeoutMs = 20_000): Promise<Menu> {
  if (!gemini.enabled || mixTotal(req.mix) <= 0) return curatedMenu(host, req);
  const { system, prompt } = menuPrompt(host, req);
  const models = [...new Set([gemini.models.smart, gemini.models.lite])];
  for (const [attempt, model] of models.entries()) {
    try {
      const raw = await gemini.json<RawMenu>({
        model, system, prompt, schema: menuSchema(req.month), temperature: 0.8, label: 'Hospitality',
        timeoutMs: attempt === 0 ? timeoutMs : Math.min(timeoutMs, 12_000),
      });
      const valid = validateMenu(raw, req.month);
      if (!valid) throw new GeminiError('Gemini returned too few usable dishes');
      const base = curatedMenu(host, req);
      return assemble(host, {
        ...req, source: 'gemini', model, dishes: valid.dishes, stories: valid.stories,
        title: valid.title ?? base.title, intro: valid.intro ?? base.intro, tip: valid.tip ?? curatedTip(valid.dishes, req.month),
      });
    } catch (err) {
      logger.warn('Hospitality', `Gemini menu from ${model} failed (${(err as Error).message.slice(0, 160)})${attempt < models.length - 1 ? '; trying the next model' : '; using the curated menu'}`);
    }
  }
  return curatedMenu(host, req);
}
