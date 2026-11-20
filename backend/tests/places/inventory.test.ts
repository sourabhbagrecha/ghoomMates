import { after, before, describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { mount, serve } from '../helpers.ts';
import { createPlacesApp } from '../../src/places/app.ts';
import { GUIDE_BY_ID, GUIDES, ITEM_BY_ID, guideBrief, guideFor, itemFit, monthOf, rankItems, stopTag, type PlaceItem } from '../../src/places/index.ts';
import { guideDraft } from '../../src/trips/itinerary.ts';
import type { Vibe } from '../../src/voice/experiences.ts';

const guide = (id: string) => GUIDE_BY_ID.get(id)!;
const vibe = (v: Partial<Vibe>): Vibe => ({ adventure: 0, food: 0, nightlife: 0, culture: 0, chill: 0, shops: 0, ...v });
const FOODIE = vibe({ food: 1, culture: 0.3 });
const NOT_A_STOP = new Set(['Stay', 'Travel']);

describe('the registry', () => {
  test('has the 25 destinations, each id unique, every item findable by id', () => {
    expect(GUIDES.length).toBe(25);
    expect(GUIDE_BY_ID.size).toBe(25);
    expect(ITEM_BY_ID.size).toBe(GUIDES.reduce((sum, g) => sum + g.items.length, 0));
    for (const g of GUIDES) for (const item of g.items) expect(ITEM_BY_ID.get(item.id)!.guide.id).toBe(g.id);
  });
});

describe('guideFor', () => {
  test('every guide answers to its own id, name and aliases, and to nobody else’s', () => {
    for (const g of GUIDES) {
      for (const name of [g.id, g.id.replace(/-/g, ' '), g.name, ...g.aliases]) {
        expect(`${name} → ${guideFor(name)?.id}`).toBe(`${name} → ${g.id}`);
      }
    }
  });
  test('finds the guide inside free-text destinations', () => {
    expect(guideFor('Hampi, Karnataka')?.id).toBe('hampi');
    expect(guideFor('Spiti Valley road trip')?.id).toBe('spiti-valley');
    expect(guideFor('Old Manali')?.id).toBe('kullu-manali');
    expect(guideFor('Leh–Ladakh')?.id).toBe('leh-ladakh');
    expect(guideFor('South Goa')?.id).toBe('goa');
    expect(guideFor('Gokarna, Karnataka')?.id).toBe('gokarna');
    expect(guideFor('BANARAS')?.id).toBe('varanasi');
  });
  test('needs a whole word, and says null for places we have no guide for', () => {
    expect(guideFor('Uttarkashi')).toBe(null);
    expect(guideFor('Paris')).toBe(null);
    expect(guideFor('')).toBe(null);
    expect(guideFor(null)).toBe(null);
    expect(guideFor(undefined)).toBe(null);
  });
});

describe('monthOf', () => {
  test('reads the month from an ISO date, else null', () => {
    expect(monthOf('2027-01-14')).toBe(1);
    expect(monthOf('2026-12-31T10:00:00Z')).toBe(12);
    expect(monthOf('2026-13-01')).toBe(null);
    expect(monthOf('next week')).toBe(null);
    expect(monthOf(null)).toBe(null);
  });
});

describe('itemFit and rankItems', () => {
  const item = { vibe: { food: 1, culture: 0.5 } } as PlaceItem;
  test('fit is the weighted mean over the axes the item speaks to', () => {
    expect(itemFit(item, vibe({ food: 0.8, culture: 0.2 }))).toBe(Math.round(((0.8 + 0.5 * 0.2) / 1.5) * 100));
    expect(itemFit(item, vibe({ adventure: 1 }))).toBe(0);
  });
  test('filters by kind, gems, traveller, cost, effort and season, and leaves out excluded ids', () => {
    const hampi = guide('hampi');
    for (const { item: i } of rankItems(hampi, { kinds: ['food', 'sight'] })) expect(['food', 'sight'].includes(i.kind)).toBe(true);
    for (const { item: i } of rankItems(hampi, { gems: true })) expect(i.gem).toBe(true);
    for (const { item: i } of rankItems(hampi, { traveller: 'seniors' })) expect(i.goodFor.includes('seniors')).toBe(true);
    for (const { item: i } of rankItems(hampi, { maxCostRupees: 0 })) expect(i.costRupees).toBe(0);
    for (const { item: i } of rankItems(hampi, { maxEffort: 'easy' })) expect(i.effort).toBe('easy');
    const first = rankItems(hampi)[0].item.id;
    expect(rankItems(hampi, { exclude: [first] }).some(r => r.item.id === first)).toBe(false);
    for (const g of GUIDES) {
      for (const { item: i } of rankItems(g, { month: 7 })) expect(!i.months || i.months.includes(7)).toBe(true);
    }
  });
  test('ranks by the vibe, best match first, and gives no match without one', () => {
    const ranked = rankItems(guide('chettinad'), { vibe: FOODIE });
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].match! >= ranked[i].match!).toBe(true);
    expect(ranked[0].item.vibe.food! >= 0.6).toBe(true);
    expect(rankItems(guide('chettinad')).every(r => r.match === null)).toBe(true);
  });
});

