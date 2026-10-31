import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { EXPERIENCES, asVibe, blendVibes, cityForDestination, rankExperiences, topAxes, type Vibe } from '../../src/voice/experiences.ts';
import { reasonLabel, vibeFor } from '../../src/voice/skills/experiences.ts';

const vibe = (scores: Partial<Vibe>): Vibe => ({ adventure: 0.2, food: 0.2, nightlife: 0.2, culture: 0.2, chill: 0.2, shops: 0.2, ...scores });
const adventurer = vibe({ adventure: 0.95, food: 0.7 });
const foodie = vibe({ food: 1, culture: 0.6 });

describe('cityForDestination', () => {
  test('matches a seeded city anywhere in the destination, case-insensitively', () => {
    expect(cityForDestination('Udaipur, Rajasthan')).toBe('Udaipur');
    expect(cityForDestination('north goa')).toBe('Goa');
  });
  test('anything else has no guide trips', () => {
    expect(cityForDestination('Manali')).toBe(null);
    expect(cityForDestination(null)).toBe(null);
  });
});

describe('vibes', () => {
  test('asVibe needs every axis and clamps to 0–1', () => {
    expect(asVibe({ adventure: 1 })).toBe(null);
    expect(asVibe('nope')).toBe(null);
    expect(asVibe({ ...adventurer, shops: 3 })?.shops).toBe(1);
  });
  test('blendVibes averages the quiz-takers and skips the rest', () => {
    expect(blendVibes([null, undefined, { food: 1 }])).toBe(null);
    expect(blendVibes([vibe({ food: 1 }), vibe({ food: 0 }), null])?.food).toBe(0.5);
  });
  test('topAxes is strongest first', () => {
    expect(topAxes(adventurer)).toEqual(['adventure', 'food']);
  });
});

describe('rankExperiences', () => {
  test('an adventurer in Goa gets the waterfall trek first', () => {
    const [top] = rankExperiences(adventurer, { city: 'Goa' });
    expect(top.experience.id).toBe('dudhsagar-spice-trek');
    expect(top.because[0]).toBe('adventure');
  });
  test('a foodie in Udaipur gets a food experience first', () => {
    const [top] = rankExperiences(foodie, { city: 'Udaipur' });
    expect(top.experience.tags.includes('Food')).toBe(true);
  });
  test('stays in the city and the tag', () => {
    const ranked = rankExperiences(adventurer, { city: 'Udaipur', tag: 'Nightlife' });
    expect(ranked.every(r => r.experience.city === 'Udaipur' && r.experience.tags.includes('Nightlife'))).toBe(true);
    expect(ranked.length > 0).toBe(true);
  });
  test('better fit ranks higher and matches are percentages', () => {
    const ranked = rankExperiences(adventurer, { city: 'Goa' });
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].match! >= ranked[i].match!).toBe(true);
    expect(ranked.every(r => r.match! >= 0 && r.match! <= 100)).toBe(true);
  });
  test('without a vibe it falls back to rating', () => {
    const ranked = rankExperiences(null, { city: 'Goa' });
    expect(ranked[0].match).toBe(null);
    expect(ranked[0].experience.rating).toBe(Math.max(...ranked.map(r => r.experience.rating)));
  });
});

describe('vibeFor', () => {
  const me = { memberId: 'm1', name: 'Asha Rao' };
  const members = (mine: unknown, theirs: unknown) => [
    { memberId: 'm1', userId: 'u1', name: 'Asha Rao', vibe: mine },
    { memberId: 'm2', userId: 'u2', name: 'Kabir', vibe: theirs },
  ];
  test("uses the speaker's quiz for 'me'", () => {
    expect(vibeFor({ me, members: members(adventurer, foodie) }, 'me')).toEqual({ vibe: adventurer, basis: 'you' });
  });
  test("falls back to the squad when the speaker hasn't taken the quiz", () => {
    expect(vibeFor({ me, members: members(null, foodie) }, 'me')).toEqual({ vibe: foodie, basis: 'squad' });
  });
  test("blends everyone for 'squad'", () => {
    expect(vibeFor({ me, members: members(adventurer, foodie) }, 'squad').basis).toBe('squad');
  });
  test('ranks by rating when nobody has taken the quiz', () => {
    expect(vibeFor({ me, members: members(null, undefined) }, 'me')).toEqual({ vibe: null, basis: 'rating' });
  });
});

test('reasonLabel', () => {
  expect(reasonLabel(['adventure', 'food', 'chill'])).toBe('Adventure + food');
  expect(reasonLabel([])).toBe('Top rated');
});

// The card on screen looks experiences up in the frontend catalogue by id, so both copies must agree.
test('the agent catalogue matches the frontend one', () => {
  const source = readFileSync(new URL('../../../frontend/src/pages/Explore/experiencesData.ts', import.meta.url), 'utf8');
  const frontend = [...source.matchAll(/\n {4}id: '([^']+)',\n {4}city: '([^']+)',[\s\S]*?\n {4}price: (\d+),/g)]
    .map(([, id, city, price]) => `${id} ${city} ${price}`)
    .sort();
  const agent = EXPERIENCES.map(e => `${e.id} ${e.city} ${e.priceRupees}`).sort();
  expect(agent).toEqual(frontend);
});
