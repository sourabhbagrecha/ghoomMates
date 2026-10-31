import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '../expect.ts';
import {
  FACTORS, allowedModes, defaultMode, estimateDistances, evaluateLeg, haversineKm, isMode, ownCabKg, squadKg, summarize, vehiclesFor, withRoutes,
  type Distances, type LegSpec,
} from '../../src/impact/emissions.ts';
import { isLakeCrossing, locate, type Place } from '../../src/impact/places.ts';

const near = (actual: number, expected: number, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

const place = (id: string, lat: number, lng: number, shore: Place['shore'] = null): Place => ({ id, name: id, lat, lng, siteId: null, shore });
const CITY_PALACE = place('city-palace', 24.5764, 73.6835, 'east');
const JAGDISH = place('jagdish-temple', 24.5797, 73.684);
const AMBRAI = place('ambrai-ghat', 24.5781, 73.6797, 'west');
const SHILPGRAM = place('shilpgram', 24.617, 73.644);

const spec = (from: Place, to: Place, distances = estimateDistances(from, to)): LegSpec =>
  ({ fromStopId: 'a', toStopId: 'b', dayNumber: 1, from, fromTitle: from.id, to, toTitle: to.id, distances });

describe('distances', () => {
  test('haversine between two palace-side sites', () => {
    near(haversineKm(CITY_PALACE, JAGDISH), 0.37, 0.02);
    expect(haversineKm(CITY_PALACE, CITY_PALACE)).toBe(0);
  });

  test('by road is longer than the straight line, and the Routes API replaces it when it answers', () => {
    const d = estimateDistances(CITY_PALACE, JAGDISH);
    near(d.walkKm, 0.46, 0.03);
    near(d.driveKm, 0.5, 0.03);
    expect(d.source).toBe('estimate');
    const real = withRoutes(d, { driveKm: 0.9, walkKm: 0.7 });
    expect([real.driveKm, real.walkKm, real.source]).toEqual([0.9, 0.7, 'routes']);
    // Nothing replaced: still an estimate
    expect(withRoutes(d, {}).source).toBe('estimate');
  });

  test('crossing Lake Pichola is short by boat and long the way round', () => {
    expect(isLakeCrossing(CITY_PALACE, AMBRAI)).toBe(true);
    expect(isLakeCrossing(CITY_PALACE, JAGDISH)).toBe(false);
    const d = estimateDistances(CITY_PALACE, AMBRAI);
    expect(d.lake).toBe(true);
    assert.ok(d.boatKm! < d.driveKm / 2, 'the boat should save more than half the distance');
    // The Routes API never overrides a lake crossing
    expect(withRoutes(d, { driveKm: 0.1 }).driveKm).toBe(d.driveKm);
  });
});

describe('which mode', () => {
  const at = (walkKm: number, driveKm = walkKm * 1.1): Distances => ({ walkKm, driveKm, boatKm: null, lake: false, source: 'estimate' });

  test('walk when short, an auto up to 7 km, a cab beyond, a boat across the lake', () => {
    expect(defaultMode(at(0.46))).toBe('walk');
    expect(defaultMode(at(1.19))).toBe('walk');
    expect(defaultMode(at(1.2))).toBe('auto');
    expect(defaultMode(at(6.9, 6.9))).toBe('auto');
    expect(defaultMode(at(7.5, 7.5))).toBe('cab');
    expect(defaultMode(estimateDistances(CITY_PALACE, AMBRAI))).toBe('boat');
  });

  test('only sensible modes are allowed', () => {
    expect(allowedModes(at(0.5))).toEqual(['walk', 'erickshaw', 'auto', 'cab']);
    // 4 km: too far to walk
    expect(allowedModes(at(4, 4))).toEqual(['erickshaw', 'auto', 'cab']);
    // 15 km: past an e-rickshaw's range
    expect(allowedModes(at(15, 15))).toEqual(['auto', 'cab']);
    // 60 km: a day trip is a cab
    expect(allowedModes(at(60, 60))).toEqual(['cab']);
    expect(allowedModes(estimateDistances(CITY_PALACE, AMBRAI))).toEqual(['walk', 'erickshaw', 'auto', 'cab', 'boat']);
  });

  test('mode names are validated', () => {
    expect(isMode('erickshaw')).toBe(true);
    expect(isMode('helicopter')).toBe(false);
    expect(isMode(null)).toBe(false);
  });
});

describe('emissions', () => {
  test('factors come from the cited sources', () => {
    expect(FACTORS.auto.kgPerVehicleKm).toBe(0.1135);
    expect(FACTORS.cab.kgPerVehicleKm).toBe(0.153);
    near(FACTORS.erickshaw.kgPerVehicleKm, 0.061 * 0.727, 1e-9);
    expect(FACTORS.walk.kgPerVehicleKm).toBe(0);
  });

  test('a squad fills as few vehicles as it can', () => {
    expect([vehiclesFor('cab', 6), vehiclesFor('auto', 6), vehiclesFor('erickshaw', 6), vehiclesFor('boat', 6), vehiclesFor('walk', 6)]).toEqual([2, 2, 2, 1, 0]);
    expect([vehiclesFor('cab', 4), vehiclesFor('cab', 5), vehiclesFor('auto', 4), vehiclesFor('erickshaw', 9)]).toEqual([1, 2, 2, 3]);
    expect(vehiclesFor('cab', 0)).toBe(1);
  });

  test('ten km for six mates: cabs, autos and e-rickshaws', () => {
    near(squadKg('cab', 10, 6), 3.06, 1e-9);
    near(squadKg('auto', 10, 6), 2.27, 1e-9);
    near(squadKg('erickshaw', 10, 6), 2 * 0.061 * 0.727 * 10, 1e-9);
    expect(squadKg('walk', 10, 6)).toBe(0);
    // Everyone in their own cab is the baseline
    near(ownCabKg(10, 6), 9.18, 1e-9);
  });

  test('switching a cab to an e-rickshaw cuts that ride by about 70%', () => {
    const cab = squadKg('cab', 10, 6);
    const rick = squadKg('erickshaw', 10, 6);
    near(1 - rick / cab, 0.71, 0.01);
  });
});

describe('legs', () => {
  test('a short hop defaults to a walk and costs nothing', () => {
    const leg = evaluateLeg(spec(CITY_PALACE, JAGDISH), 6, null)!;
    expect(leg.mode).toBe('walk');
    expect(leg.chosen).toBe(false);
    expect(leg.kg).toBe(0);
    near(leg.ownCabKg, 6 * 0.153 * 0.5, 0.02);
    // Two cabs for six mates, even for half a kilometre
    near(leg.options.cab.kg, 2 * 0.153 * leg.options.cab.km, 0.001);
    expect(leg.options.boat.allowed).toBe(false);
  });

  test('a pick the ride allows is used and marked as chosen; one it does not is ignored', () => {
    const lift = spec(CITY_PALACE, SHILPGRAM);
    const byRick = evaluateLeg(lift, 6, 'erickshaw')!;
    expect([byRick.mode, byRick.chosen, byRick.defaultMode]).toEqual(['erickshaw', true, 'cab']);
    assert.ok(byRick.kg < evaluateLeg(lift, 6, null)!.kg / 2);
    // Nine km is too far to walk, and there is no lake between these two
    const ignored = evaluateLeg(lift, 6, 'walk')!;
    expect([ignored.mode, ignored.chosen]).toEqual(['cab', false]);
    expect(evaluateLeg(lift, 6, 'boat')!.mode).toBe('cab');
  });

  test('two stops at the same place have no ride between them', () => {
    expect(evaluateLeg(spec(CITY_PALACE, { ...CITY_PALACE }), 6, null)).toBe(null);
  });

  test('options carry the whole squad’s numbers for every mode, so the app can switch instantly', () => {
    const leg = evaluateLeg(spec(CITY_PALACE, SHILPGRAM), 6, null)!;
    for (const mode of ['walk', 'erickshaw', 'auto', 'cab'] as const) {
      near(leg.options[mode].kg, squadKg(mode, leg.options[mode].km, 6), 1e-3);
    }
    expect(leg.options.walk.vehicles).toBe(0);
    expect(leg.options.cab.vehicles).toBe(2);
    assert.ok(leg.options.walk.minutes > leg.options.cab.minutes);
  });
});

describe('totals', () => {
  test('add up, compare with everyone in their own cab, and break down by mode', () => {
    const walk = evaluateLeg(spec(CITY_PALACE, JAGDISH), 6, null)!;
    const far = evaluateLeg({ ...spec(CITY_PALACE, SHILPGRAM), fromStopId: 'b', toStopId: 'c' }, 6, null)!;
    const footprint = summarize([walk, far], 6);
    near(footprint.totalKg, far.kg, 0.01);
    near(footprint.perPersonKg, far.kg / 6, 0.01);
    near(footprint.baselineKg, walk.ownCabKg + far.ownCabKg, 0.01);
    // The walk is free and the far ride is already a pair of cabs, so only the walk is saved
    near(footprint.savedKg, walk.ownCabKg + far.ownCabKg - far.kg, 0.01);
    expect(footprint.byMode.map(m => [m.mode, m.legs])).toEqual([['walk', 1], ['cab', 1]]);
    assert.ok(footprint.savedPct > 0 && footprint.savedPct < 100);
  });

  test('an e-rickshaw for the cab leg drops the footprint by a clear margin, and the sum of option numbers agrees', () => {
    const lift = { ...spec(CITY_PALACE, SHILPGRAM) };
    const before = summarize([evaluateLeg(lift, 6, null)!], 6);
    const afterLeg = evaluateLeg(lift, 6, 'erickshaw')!;
    const after = summarize([afterLeg], 6);
    assert.ok(after.totalKg < before.totalKg * 0.35);
    near(after.totalKg, afterLeg.options.erickshaw.kg, 0.005);
  });

  test('no rides, no footprint, no division by zero', () => {
    const none = summarize([], 6);
    expect([none.totalKg, none.baselineKg, none.savedPct, none.perPersonKg]).toEqual([0, 0, 0, 0]);
  });
});

describe('placing stops', () => {
  test('heritage sites first, then extra landmarks, then the hotel for a check-out', () => {
    expect(locate({ title: 'Sunset at Sajjangarh', place: '', tag: 'Culture' }, 'Udaipur')?.siteId).toBe('sajjangarh');
    const rooftop = locate({ title: 'Rooftop thali by Lal Ghat', place: 'Lal Ghat rooftops', tag: 'Food' }, 'Udaipur');
    expect([rooftop?.id, rooftop?.siteId]).toEqual(['lal-ghat', null]);
    const hotel = locate({ title: 'Check in at a lakeside haveli homestay', place: 'Lal Ghat, old city', tag: 'Stay' }, 'Udaipur')!;
    expect(hotel.id).toBe('lal-ghat');
    expect(locate({ title: 'Check out', place: '', tag: 'Stay' }, 'Udaipur', hotel)).toBe(hotel);
    // Not a Stay stop: no guessing
    expect(locate({ title: 'Head home', place: '', tag: 'Travel' }, 'Udaipur', hotel)).toBe(null);
  });

  test('specific places beat the generic old city, and aliases match whole words only', () => {
    expect(locate({ title: 'Lunch', place: 'Old city, near Bada Bazaar', tag: 'Food' }, 'Udaipur')?.id).toBe('bada-bazaar');
    expect(locate({ title: 'Mewari lunch', place: 'Old city', tag: 'Food' }, 'Udaipur')?.id).toBe('old-city');
    expect(locate({ title: 'Walk in Bahar colony', place: '', tag: 'Chill' }, 'Udaipur')).toBe(null);
    expect(locate({ title: 'Lunch at Ahar', place: '', tag: 'Food' }, 'Udaipur')?.id).toBe('ahar');
  });

  test('a trip to a city we have no places for places nothing', () => {
    expect(locate({ title: 'City Palace', place: '', tag: 'Culture' }, null)).toBe(null);
    expect(locate({ title: 'Pick up from the airport', place: '', tag: 'Travel' }, null)).toBe(null);
  });
});
