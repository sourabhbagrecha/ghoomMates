import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '../expect.ts';
import { crowdSmart, dateOfDay } from '../../src/impact/crowd.ts';
import { estimateDistances, evaluateLeg, type Leg, type LegSpec } from '../../src/impact/emissions.ts';
import { classify, classifyByRules, leftovers, localSpend, normaliseDescription, type AiAnswers, type ExpenseRow } from '../../src/impact/local.ts';
import type { Place } from '../../src/impact/places.ts';
import { PLEDGES, summarisePledges } from '../../src/impact/pledges.ts';
import { buildReport, legKey, legSpecs } from '../../src/impact/report.ts';
import { badgeFor, scoreOf } from '../../src/impact/score.ts';
import { pickSwaps } from '../../src/impact/swaps.ts';
import { PLAN, SQUAD, TRIP, stop, stopId } from './fixtures.ts';

const near = (actual: number, expected: number, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

describe('crowd-hours avoided', () => {
  const crowd = crowdSmart(PLAN, { city: 'Udaipur', startDate: TRIP.startDate, squad: 6 });

  test('only timed heritage visits count: meals, hotels and unknown places are left out', () => {
    // City Palace ×2, Jagdish Temple, Sajjangarh, Shilpgram; the dal baati lunch and the dinner are Food
    expect(crowd.heritageStops).toBe(5);
    expect(crowd.visits.map(v => v.siteId)).toEqual(['city-palace', 'jagdish-temple', 'sajjangarh', 'shilpgram', 'city-palace']);
  });

  test('opening time at the City Palace dodges more than half of the peak crowd', () => {
    const opening = crowd.visits[0];
    expect([opening.label, opening.level, opening.peak]).toEqual(['quiet', 39, 96]);
    expect(opening.avoidedPct).toBe(59);
    // Six mates × 2 hours at the palace × 59% of the rush avoided
    near(opening.crowdHours, 7.1, 0.05);
  });

  test('the noon rush earns nothing and says where to move', () => {
    const noon = crowd.visits[4];
    expect([noon.label, noon.avoidedPct, noon.crowdHours]).toEqual(['packed', 0, 0]);
    // The heritage module's nudge: a quiet site with the same feel (Ahar's cenotaphs) beats a 10 AM palace queue
    assert.ok(noon.better && noon.better.extraCrowdHours > 4, 'taking the nudge is worth several crowd-hours');
    expect(noon.better?.type).toBe('swap');
    assert.match(crowd.tip ?? '', /^Try Ahar cenotaphs instead of City Palace at 12:00 PM/);
    // Peak or closed at the planned time: Jagdish Temple at 11, Sajjangarh at 4 PM, Shilpgram before it opens, the palace at noon
    expect(crowd.peakVisits).toBe(4);
    expect(crowd.visits.map(v => v.label)).toEqual(['quiet', 'packed', 'busy', 'closed', 'packed']);
  });

  test('totals', () => {
    expect(crowd.quietVisits).toBe(crowd.visits.filter(v => v.label === 'quiet').length);
    assert.ok(crowd.offPeakVisits >= crowd.quietVisits && crowd.offPeakVisits <= crowd.heritageStops);
    near(crowd.crowdHoursAvoided, crowd.visits.reduce((sum, v) => sum + v.crowdHours, 0), 0.06);
  });

  test('a bigger squad dodges proportionally more', () => {
    const two = crowdSmart(PLAN, { city: 'Udaipur', startDate: TRIP.startDate, squad: 2 });
    near(crowd.crowdHoursAvoided / two.crowdHoursAvoided, 3, 0.15);
  });

  test('no heritage city, no stops, or no times: nothing to count', () => {
    expect(crowdSmart(PLAN, { city: null, startDate: null, squad: 6 }).heritageStops).toBe(0);
    expect(crowdSmart([], { city: 'Udaipur', startDate: null, squad: 6 }).crowdHoursAvoided).toBe(0);
    expect(crowdSmart([stop(1, 1, '', 'City Palace', 'Culture')], { city: 'Udaipur', startDate: null, squad: 6 }).heritageStops).toBe(0);
  });

  test('dates of trip days', () => {
    expect(dateOfDay('2026-11-12', 1)).toBe('2026-11-12');
    expect(dateOfDay('2026-11-12', 3)).toBe('2026-11-14');
    expect(dateOfDay(null, 2)).toBe(null);
  });
});

describe('where the money went', () => {
  const kind = (description: string, category = 'other') => {
    const c = classifyByRules(description, category);
    return c && `${c.class}${c.local ? ':local' : ''}`;
  };

  test('keyword rules sort a typical Udaipur trip', () => {
    expect(kind('Dal baati churma lunch', 'food')).toBe('local-food:local');
    expect(kind('Chai and kachori at Jagdish Chowk')).toBe('local-food:local');
    expect(kind('Miniature painting at Hathi Pol')).toBe('local-artisan:local');
    expect(kind('Pottery workshop in Molela')).toBe('guide:local');
    expect(kind('Cooking class in a haveli kitchen')).toBe('guide:local');
    expect(kind('Haveli homestay, 3 nights', 'stays')).toBe('heritage-stay:local');
    expect(kind('Bagore ki Haveli', 'stays')).toBe('heritage-stay:local');
    expect(kind('City Palace tickets', 'fun')).toBe('entry-fees');
    expect(kind('Boat ride tickets', 'fun')).toBe('entry-fees');
    expect(kind('Auto to Bagore ki Haveli', 'travel')).toBe('transport:local');
    expect(kind('E-rickshaw to Fateh Sagar', 'travel')).toBe('transport:local');
    expect(kind('Cab to Shilpgram', 'travel')).toBe('transport:local');
  });

  test('chains, ride apps, trains and fuel are not counted as local', () => {
    expect(kind('Dinner at Taj Lake Palace')).toBe('other');
    expect(kind('Domino’s pizza')).toBe('other');
    expect(kind('Ola airport drop', 'travel')).toBe('transport');
    expect(kind('IRCTC train tickets', 'travel')).toBe('transport');
    expect(kind('Petrol for the rental car', 'travel')).toBe('transport');
  });

  test('what the rules can’t place is left for Gemini', () => {
    expect(kind('Misc')).toBe(null);
    expect(kind('Shopping')).toBe(null);
    // "Haveli" alone only means a stay when it was logged as one
    expect(kind('Haveli visit', 'fun')).toBe(null);
  });

  const rows: ExpenseRow[] = [
    { id: '1', description: 'Dal baati churma lunch', amountPaise: 480_000, category: 'food' },
    { id: '2', description: 'City Palace tickets', amountPaise: 360_000, category: 'fun' },
    { id: '3', description: 'Miniature painting at Hathi Pol', amountPaise: 1_200_000, category: 'other' },
    { id: '4', description: 'Haveli homestay, 3 nights', amountPaise: 2_400_000, category: 'stays' },
    { id: '5', description: 'Cab to Shilpgram', amountPaise: 180_000, category: 'travel' },
    { id: '6', description: 'Ola airport drop', amountPaise: 90_000, category: 'travel' },
    { id: '7', description: 'Misc', amountPaise: 50_000, category: 'other' },
  ];

  test('₹ kept with local people, its share, and a breakdown that adds up', () => {
    const spend = localSpend(rows, new Map(), 'Udaipur');
    expect(spend.trackedPaise).toBe(4_760_000);
    // Food, the painting, the homestay and the cab; not the tickets, the Ola ride or the unknown
    expect(spend.keptPaise).toBe(480_000 + 1_200_000 + 2_400_000 + 180_000);
    expect(spend.sharePct).toBe(89);
    expect(spend.byClass.reduce((sum, c) => sum + c.paise, 0)).toBe(spend.trackedPaise);
    expect(spend.byClass.reduce((sum, c) => sum + c.keptPaise, 0)).toBe(spend.keptPaise);
    expect(spend.byClass[0].id).toBe('heritage-stay');
    expect(spend.byClass.find(c => c.id === 'entry-fees')?.keptPaise).toBe(0);
    expect(spend.items[0].description).toBe('Haveli homestay, 3 nights');
    expect(spend.estimated).toBe(0);
  });

  test('no expenses, no share', () => {
    const spend = localSpend([], new Map(), 'Udaipur');
    expect([spend.trackedPaise, spend.keptPaise, spend.sharePct, spend.byClass.length]).toEqual([0, 0, 0, 0]);
  });

  test('Gemini’s answers fill the gaps; without them an unlabelled meal in Udaipur is assumed local', () => {
    const unknown: ExpenseRow = { id: '9', description: 'Shopping', amountPaise: 100_000, category: 'other' };
    const meal: ExpenseRow = { id: '10', description: 'Zorba', amountPaise: 100_000, category: 'food' };
    const ai: AiAnswers = new Map([[normaliseDescription('Shopping'), { class: 'local-artisan', local: true }]]);
    expect(classify(unknown, ai, 'Udaipur')).toEqual({ class: 'local-artisan', local: true, by: 'gemini' });
    expect(classify(unknown, new Map(), 'Udaipur')).toEqual({ class: 'other', local: false, by: 'rule' });
    expect(classify(meal, new Map(), 'Udaipur')).toEqual({ class: 'local-food', local: true, by: 'assumed' });
    // Elsewhere that assumption isn't ours to make
    expect(classify(meal, new Map(), null).class).toBe('other');
    // Gemini can't turn a ticket into income
    const ticket: AiAnswers = new Map([[normaliseDescription('Shopping'), { class: 'entry-fees', local: true }]]);
    expect(classify(unknown, ticket, 'Udaipur').local).toBe(false);
    expect(leftovers([...rows, unknown, unknown, meal])).toEqual(['misc', 'shopping', 'zorba']);
  });
});

describe('pledges', () => {
  test('there are 6–8 Udaipur pledges with a reason each', () => {
    assert.ok(PLEDGES.length >= 6 && PLEDGES.length <= 8);
    for (const p of PLEDGES) assert.ok(p.title && p.why && p.icon, p.id);
    expect(new Set(PLEDGES.map(p => p.id)).size).toBe(PLEDGES.length);
  });

  test('each member ticks their own, in squad order', () => {
    const ids = SQUAD.map(m => m.memberId);
    const summary = summarisePledges([
      { pledgeId: 'refill', memberId: 'm3' }, { pledgeId: 'refill', memberId: 'm1' }, { pledgeId: 'no-flash', memberId: 'm2' },
    ], ids, 'm1');
    expect(summary.items.find(p => p.id === 'refill')!.ticks).toEqual(['m1', 'm3']);
    expect(summary.items.find(p => p.id === 'refill')!.mine).toBe(true);
    expect(summary.items.find(p => p.id === 'no-flash')!.mine).toBe(false);
    expect([summary.ticks, summary.possible, summary.mine, summary.squadSize]).toEqual([3, 6 * PLEDGES.length, 1, 6]);
    expect(summary.pct).toBe(Math.round((3 / (6 * PLEDGES.length)) * 100));
  });

  test('ticks from people who left the squad are ignored', () => {
    const summary = summarisePledges([{ pledgeId: 'refill', memberId: 'gone' }], ['m1'], 'm1');
    expect(summary.ticks).toBe(0);
  });
});

describe('score and badge', () => {
  const full = { legs: 5, savedPct: 85, heritageStops: 4, quietVisits: 4, offPeakVisits: 4, trackedPaise: 100, localPct: 60, pledgeTicks: 48, pledgePossible: 48 };

  test('four parts add up to at most 100', () => {
    const best = scoreOf(full);
    expect(best.total).toBe(100);
    expect(best.parts.map(p => p.max)).toEqual([30, 20, 25, 25]);
    expect(best.parts.reduce((sum, p) => sum + p.points, 0)).toBe(best.total);
    expect(best.badge.name).toBe('Mewar Steward');
    expect(best.badge.next).toBe(null);
  });

  test('nothing planned, nothing logged, nothing ticked is zero', () => {
    const none = scoreOf({ legs: 0, savedPct: 0, heritageStops: 0, quietVisits: 0, offPeakVisits: 0, trackedPaise: 0, localPct: 0, pledgeTicks: 0, pledgePossible: 0 });
    expect(none.total).toBe(0);
    expect(none.badge.name).toBe('Ghat Visitor');
  });

  test('moderate-hour visits earn a little less than quiet ones, and pledges move the needle', () => {
    const quiet = scoreOf(full).parts.find(p => p.id === 'crowd')!.points;
    const moderate = scoreOf({ ...full, quietVisits: 0 }).parts.find(p => p.id === 'crowd')!.points;
    assert.ok(moderate < quiet && moderate > 0);
    assert.ok(scoreOf({ ...full, pledgeTicks: 0 }).total === 75);
  });

  test('badge levels and the distance to the next one', () => {
    expect(badgeFor(0).name).toBe('Ghat Visitor');
    expect(badgeFor(29).next).toEqual({ name: 'Pol Walker', at: 30, toGo: 1 });
    expect(badgeFor(30).name).toBe('Pol Walker');
    expect(badgeFor(54).name).toBe('Pol Walker');
    expect(badgeFor(55).name).toBe('Lake Guardian');
    expect(badgeFor(79).next?.name).toBe('Mewar Steward');
    expect(badgeFor(80).level).toBe(4);
  });
});

describe('swaps', () => {
  const place = (id: string, lat: number, lng: number, shore: Place['shore'] = null): Place => ({ id, name: id, lat, lng, siteId: null, shore });
  const leg = (a: Place, b: Place, mode: Leg['mode'] | null, n = 1): Leg => {
    const spec: LegSpec = { fromStopId: stopId(n), toStopId: stopId(n + 100), dayNumber: 1, from: a, fromTitle: a.id, to: b, toTitle: b.id, distances: estimateDistances(a, b) };
    return evaluateLeg(spec, 6, mode)!;
  };
  const CITY_PALACE = place('City Palace', 24.5764, 73.6835, 'east');
  const JAGDISH = place('Jagdish Temple', 24.5797, 73.684);
  const AMBRAI = place('Ambrai Ghat', 24.5781, 73.6797, 'west');
  const SAJJANGARH = place('Sajjangarh', 24.5946, 73.642);
  const NO_CROWD = crowdSmart([], { city: 'Udaipur', startDate: null, squad: 6 });

  test('walk a short hop: names the places, the distance and the saving', () => {
    const swaps = pickSwaps({ legs: [leg(CITY_PALACE, JAGDISH, 'cab')], crowd: NO_CROWD, stops: [], artisanPaise: 0 });
    expect(swaps).toHaveLength(1);
    expect(swaps[0].kind).toBe('walk');
    assert.match(swaps[0].text, /^Walk City Palace → Jagdish Temple: 4\d0 m through the old city, \d+ min\. Saves 0\.\d kg\.$/);
    expect(swaps[0].action).toEqual({ type: 'mode', fromStopId: stopId(1), toStopId: stopId(101), mode: 'walk' });
    near(swaps[0].savesKg, 0.15, 0.03);
  });

  test('an e-rickshaw for a long ride', () => {
    const swaps = pickSwaps({ legs: [leg(JAGDISH, SAJJANGARH, 'auto')], crowd: NO_CROWD, stops: [], artisanPaise: 0 });
    expect(swaps[0].kind).toBe('erickshaw');
    assert.match(swaps[0].text, /^Take an e-rickshaw instead of an auto for Jagdish Temple → Sajjangarh: saves \d\.\d kg, 6\d% less on this ride\.$/);
  });

  test('a boat across the lake beats the long way round', () => {
    const swaps = pickSwaps({ legs: [leg(CITY_PALACE, AMBRAI, 'cab')], crowd: NO_CROWD, stops: [], artisanPaise: 0 });
    // The boat saves the most on this ride (walking round the lake is too long to suggest)
    expect(swaps[0].kind).toBe('boat');
    assert.match(swaps[0].text, /Cross Pichola by boat/);
    expect(leg(CITY_PALACE, AMBRAI, null).mode).toBe('boat');
  });

  test('already the greenest choice: nothing to suggest', () => {
    const swaps = pickSwaps({ legs: [leg(CITY_PALACE, JAGDISH, 'walk'), leg(CITY_PALACE, AMBRAI, null, 2)], crowd: NO_CROWD, stops: [], artisanPaise: 0 });
    expect(swaps).toHaveLength(0);
  });

  test('at most three, best ride first, then a quieter hour, and a buy-direct nudge only when nothing is logged', () => {
    const crowd = crowdSmart(PLAN, { city: 'Udaipur', startDate: TRIP.startDate, squad: 6 });
    const legs = [leg(CITY_PALACE, JAGDISH, 'cab', 1), leg(JAGDISH, SAJJANGARH, 'cab', 2), leg(CITY_PALACE, SAJJANGARH, 'auto', 3), leg(CITY_PALACE, AMBRAI, 'cab', 4)];
    const swaps = pickSwaps({ legs, crowd, stops: [{ title: 'Shilpgram', tag: 'Shops' }], artisanPaise: 0 });
    expect(swaps).toHaveLength(3);
    expect(swaps.map(s => s.kind)[1]).toBe('crowd');
    assert.ok(swaps[0].savesKg >= swaps[2].savesKg);
    const noLegs = pickSwaps({ legs: [], crowd: NO_CROWD, stops: [{ title: 'Shilpgram', tag: 'Shops' }], artisanPaise: 0 });
    expect(noLegs.map(s => s.kind)).toEqual(['local']);
    expect(pickSwaps({ legs: [], crowd: NO_CROWD, stops: [{ title: 'Shilpgram', tag: 'Shops' }], artisanPaise: 100 })).toHaveLength(0);
  });
});

describe('the report', () => {
  const base = {
    trip: TRIP, members: SQUAD, me: 'm1', stops: PLAN, picks: new Map(), ticks: [], expenses: [], ai: new Map() as AiAnswers,
  };

  test('rides are measured between consecutive placed stops of the same day', () => {
    const { specs, located } = legSpecs(PLAN, 'Udaipur');
    // 6 of the 7 stops are placed; the group dinner has no place
    expect(located).toBe(6);
    expect(specs.map(s => `${s.dayNumber}:${s.from.name} → ${s.to.name}`)).toEqual([
      '1:City Palace → Jagdish Temple',
      '1:Jagdish Temple → Jagdish Chowk',
      '1:Jagdish Chowk → Sajjangarh Monsoon Palace',
      '2:Shilpgram crafts village → City Palace',
    ]);
  });

  test('footprint: totals match the legs, with a per-person figure and a saving against solo cabs', () => {
    const report = buildReport(base);
    const fp = report.footprint;
    expect(report.squad.size).toBe(6);
    expect(fp.days.map(d => [d.number, d.legs.length, d.stops])).toEqual([[1, 3, 4], [2, 1, 3]]);
    near(fp.totalKg, fp.days.flatMap(d => d.legs).reduce((sum, l) => sum + l.kg, 0), 0.011);
    near(fp.perPersonKg, fp.totalKg / 6, 0.01);
    assert.ok(fp.savedPct > 30 && fp.savedPct < 100, `${fp.savedPct}% saved`);
    expect(fp.located).toEqual({ stops: 6, total: 7 });
    expect(fp.source).toBe('estimate');
    expect(fp.days[0].title).toBe('Palaces first');
    expect(fp.days[0].date).toBe('2026-11-12');
    expect(report.footprint.days.flatMap(d => d.legs).map(l => l.index)).toEqual([0, 1, 2, 3]);
  });

  test('the squad’s pick for a ride replaces the default and lowers the footprint', () => {
    const before = buildReport(base);
    const cab = before.footprint.days[1].legs[0];
    expect(cab.mode).toBe('cab');
    const picks = new Map([[legKey(cab.fromStopId, cab.toStopId), 'erickshaw' as const]]);
    const after = buildReport({ ...base, picks });
    const swapped = after.footprint.days[1].legs[0];
    expect([swapped.mode, swapped.chosen, swapped.defaultMode]).toEqual(['erickshaw', true, 'cab']);
    assert.ok(after.footprint.totalKg < before.footprint.totalKg);
    near(before.footprint.totalKg - after.footprint.totalKg, cab.kg - cab.options.erickshaw.kg, 0.011);
    // The e-rickshaw swap no longer offered for that ride
    assert.ok(!after.swaps.some(s => s.id === `erickshaw:${cab.fromStopId}:${cab.toStopId}`));
  });

  test('a stale pick that no longer fits the ride falls back to the default', () => {
    const { specs } = legSpecs(PLAN, 'Udaipur');
    const far = specs[3];
    const picks = new Map([[legKey(far.fromStopId, far.toStopId), 'walk' as const]]);
    const leg = buildReport({ ...base, picks }).footprint.days[1].legs[0];
    expect([leg.mode, leg.chosen]).toEqual(['cab', false]);
  });

  test('routes distances from the Routes API are used and reported', () => {
    const { specs } = legSpecs(PLAN, 'Udaipur');
    const far = specs[3];
    const routes = new Map([[legKey(far.fromStopId, far.toStopId), { driveKm: 20, walkKm: 18 }]]);
    const report = buildReport({ ...base, routes });
    const leg = report.footprint.days[1].legs[0];
    expect(leg.options.cab.km).toBe(20);
    expect(leg.distanceSource).toBe('routes');
    expect(report.footprint.source).toBe('mixed');
  });

  test('crowd, local spend, pledges, score and swaps come with it', () => {
    const report = buildReport({
      ...base,
      expenses: [{ id: 'e1', description: 'Miniature painting at Hathi Pol', amountPaise: 500_000, category: 'other' }],
      ticks: [{ pledgeId: 'refill', memberId: 'm1' }],
    });
    expect(report.crowdSmart.heritageStops).toBe(5);
    expect(report.local.keptPaise).toBe(500_000);
    expect(report.local.sharePct).toBe(100);
    expect(report.local.classifier).toBe('rules');
    expect(report.pledges.mine).toBe(1);
    expect(report.score.parts.find(p => p.id === 'local')!.points).toBe(25);
    assert.ok(report.swaps.length >= 1 && report.swaps.length <= 3);
    expect(report.city).toBe('Udaipur');
    expect(report.method.sources).toHaveLength(3);
    expect(report.method.factors.cab.kgPerVehicleKm).toBe(0.153);
  });

  test('a trip elsewhere has no measured rides, but pledges and spending still count', () => {
    const goa = buildReport({ ...base, trip: { ...TRIP, destination: 'Goa' }, expenses: [{ id: 'e1', description: 'Fish thali', amountPaise: 100_000, category: 'food' }] });
    expect(goa.city).toBe(null);
    expect(goa.footprint.days.flatMap(d => d.legs)).toEqual([]);
    expect(goa.footprint.source).toBe('none');
    expect(goa.crowdSmart.heritageStops).toBe(0);
    expect(goa.local.keptPaise).toBe(100_000);
  });

  test('an empty trip is a valid, calm report', () => {
    const empty = buildReport({ ...base, stops: [] });
    expect(empty.footprint.totalKg).toBe(0);
    expect(empty.footprint.days).toEqual([]);
    expect(empty.swaps).toEqual([]);
    expect(empty.score.total).toBe(0);
  });
});
