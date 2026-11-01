// Shared vocabulary of the farm-to-table module: meals a squad can book and the diets a kitchen plans for.

export const MEALS = ['lunch', 'dinner'] as const;
export type Meal = (typeof MEALS)[number];

/** veg is the standard vegetarian thali; jain skips onion, garlic and root vegetables; vegan skips milk, ghee and curd */
export const DIETS = ['veg', 'jain', 'vegan'] as const;
export type Diet = (typeof DIETS)[number];
export type DietMix = Record<Diet, number>;

export const MEAL_INFO: Record<Meal, { label: string; times: string[]; defaultTime: string }> = {
  lunch: { label: 'Lunch', times: ['12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM'], defaultTime: '01:00 PM' },
  dinner: { label: 'Dinner', times: ['07:30 PM', '08:00 PM', '08:30 PM', '09:00 PM'], defaultTime: '08:00 PM' },
};

export const emptyMix = (): DietMix => ({ veg: 0, jain: 0, vegan: 0 });

export const mixTotal = (mix: DietMix) => mix.veg + mix.jain + mix.vegan;

export function addMix(a: DietMix, b: DietMix): DietMix {
  return { veg: a.veg + b.veg, jain: a.jain + b.jain, vegan: a.vegan + b.vegan };
}

/** Splits `total` over shares (summing to 1) with whole numbers that add up to exactly `total` (largest remainder) */
export function splitMix(total: number, shares: DietMix): DietMix {
  const exact = DIETS.map(d => ({ diet: d, value: total * shares[d] }));
  const mix = emptyMix();
  for (const { diet, value } of exact) mix[diet] = Math.floor(value);
  let left = total - mixTotal(mix);
  for (const { diet } of [...exact].sort((a, b) => (b.value % 1) - (a.value % 1))) {
    if (left-- <= 0) break;
    mix[diet]++;
  }
  return mix;
}

/** "2 Jain · 1 vegan", or "" when everyone eats the standard thali */
export function describeMix(mix: DietMix): string {
  return [mix.jain && `${mix.jain} Jain`, mix.vegan && `${mix.vegan} vegan`].filter(Boolean).join(' · ');
}
