import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '../expect.ts';
import { allocateSpotlights, axisOf, fairness, rebalance, squadBrief, squadProfile, type MemberVibe, type PlanStop, type Vibe } from '../../src/trips/vibe.ts';
import { withFairness } from '../../src/trips/itinerary.ts';

const vibe = (v: Partial<Vibe>): Vibe => ({ adventure: 0.5, food: 0.5, nightlife: 0.5, culture: 0.5, chill: 0.5, shops: 0.5, ...v });

// Two thrill-seekers and two chillers: the average is "medium everything"
const SPLIT_SQUAD: MemberVibe[] = [
  { name: 'Aarav', vibe: vibe({ adventure: 0.95, nightlife: 0.9, chill: 0.1, food: 0.7 }) },
  { name: 'Meera', vibe: vibe({ adventure: 0.9, nightlife: 0.8, chill: 0.15, food: 0.75 }) },
  { name: 'Riya', vibe: vibe({ adventure: 0.1, nightlife: 0.15, chill: 0.95, culture: 0.85, food: 0.8 }) },
  { name: 'Dev', vibe: vibe({ adventure: 0.15, nightlife: 0.1, chill: 0.9, culture: 0.9, food: 0.7 }) },
];

const stop = (tag: string, extra: Partial<PlanStop> = {}): PlanStop => ({ tag, ...extra });

describe('squadProfile', () => {
  test('keeps a split squad split instead of flattening it to the mean', () => {
    const profile = squadProfile(SPLIT_SQUAD)!;
    expect(profile.axes.adventure.class).toBe('split');
    expect(profile.axes.chill.class).toBe('split');
    expect(profile.axes.food.class).toBe('love');
    assert.ok(Math.abs(profile.blended.adventure - 0.53) < 0.01);
  });

  test('marks an axis someone dislikes and nobody loves as a veto', () => {
    const profile = squadProfile([
      { name: 'A', vibe: vibe({ shops: 0.1 }) },
      { name: 'B', vibe: vibe({ shops: 0.5 }) },
    ])!;
    expect(profile.axes.shops.class).toBe('veto');
  });

  test('returns null without quiz results', () => {
    expect(squadProfile([])).toBe(null);
  });
});

describe('allocateSpotlights', () => {
  test('gives every member a spotlight on every day of a 3-day, 4-member trip', () => {
    const plan = allocateSpotlights(squadProfile(SPLIT_SQUAD)!, 3);
    expect(plan).toHaveLength(3);
    for (const day of plan) {
      const served = new Set(day.flatMap(s => [...s.members, ...(s.split?.members ?? [])]));
      expect(served.size).toBe(4);
    }
  });

  test('turns a split axis into a split slot that serves the other camp', () => {
    const [day1] = allocateSpotlights(squadProfile(SPLIT_SQUAD)!, 1);
    const split = day1.find(s => s.split)!;
    assert.ok(split, 'expected a split slot');
    expect([...split.members, ...split.split!.members].sort()).toEqual(['Aarav', 'Dev', 'Meera', 'Riya']);
  });

  test('a solo traveller gets their own top axes', () => {
    const profile = squadProfile([{ name: 'Solo', vibe: vibe({ culture: 0.95, food: 0.9 }) }])!;
    const [day1] = allocateSpotlights(profile, 1);
    expect(day1.map(s => s.axis)).toEqual(['culture']);
  });

  test('the brief names vetoes and split slots for Gemini', () => {
    const profile = squadProfile(SPLIT_SQUAD)!;
    const brief = squadBrief(profile, allocateSpotlights(profile, 2));
    assert.match(brief, /SPLIT slot/);
    assert.match(brief, /Aarav and Meera dislike chill/);
    assert.match(brief, /Day 2:/);
  });
});