describe('guideBrief', () => {
  test('keeps every kind the guide has, within the limit, with the must-knows', () => {
    for (const g of GUIDES) {
      const brief = guideBrief(g, { vibe: FOODIE, limit: 20 });
      const lines = brief.split('\n').filter(l => l.startsWith('- '));
      expect(lines.length <= 20).toBe(true);
      for (const kind of new Set(g.items.map(i => i.kind))) expect(brief.includes(`[${kind}`)).toBe(true);
      expect(brief.includes('Must-knows:')).toBe(true);
    }
  });
  test('names the trip month and the season only when there is a month', () => {
    expect(guideBrief(guide('tawang'), { month: 1 }).includes('Trip month: 1.')).toBe(true);
    expect(guideBrief(guide('tawang')).includes('Trip month')).toBe(false);
  });
});

describe('guideDraft', () => {
  const stops = (draft: ReturnType<typeof guideDraft>) => draft.days.flatMap(d => d.slots.flat()).filter(s => !NOT_A_STOP.has(s.tag));
  test('every guide gives a full plan of real, unrepeated places with a gem on every full day', () => {
    for (const g of GUIDES) {
      const draft = guideDraft(g, 5, { vibe: FOODIE, month: g.bestMonths[0] });
      expect(draft.days.length).toBe(5);
      expect(draft.source).toBe('template');
      const titles = stops(draft).map(s => s.title).filter(t => t !== 'Head home');
      expect(`${g.id}: ${new Set(titles).size}`).toBe(`${g.id}: ${titles.length}`);
      const names = new Set(g.items.map(i => i.name));
      for (const t of titles) expect(names.has(t)).toBe(true);
      for (const day of draft.days.slice(1, -1)) {
        if (day.title.startsWith('Day trip')) continue;
        expect(`${g.id} ${day.title}: ${day.slots.flat().some(s => g.items.find(i => i.name === s.title)?.gem)}`).toBe(`${g.id} ${day.title}: true`);
      }
      for (const s of stops(draft)) expect(s.notes.length <= 500).toBe(true);
    }
  });
  test('a 4+ day trip goes out of town on day 3; shorter trips do not', () => {
    const hampi = guide('hampi');
    expect(guideDraft(hampi, 4).days[2].title.startsWith('Day trip: ')).toBe(true);
    expect(guideDraft(hampi, 3).days.some(d => d.title.startsWith('Day trip'))).toBe(false);
  });
  test('arrives, then leaves; a one-day trip is just the arrival; onlyDay gives one full day', () => {
    const goa = guide('goa');
    const two = guideDraft(goa, 2);
    expect(two.days[0].title).toBe('Hello, Goa');
    expect(two.days[1].title).toBe('Last chai, then home');
    expect(guideDraft(goa, 1).days.length).toBe(1);
    const only = guideDraft(goa, 5, { onlyDay: 3 });
    expect(only.days.length).toBe(1);
    expect(only.days[0].title).toBe('Goa, day 3');
  });
  test('stop tags follow the item kind', () => {
    const tagOf = (kind: PlaceItem['kind']) => stopTag({ kind, vibe: { culture: 1 } } as PlaceItem);
    expect(tagOf('food')).toBe('Food');
    expect(tagOf('sight')).toBe('Culture');
    expect(tagOf('nature')).toBe('Chill');
    expect(tagOf('shopping')).toBe('Shops');
    expect(stopTag({ kind: 'experience', vibe: { adventure: 0.9, culture: 0.4 } } as PlaceItem)).toBe('Adventure');
  });
});

describe('/api/places', () => {
  let api: Awaited<ReturnType<typeof serve>>;
  before(async () => { api = await serve(mount('/api/places', createPlacesApp())); });
  after(() => api.close());

  test('lists every guide without its items', async () => {
    const res = await api.request('/api/places');
    expect(res.status).toBe(200);
    const body = await res.json() as { guides: { id: string; items: number; gems: number }[] };
    expect(body.guides.length).toBe(25);
    const hampi = body.guides.find(g => g.id === 'hampi')!;
    expect(hampi.items).toBe(guide('hampi').items.length);
  });
  test('matches free text to a guide', async () => {
    expect(await (await api.request('/api/places/match?destination=Kaza%2C%20Spiti')).json()).toEqual({ guide: { id: 'spiti-valley', name: guide('spiti-valley').name } });
    expect(await (await api.request('/api/places/match?destination=Paris')).json()).toEqual({ guide: null });
  });
  test('returns one guide, filtered and ranked for a vibe', async () => {
    const res = await api.request('/api/places/varanasi?kind=food,spiritual&gems=1&food=1');
    expect(res.status).toBe(200);
    const { guide: g } = await res.json() as { guide: { id: string; items: (PlaceItem & { match: number })[] } };
    expect(g.id).toBe('varanasi');
    expect(g.items.length > 0).toBe(true);
    for (const i of g.items) {
      expect(['food', 'spiritual'].includes(i.kind) && i.gem).toBe(true);
      expect(typeof i.match).toBe('number');
    }
  });
  test('takes free text for the id, and 404s for a place we do not cover', async () => {
    expect((await api.request('/api/places/Banaras')).status).toBe(200);
    expect((await api.request('/api/places/paris')).status).toBe(404);
  });
});
