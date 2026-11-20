// Every destination guide in src/places/cities follows the rules on the fields of src/places/types.ts.
// GUIDE=hampi node --test tests/places/places.test.ts checks just one guide.
import { readdirSync } from 'node:fs';
import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { VIBE_AXES } from '../../src/voice/experiences.ts';
import { EFFORTS, ITEM_KINDS, TIMES_OF_DAY, TRAVELLERS, type CityGuide, type ItemKind } from '../../src/places/types.ts';

const DIR = new URL('../../src/places/cities/', import.meta.url);
const only = process.env.GUIDE;
const files = readdirSync(DIR).filter(f => f.endsWith('.ts') && (!only || f === `${only}.ts`)).sort();
const guides: [string, CityGuide][] = [];
for (const file of files) guides.push([file.replace(/\.ts$/, ''), (await import(new URL(file, DIR).href)).guide as CityGuide]);

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const STRAIGHT_QUOTES = /['"]/;

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = Math.PI / 180;
  const a = Math.sin(((bLat - aLat) * rad) / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(((bLng - aLng) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Text the app shows: no straight quotes (use ’ and “ ”), no trailing spaces, within a length */
function prose(value: unknown, max: number, label: string) {
  expect(typeof value === 'string' && value.trim().length > 0 ? 'text' : `${label}: missing`).toBe('text');
  const text = value as string;
  expect(text.length <= max ? 'ok' : `${label}: ${text.length} > ${max} chars`).toBe('ok');
  expect(STRAIGHT_QUOTES.test(text) ? `${label}: use ’ or “ ” instead of straight quotes` : 'ok').toBe('ok');
  expect(text === text.trim() ? 'ok' : `${label}: stray whitespace`).toBe('ok');
}

const MONTH = (m: unknown) => Number.isInteger(m) && (m as number) >= 1 && (m as number) <= 12;
const NEEDS_STORY: ItemKind[] = ['sight', 'spiritual', 'day-trip'];

test('there are guides to check', () => {
  expect(guides.length > 0 ? 'ok' : `no guide${only ? ` named ${only}` : 's'} in src/places/cities`).toBe('ok');
});

const seenIds = new Map<string, string>();

for (const [file, g] of guides) {
  describe(`guide ${file}`, () => {
    test('city facts', () => {
      expect(g.id).toBe(file);
      prose(g.name, 40, 'name');
      prose(g.state, 40, 'state');
      expect(g.aliases.length >= 1 ? 'ok' : 'aliases: at least one').toBe('ok');
      for (const a of g.aliases) expect(a === a.toLowerCase() && a.trim() === a && a.length >= 3 ? 'ok' : `alias “${a}”: lower case, 3+ chars`).toBe('ok');
      expect(Number.isFinite(g.lat) && Number.isFinite(g.lng) && g.lat > 6 && g.lat < 37 && g.lng > 68 && g.lng < 98 ? 'ok' : 'centre: not in India').toBe('ok');
      prose(g.summary, 400, 'summary');
      expect(g.bestMonths.length > 0 && g.bestMonths.every(MONTH) ? 'ok' : 'bestMonths: 1–12').toBe('ok');
      prose(g.avoid, 200, 'avoid');
      const [lo, hi] = g.budgetPerDayRupees;
      expect(Number.isInteger(lo) && Number.isInteger(hi) && lo > 0 && lo <= hi ? 'ok' : 'budgetPerDayRupees: [low, high] whole rupees').toBe('ok');
      const [dLo, dHi] = g.idealDays;
      expect(Number.isInteger(dLo) && Number.isInteger(dHi) && dLo >= 1 && dLo <= dHi && dHi <= 21 ? 'ok' : 'idealDays: [min, max]').toBe('ok');
      prose(g.gettingThere, 300, 'gettingThere');
      prose(g.gettingAround, 300, 'gettingAround');
      prose(g.whereToStay, 300, 'whereToStay');
      expect(g.practical.length >= 3 ? 'ok' : 'practical: at least 3').toBe('ok');
      g.practical.forEach((p, i) => prose(p, 220, `practical[${i}]`));
      expect(g.etiquette.length >= 3 ? 'ok' : 'etiquette: at least 3').toBe('ok');
      g.etiquette.forEach((p, i) => prose(p, 220, `etiquette[${i}]`));
      expect(g.sources.length >= 3 ? 'ok' : 'sources: at least 3').toBe('ok');
    });

    test('dishes and festivals', () => {
      expect(g.dishes.length >= 6 ? 'ok' : 'dishes: at least 6').toBe('ok');
      for (const d of g.dishes) {
        prose(d.name, 60, 'dish name');
        prose(d.what, 200, `dish ${d.name}`);
        if (d.where !== undefined) prose(d.where, 120, `dish ${d.name} where`);
        expect(typeof d.veg).toBe('boolean');
      }
      expect(g.festivals.length >= 3 ? 'ok' : 'festivals: at least 3').toBe('ok');
      for (const f of g.festivals) {
        prose(f.name, 60, 'festival name');
        prose(f.what, 220, `festival ${f.name}`);
        expect(f.months.length > 0 && f.months.every(MONTH) ? 'ok' : `festival ${f.name}: months 1–12`).toBe('ok');
      }
    });

    test('items: enough of each kind', () => {
      const n = g.items.length;
      expect(n >= 35 && n <= 60 ? 'ok' : `items: ${n}, want 35–60`).toBe('ok');
      const count = (kinds: ItemKind[]) => g.items.filter(i => kinds.includes(i.kind)).length;
      const gems = g.items.filter(i => i.gem).length;
      expect(gems >= Math.ceil(n * 0.25) ? 'ok' : `gems: ${gems}, want at least a quarter of ${n}`).toBe('ok');
      expect(count(['food']) >= 6 ? 'ok' : 'food: at least 6').toBe('ok');
      expect(count(['experience', 'workshop']) >= 5 ? 'ok' : 'experience + workshop: at least 5').toBe('ok');
      expect(count(['sight', 'spiritual', 'neighbourhood']) >= 6 ? 'ok' : 'sight + spiritual + neighbourhood: at least 6').toBe('ok');
      expect(count(['day-trip']) >= 2 ? 'ok' : 'day-trip: at least 2').toBe('ok');
      const kinds = new Set(g.items.map(i => i.kind)).size;
      expect(kinds >= 8 ? 'ok' : `kinds: ${kinds} different, want at least 8`).toBe('ok');
      const names = g.items.map(i => i.name.toLowerCase());
      const dupe = names.find((name, i) => names.indexOf(name) !== i);
      expect(dupe ? `duplicate item “${dupe}”` : 'ok').toBe('ok');
    });

    for (const item of g.items) {
      test(`item ${item.id}`, () => {
        expect(KEBAB.test(item.id) && item.id.startsWith(`${g.id}-`) ? 'ok' : `id must be kebab-case and start with “${g.id}-”`).toBe('ok');
        const other = seenIds.get(item.id);
        expect(other && other !== g.id ? `id also used in ${other}` : 'ok').toBe('ok');
        seenIds.set(item.id, g.id);
        prose(item.name, 70, 'name');
        expect(ITEM_KINDS.includes(item.kind) ? 'ok' : `kind “${item.kind}”`).toBe('ok');
        expect(typeof item.gem).toBe('boolean');
        prose(item.area, 70, 'area');
        const dist = km(g.lat, g.lng, item.lat, item.lng);
        expect(Number.isFinite(dist) && dist <= (g.radiusKm ?? 250) ? 'ok' : `${Math.round(dist)} km from the centre, max ${g.radiusKm ?? 250}`).toBe('ok');
        const axes = Object.entries(item.vibe);
        expect(axes.length > 0 && axes.every(([axis, v]) => VIBE_AXES.includes(axis as never) && typeof v === 'number' && v > 0 && v <= 1 && Math.abs(v * 10 - Math.round(v * 10)) < 1e-9) ? 'ok' : 'vibe: known axes, 0.1–1 in steps of 0.1').toBe('ok');
        expect(axes.some(([, v]) => (v as number) >= 0.6) ? 'ok' : 'vibe: one axis ≥ 0.6').toBe('ok');
        expect(item.goodFor.length > 0 && item.goodFor.every(t => TRAVELLERS.includes(t)) && new Set(item.goodFor).size === item.goodFor.length ? 'ok' : 'goodFor').toBe('ok');
        expect(EFFORTS.includes(item.effort) ? 'ok' : 'effort').toBe('ok');
        expect(TIMES_OF_DAY.includes(item.bestTime) ? 'ok' : 'bestTime').toBe('ok');
        prose(item.hours, 80, 'hours');
        expect(item.durationHours >= 0.25 && item.durationHours <= 14 ? 'ok' : 'durationHours: 0.25–14').toBe('ok');
        expect(Number.isInteger(item.costRupees) && item.costRupees >= 0 && item.costRupees <= 100_000 ? 'ok' : 'costRupees: whole rupees').toBe('ok');
        if (item.months) expect(item.months.length > 0 && item.months.length < 12 && item.months.every(MONTH) ? 'ok' : 'months: 1–11 of 1–12, omit for all year').toBe('ok');
        prose(item.pitch, 160, 'pitch');
        prose(item.tip, 200, 'tip');
        if (NEEDS_STORY.includes(item.kind) || item.story !== undefined) prose(item.story, 220, 'story');
        if (item.care !== undefined) prose(item.care, 160, 'care');
      });
    }
  });
}
