import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { GeminiError, type Gemini, type JsonRequest } from '../../src/gemini.ts';
import { dishesIn } from '../../src/hospitality/dishes.ts';
import { composeMenu, curatedMenu, menuPrompt, menuSchema, validateMenu } from '../../src/hospitality/menu.ts';
import { HOST_BY_ID } from '../../src/hospitality/partners.ts';

const haveli = HOST_BY_ID.get('kesar-pol-haveli')!;
const req = { date: '2026-11-02', month: 11, covers: 40, mix: { veg: 36, jain: 2, vegan: 2 } };

type FakeGemini = Gemini & { calls: JsonRequest[] };

function fakeGemini(answer: (call: JsonRequest, n: number) => unknown, enabled = true): FakeGemini {
  const calls: JsonRequest[] = [];
  return {
    enabled,
    imageEnabled: false,
    models: { lite: 'lite-model', smart: 'smart-model', image: 'image-model', tts: 'tts-model' },
    calls,
    async json<T>(call: JsonRequest) {
      calls.push(call);
      return await answer(call, calls.length) as T;
    },
    async image() { throw new Error('not used'); },
    async speech() { throw new Error('not used'); },
  };
}

const good = {
  title: 'Winter Feast at Kesar Pol',
  intro: 'Fresh makki and winter greens from the farms around Badgaon.',
  dishes: [
    { id: 'makki-ki-raab', story: 'Maize and buttermilk porridge for chilly mornings.' },
    { id: 'dal-baati-churma', story: 'Ember-baked baatis with five-lentil dal.' },
    { id: 'makki-roti-saag', story: 'Maize rotis with slow-cooked winter greens.' },
    { id: 'kaddu-ki-sabzi', story: 'Sweet and sour pumpkin.' },
    { id: 'rajasthani-kadhi', story: 'Golden buttermilk kadhi.' },
    { id: 'lapsi', story: 'Broken wheat in ghee and jaggery.' },
  ],
  zeroWasteTip: 'Crumble leftover baatis into tomorrow’s churma.',
};

describe('the curated menu', () => {
  test('is the month’s six-dish thali with quantities, farms and diet notes from our own data', () => {
    const menu = curatedMenu(haveli, req);
    expect(menu.source).toBe('curated');
    expect(menu.model).toBe(null);
    expect(menu.dishes).toHaveLength(6);
    expect(menu.title).toBe('Makki season thali');
    expect(menu.totalKg > 30 && menu.totalKg < 45).toBe(true);
    expect(menu.localShare > 0.8).toBe(true);
    const raab = menu.dishes.find(d => d.id === 'makki-ki-raab')!;
    expect(raab.ingredients.find(i => i.ingredientId === 'makki')?.farm?.village).toBe('Badgaon');
    expect(raab.dietNotes.some(n => n.startsWith('Jain (2)'))).toBe(true);
    expect(raab.dietNotes.some(n => n.startsWith('Vegan (2): not adapted'))).toBe(true);
    const baati = menu.dishes.find(d => d.id === 'dal-baati-churma')!;
    expect(baati.ingredients.find(i => i.ingredientId === 'jaggery')?.farm).toBe(null);
  });
  test('no Jain or vegan guests, no diet notes', () => {
    const menu = curatedMenu(haveli, { ...req, mix: { veg: 40, jain: 0, vegan: 0 } });
    for (const dish of menu.dishes) expect(dish.dietNotes).toEqual([]);
  });
  test('has a zero-waste tip and the season', () => {
    const menu = curatedMenu(haveli, req);
    expect(menu.zeroWasteTip.length > 20).toBe(true);
    expect(menu.season).toBe('Makki season');
  });
});