describe('confidence weighting', () => {
  const sure = (v: number): Partial<Vibe> => ({ adventure: v, food: v, nightlife: v, culture: v, chill: v, shops: v });

  test('a member we barely know counts a little towards the mean and not at all towards the range', () => {
    const profile = squadProfile([
      { name: 'Known', vibe: vibe({ adventure: 0.9 }), confidence: sure(0.8) },
      { name: 'New', vibe: vibe({ adventure: 0.1 }), confidence: sure(0.05) },
    ])!;
    // weights 0.8 and the 0.15 floor: (0.9·0.8 + 0.1·0.15) / 0.95
    assert.ok(Math.abs(profile.axes.adventure.mean - 0.77) < 0.01, `mean was ${profile.axes.adventure.mean}`);
    expect(profile.axes.adventure.min).toBe(0.9);
    expect(profile.axes.adventure.class).toBe('love');
    // Without confidence the same two members are split
    expect(squadProfile([{ name: 'Known', vibe: vibe({ adventure: 0.9 }) }, { name: 'New', vibe: vibe({ adventure: 0.1 }) }])!.axes.adventure.class).toBe('split');
  });

  test('full confidence is the same as none', () => {
    const withConfidence = SPLIT_SQUAD.map(m => ({ ...m, confidence: sure(1) }));
    expect(squadProfile(withConfidence)!.axes).toEqual(squadProfile(SPLIT_SQUAD)!.axes);
  });

  test('when nobody is sure enough, everyone sets the range', () => {
    const profile = squadProfile([
      { name: 'A', vibe: vibe({ shops: 0.1 }), confidence: sure(0.1) },
      { name: 'B', vibe: vibe({ shops: 0.6 }), confidence: sure(0.2) },
    ])!;
    expect(profile.axes.shops.min).toBe(0.1);
    expect(profile.axes.shops.max).toBe(0.6);
  });

  test('allocateSpotlights takes the slots per day from the group pace', () => {
    // Everyone loves a different axis, and nothing is split, so each spotlight serves one member
    const low = { adventure: 0.55, food: 0.55, nightlife: 0.55, culture: 0.55, chill: 0.55, shops: 0.55 };
    const profile = squadProfile([
      { name: 'A', vibe: { ...low, adventure: 0.95 } },
      { name: 'B', vibe: { ...low, food: 0.95 } },
      { name: 'C', vibe: { ...low, culture: 0.95 } },
      { name: 'D', vibe: { ...low, shops: 0.95 } },
    ])!;
    // One slot a day is left for the whole group
    expect(allocateSpotlights(profile, 1, 3)[0]).toHaveLength(2);
    expect(allocateSpotlights(profile, 1, 5)[0]).toHaveLength(4);
  });
});

describe('fairness and rebalance', () => {
  test('axisOf falls back to the tag and ignores logistics', () => {
    expect(axisOf(stop('Culture'))).toBe('culture');
    expect(axisOf(stop('Travel'))).toBe(null);
    expect(axisOf(stop('Food', { axis: 'group' }))).toBe('food');
  });

  test('in a split slot each member is scored on the option that suits them', () => {
    const profile = squadProfile(SPLIT_SQUAD)!;
    const plan = [{ slots: [[stop('Adventure', { split: true }), stop('Chill', { split: true })]] }];
    const result = fairness(plan, profile);
    assert.ok(result.min >= 0.9, `min was ${result.min}`);
  });

  test('demotes a whole-group pick someone dislikes', () => {
    const profile = squadProfile(SPLIT_SQUAD)!;
    const { days } = rebalance([{ slots: [[stop('Nightlife'), stop('Food')]] }], profile);
    expect(days[0].slots[0][0].tag).toBe('Food');
  });

  test('never lowers the least-served member and leaves split slots alone', () => {
    const profile = squadProfile(SPLIT_SQUAD)!;
    const plan = [{
      slots: [
        [stop('Adventure'), stop('Culture')],
        [stop('Nightlife', { split: true }), stop('Chill', { split: true })],
        [stop('Shops'), stop('Food')],
        [stop('Adventure'), stop('Chill')],
      ],
    }];
    const before = fairness(plan, profile);
    const { days, fairness: after } = rebalance(plan, profile);
    assert.ok(after.min >= before.min);
    expect(days[0].slots[1][0].tag).toBe('Nightlife');
    // The input plan is not mutated
    expect(plan[0].slots[0][0].tag).toBe('Adventure');
  });

  test('withFairness adds scores and a squad summary, or nulls without quiz results', () => {
    const draft = { days: [{ title: 'Day 1', slots: [[{ time: '', title: 'Bar', tag: 'Nightlife', place: '', notes: '' }]] }], tip: '', source: 'template' as const };
    const withScores = withFairness(draft, squadProfile(SPLIT_SQUAD));
    expect(withScores.fairness!.members).toHaveLength(4);
    expect(withScores.squad!.sharedLoves).toEqual(['food']);
    expect(withFairness(draft, null).fairness).toBe(null);
  });
});
