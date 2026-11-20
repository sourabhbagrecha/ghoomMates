import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '../expect.ts';
import { CORE_DECK } from '../../src/prefs/decks/core.ts';
import {
  applyAnswer, axisConfidence, confidenceOf, emptyTaste, personaFor, scoreAnswers, speedWeight, styleValue, tasteFromVibe, vibeOf,
  type Card, type Reply, type Taste,
} from '../../src/prefs/taste.ts';

// ms 3000 has speed weight 1, so the numbers below are the raw weights from taste.ts
const MS = 3000;
const near = (actual: number, expected: number, what = '') => assert.ok(Math.abs(actual - expected) < 0.011, `${what} ${actual} ≠ ${expected}`);

const swipe: Card = {
  id: 't:swipe', format: 'swipe', topic: 'T', prompt: 'Sunrise trek',
  options: [{ id: 's', label: 'Trek', icon: 'mountain', effects: { axes: { adventure: 1, culture: 0.5 }, style: { mornings: 1 }, tags: ['hikes'] } }],
};
const thisOrThat: Card = {
  id: 't:tot', format: 'this-or-that', topic: 'T', prompt: 'Fort or club?',
  options: [
    { id: 'fort', label: 'Fort', icon: 'castle', effects: { axes: { culture: 1 }, tags: ['forts'] } },
    { id: 'club', label: 'Club', icon: 'martini', effects: { axes: { nightlife: 1 }, tags: ['clubs'] } },
  ],
};
const pick: Card = {
  id: 't:pick', format: 'pick', topic: 'T', prompt: 'Pick one',
  options: [
    { id: 'a', label: 'A', icon: 'gem', effects: { axes: { food: 1 } } },
    { id: 'b', label: 'B', icon: 'gem', effects: { axes: { chill: 1 } } },
    { id: 'c', label: 'C', icon: 'gem', effects: { axes: { shops: 1 } } },
  ],
};
const multi: Card = {
  id: 't:multi', format: 'multi', topic: 'T', prompt: 'Any of these',
  options: [
    { id: 'a', label: 'A', icon: 'gem', effects: { axes: { food: 1 }, style: { pace: 1 }, tags: ['a'] } },
    { id: 'b', label: 'B', icon: 'gem', effects: { axes: { chill: 1 }, style: { pace: 0 }, tags: ['b'] } },
    { id: 'c', label: 'C', icon: 'gem', effects: { axes: { shops: 1 }, tags: ['c'] } },
    { id: 'none', label: 'None', icon: 'check', exclusive: true, effects: {} },
  ],
};
const bestWorst: Card = {
  id: 't:bw', format: 'best-worst', topic: 'T', prompt: 'Best and worst?',
  options: [
    { id: 'gig', label: 'Gig', icon: 'guitar', effects: { axes: { nightlife: 1 }, style: { mornings: 0 }, tags: ['live-music'] } },
    { id: 'spa', label: 'Spa', icon: 'flower-2', effects: { axes: { chill: 1 }, tags: ['spa'] } },
    { id: 'hike', label: 'Hike', icon: 'mountain', effects: { axes: { adventure: 1 }, tags: ['hikes'] } },
    { id: 'shop', label: 'Shop', icon: 'store', effects: { axes: { shops: 1 } } },
  ],
};
const spectrum: Card = {
  id: 't:spectrum', format: 'spectrum', topic: 'T', prompt: 'Pace?',
  options: [0, 0.25, 0.5, 0.75, 1].map((pace, i) => ({ id: `p${i}`, label: `P${i}`, icon: 'scale', effects: { style: { pace }, axes: { adventure: pace } } })),
};

const answer = (card: Card, reply: Reply, ms = MS) => applyAnswer(emptyTaste(), card, reply, ms);

describe('swipe cards', () => {
  test('a like adds the axes as evidence for, half-weight style votes and +1 per tag', () => {
    const t = answer(swipe, { kind: 'swipe', verdict: 'like' });
    expect(t.answered).toBe(1);
    expect(t.axes.adventure).toEqual({ a: 2, b: 1 });
    expect(t.axes.culture).toEqual({ a: 1.5, b: 1 });
    expect(t.axes.food).toEqual({ a: 1, b: 1 });
    expect(t.style.mornings).toEqual({ sum: 0.5, weight: 0.5 });
    expect(t.tags).toEqual({ hikes: 1 });
  });

  test('a love counts double, with full-weight style votes and +2 per tag', () => {
    const t = answer(swipe, { kind: 'swipe', verdict: 'love' });
    expect(t.axes.adventure).toEqual({ a: 3, b: 1 });
    expect(t.style.mornings).toEqual({ sum: 1, weight: 1 });
    expect(t.tags).toEqual({ hikes: 2 });
  });

  test('a nope is evidence against, casts no style vote and marks the tags down', () => {
    const t = answer(swipe, { kind: 'swipe', verdict: 'nope' });
    expect(t.answered).toBe(1);
    expect(t.axes.adventure).toEqual({ a: 1, b: 2 });
    expect(t.axes.culture).toEqual({ a: 1, b: 1.5 });
    expect(t.style.mornings).toBe(undefined);
    expect(t.tags).toEqual({ hikes: -1 });
  });
});