describe('checking what Gemini returned', () => {
  test('keeps real in-season dishes in thali order with their stories', () => {
    const valid = validateMenu(good, 11)!;
    expect(valid.dishes.map(d => d.id)).toEqual(['makki-ki-raab', 'dal-baati-churma', 'makki-roti-saag', 'kaddu-ki-sabzi', 'rajasthani-kadhi', 'lapsi']);
    expect(valid.stories.get('lapsi')).toBe('Broken wheat in ghee and jaggery.');
    expect(valid.title).toBe('Winter Feast at Kesar Pol');
  });
  test('drops made-up, repeated and out-of-season dishes', () => {
    const valid = validateMenu({
      ...good,
      dishes: [...good.dishes, { id: 'butter-chicken', story: 'x' }, { id: 'lapsi', story: 'again' }, { id: 'tinda-masala', story: 'a June dish' }],
    }, 11)!;
    expect(valid.dishes.map(d => d.id).includes('butter-chicken')).toBe(false);
    expect(valid.dishes.map(d => d.id).includes('tinda-masala')).toBe(false);
    expect(valid.dishes.filter(d => d.id === 'lapsi')).toHaveLength(1);
    expect(valid.stories.get('lapsi')).toBe('Broken wheat in ghee and jaggery.');
  });
  test('adds back a missing main and sweet, and refuses a menu with too little left', () => {
    const valid = validateMenu({ ...good, dishes: good.dishes.filter(d => !['dal-baati-churma', 'lapsi'].includes(d.id)) }, 11)!;
    expect(valid.dishes.some(d => d.id === 'dal-baati-churma') && valid.dishes.some(d => d.id === 'lapsi')).toBe(true);
    expect(validateMenu({ ...good, dishes: good.dishes.slice(0, 2) }, 11)).toBe(null);
    expect(validateMenu({ dishes: 'nope' }, 11)).toBe(null);
    expect(validateMenu(null, 11)).toBe(null);
  });
  test('over-long or non-text strings fall back to nothing, so the curated line is used', () => {
    const valid = validateMenu({ ...good, title: 'x'.repeat(200), intro: 42, zeroWasteTip: '   ', dishes: good.dishes.map(d => ({ ...d, story: 'y'.repeat(500) })) }, 11)!;
    expect(valid.title).toBe(null);
    expect(valid.intro).toBe(null);
    expect(valid.tip).toBe(null);
    expect(valid.stories.size).toBe(0);
  });
  test('the schema only allows dishes in season', () => {
    const ids = (menuSchema(6) as any).properties.dishes.items.properties.id.enum as string[];
    expect(ids.includes('tinda-masala') && !ids.includes('makki-ki-raab')).toBe(true);
    expect(ids).toEqual(dishesIn(6).map(d => d.id));
  });
});

describe('composing with Gemini', () => {
  test('uses the smart model, keeps its words, and takes every number from our data', async () => {
    const gemini = fakeGemini(() => good);
    const menu = await composeMenu(gemini, haveli, req);
    expect(menu.source).toBe('gemini');
    expect(menu.model).toBe('smart-model');
    expect(gemini.calls).toHaveLength(1);
    expect(gemini.calls[0].model).toBe('smart-model');
    expect(menu.title).toBe('Winter Feast at Kesar Pol');
    expect(menu.dishes.find(d => d.id === 'lapsi')?.story).toBe('Broken wheat in ghee and jaggery.');
    expect(menu.zeroWasteTip).toBe('Crumble leftover baatis into tomorrow’s churma.');
    const curated = curatedMenu(haveli, req);
    const dbc = (m: typeof menu) => m.dishes.find(d => d.id === 'dal-baati-churma')!.ingredients.map(i => [i.ingredientId, i.kg, i.farm?.id]);
    expect(dbc(menu)).toEqual(dbc(curated));
  });
  test('the prompt carries the date, the diet mix, the real dishes and the suppliers', () => {
    const { prompt, system } = menuPrompt(haveli, req);
    for (const needle of ['Kesar Pol Haveli', 'November', 'Covers today: 40', '2 Jain', '2 vegan', 'makki-ki-raab', 'Hariyali Dhani, Badgaon (15 km)', 'kachri is a dried wild melon']) {
      expect(prompt.includes(needle)).toBe(true);
    }
    expect(prompt.includes('tinda-masala')).toBe(false);
    expect(system.includes('Mewari')).toBe(true);
  });
  test('when the smart model is busy the lite model gets one try', async () => {
    const gemini = fakeGemini((call) => {
      if (call.model === 'smart-model') throw new GeminiError('This model is currently experiencing high demand', 503);
      return good;
    });
    const menu = await composeMenu(gemini, haveli, req);
    expect(menu.source).toBe('gemini');
    expect(menu.model).toBe('lite-model');
    expect(gemini.calls.map(c => c.model)).toEqual(['smart-model', 'lite-model']);
  });
  test('when both fail, or the answer is unusable, the curated menu answers and nothing throws', async () => {
    const down = await composeMenu(fakeGemini(() => { throw new GeminiError('timed out'); }), haveli, req);
    expect(down.source).toBe('curated');
    expect(down.dishes).toHaveLength(6);
    const junk = await composeMenu(fakeGemini(() => ({ dishes: [{ id: 'pizza', story: 'x' }] })), haveli, req);
    expect(junk.source).toBe('curated');
    const notJson = await composeMenu(fakeGemini(() => 'hello'), haveli, req);
    expect(notJson.source).toBe('curated');
  });
  test('without Gemini it never calls out', async () => {
    const off = fakeGemini(() => good, false);
    const menu = await composeMenu(off, haveli, req);
    expect(menu.source).toBe('curated');
    expect(off.calls).toHaveLength(0);
  });
});