describe('choice cards', () => {
  test('this-or-that: the option passed over gets 0.6 of evidence against', () => {
    const t = answer(thisOrThat, { kind: 'choose', optionIds: ['fort'] });
    expect(t.axes.culture).toEqual({ a: 2, b: 1 });
    expect(t.axes.nightlife).toEqual({ a: 1, b: 1.6 });
    expect(t.tags).toEqual({ forts: 1 });
  });

  test('pick: the 0.6 against is split across the options passed over', () => {
    const t = answer(pick, { kind: 'choose', optionIds: ['a'] });
    expect(t.axes.food).toEqual({ a: 2, b: 1 });
    expect(t.axes.chill).toEqual({ a: 1, b: 1.3 });
    expect(t.axes.shops).toEqual({ a: 1, b: 1.3 });
  });

  test('multi: each pick adds 0.8 for, style votes share one weight, unpicked options 0.3 against', () => {
    const t = answer(multi, { kind: 'choose', optionIds: ['a', 'b'] });
    expect(t.answered).toBe(1);
    expect(t.axes.food).toEqual({ a: 1.8, b: 1 });
    expect(t.axes.chill).toEqual({ a: 1.8, b: 1 });
    expect(t.axes.shops).toEqual({ a: 1, b: 1.3 });
    expect(t.style.pace).toEqual({ sum: 0.5, weight: 1 });
    expect(t.tags).toEqual({ a: 1, b: 1 });
  });

  test('multi: an exclusive option wins over anything picked with it', () => {
    const t = answer(multi, { kind: 'choose', optionIds: ['a', 'none'] });
    expect(t.answered).toBe(1);
    expect(t.axes.food).toEqual({ a: 1, b: 1.3 });
    expect(t.tags).toEqual({});
    expect(t.style).toEqual({});
  });

  test('best-worst: 1.5 for the best (with its style and tags), 1.5 against the worst', () => {
    const t = answer(bestWorst, { kind: 'best-worst', best: 'gig', worst: 'spa' });
    expect(t.answered).toBe(1);
    expect(t.axes.nightlife).toEqual({ a: 2.5, b: 1 });
    expect(t.axes.chill).toEqual({ a: 1, b: 2.5 });
    expect(t.axes.adventure).toEqual({ a: 1, b: 1 });
    expect(t.style.mornings).toEqual({ sum: 0, weight: 1 });
    expect(t.tags).toEqual({ 'live-music': 1.5, spa: -1 });
  });

  test('spectrum: the stop you pick counts; the stops you didn’t say nothing against', () => {
    const t = answer(spectrum, { kind: 'choose', optionIds: ['p3'] });
    expect(t.style.pace).toEqual({ sum: 0.75, weight: 1 });
    expect(t.axes.adventure).toEqual({ a: 1.75, b: 1 });
    for (const axis of Object.keys(t.axes) as (keyof Taste['axes'])[]) expect(t.axes[axis].b).toBe(1);
  });

  test('unknown option ids are ignored, and a reply with none counts as unanswered', () => {
    const t = answer(pick, { kind: 'choose', optionIds: ['zzz'] });
    expect(t).toEqual(emptyTaste());
  });
});

describe('skips, speed and replays', () => {
  test('a skip adds nothing at all', () => {
    for (const card of [swipe, thisOrThat, pick, multi, bestWorst, spectrum]) expect(answer(card, { kind: 'skip' })).toEqual(emptyTaste());
  });

  test('snap decisions count a little more, long hesitations a little less', () => {
    expect(speedWeight(0)).toBe(1);
    expect(speedWeight(NaN)).toBe(1);
    expect(speedWeight(900)).toBe(1.15);
    expect(speedWeight(4000)).toBe(1);
    expect(speedWeight(9000)).toBe(0.8);
    expect(answer(swipe, { kind: 'swipe', verdict: 'like' }, 900).axes.adventure.a).toBe(2.15);
    expect(answer(swipe, { kind: 'swipe', verdict: 'like' }, 9000).axes.adventure.a).toBe(1.8);
  });

  test('scoreAnswers replays a list from scratch, ignores unknown cards and never mutates its base', () => {
    const cards = { [swipe.id]: swipe, [pick.id]: pick };
    const base = scoreAnswers(cards, [{ cardId: swipe.id, reply: { kind: 'swipe', verdict: 'like' }, ms: MS }]);
    const before = structuredClone(base);
    const t = scoreAnswers(cards, [
      { cardId: 'nope:unknown', reply: { kind: 'swipe', verdict: 'love' }, ms: MS },
      { cardId: pick.id, reply: { kind: 'choose', optionIds: ['b'] }, ms: MS },
    ], base);
    expect(base).toEqual(before);
    expect(t.answered).toBe(2);
    expect(t.axes.adventure).toEqual({ a: 2, b: 1 });
    expect(t.axes.chill).toEqual({ a: 2, b: 1 });
  });
});

describe('reading a taste', () => {
  test('confidence is 0 without evidence and 0.5 after four cards’ worth', () => {
    expect(axisConfidence({ a: 1, b: 1 })).toBe(0);
    expect(axisConfidence({ a: 4, b: 2 })).toBe(0.5);
    expect(styleValue(undefined)).toBe(0.5);
  });

  test('tasteFromVibe treats an old six-number vibe as about four cards of evidence', () => {
    const t = tasteFromVibe({ adventure: 0.75, food: 1.4, chill: Number.NaN, culture: 'x' as unknown as number });
    expect(t.axes.adventure).toEqual({ a: 4, b: 2 });
    expect(t.axes.food).toEqual({ a: 5, b: 1 });
    expect(t.axes.chill).toEqual({ a: 1, b: 1 });
    expect(t.axes.culture).toEqual({ a: 1, b: 1 });
    near(vibeOf(t).adventure, 0.67, 'adventure');
    expect(confidenceOf(t).adventure).toBe(0.5);
    expect(t.answered).toBe(0);
  });

  test('personaFor names you from your two strongest axes and only badges the style you were clear about', () => {
    const cards = Object.fromEntries(CORE_DECK.map(c => [c.id, c]));
    const t = scoreAnswers(cards, [
      { cardId: 'core:paragliding', reply: { kind: 'swipe', verdict: 'love' }, ms: MS },
      { cardId: 'core:sunrise-hilltop', reply: { kind: 'swipe', verdict: 'love' }, ms: MS },
      { cardId: 'core:street-food', reply: { kind: 'swipe', verdict: 'love' }, ms: MS },
      { cardId: 'core:alarm', reply: { kind: 'choose', optionIds: ['five'] }, ms: MS },
    ]);
    const persona = personaFor(t);
    expect(persona.top).toEqual(['adventure', 'food']);
    expect(persona.name).toBe('The Thrill-Seeking Foodie');
    assert.ok(persona.badges.includes('Early bird'), persona.badges.join(', '));
    expect(persona.badges.includes('Splurger')).toBe(false);

    // One half-weight vote is not enough to call it (style confidence 0.2 < 0.3)
    const unsure = applyAnswer(emptyTaste(), swipe, { kind: 'swipe', verdict: 'like' }, MS);
    expect(personaFor(unsure).badges).toEqual([]);
  });

  test('the diet card sets the diet and hard noes collect deal-breakers once each', () => {
    const cards = Object.fromEntries(CORE_DECK.map(c => [c.id, c]));
    const t = scoreAnswers(cards, [
      { cardId: 'core:diet', reply: { kind: 'choose', optionIds: ['veg'] }, ms: MS },
      { cardId: 'core:hard-no', reply: { kind: 'choose', optionIds: ['water', 'heights'] }, ms: MS },
      { cardId: 'core:hard-no', reply: { kind: 'choose', optionIds: ['water'] }, ms: MS },
    ]);
    expect(t.diet).toBe('veg');
    expect(t.dealbreakers).toEqual(['water', 'heights']);

    const easy = scoreAnswers(cards, [{ cardId: 'core:hard-no', reply: { kind: 'choose', optionIds: ['none', 'water'] }, ms: MS }]);
    expect(easy.dealbreakers).toEqual([]);
    expect(easy.answered).toBe(1);
    expect(easy.diet).toBe(null);
  });
});
