import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { labelFor, levelAt } from '../../src/heritage/crowd.ts';
import { SITE_BY_ID, SITES } from '../../src/heritage/sites.ts';
import {
  CAPACITY_PER_HOUR, DWELL_MINUTES, FIRST_HOUR, HOURS, alternativeSiteFor, alternativeTimeFor, baselineFor, buildForecast, defaultWindow,
  distanceKm, overlapHours, peakInWindow, reachOf, reliefOf, shownPeople, shownSquads, type PlannedStop,
} from '../../src/ops/forecast.ts';
import { sampleStops } from '../../src/ops/sample.ts';

const WEEKDAY = '2026-11-12';
const at = (hour: number, minute = 0) => hour * 60 + minute;
const stop = (squad: string, siteId: string, minutes: number, people = 5, sample = false): PlannedStop => ({ squad, siteId, minutes, people, sample });
/** n squads of `people` arriving together */
const group = (siteId: string, minutes: number, n: number, people = 5, prefix = siteId): PlannedStop[] =>
  Array.from({ length: n }, (_, i) => stop(`${prefix}-${minutes}-${i}`, siteId, minutes, people));
const forecast = (stops: PlannedStop[], date = WEEKDAY) => buildForecast('Udaipur', date, null, stops);
const site = (stops: PlannedStop[], id: string, date = WEEKDAY) => forecast(stops, date).sites.find(s => s.id === id)!;
const cell = (stops: PlannedStop[], id: string, hour: number, date = WEEKDAY) => site(stops, id, date).hours[hour - FIRST_HOUR];

describe('the modelled baseline', () => {
  test('covers every site and the hours 6 AM to 9 PM, with nothing planned', () => {
    const f = forecast([]);
    expect(f.sites).toHaveLength(SITES.length);
    expect(f.hours).toEqual(HOURS);
    for (const s of f.sites) {
      expect(s.hours).toHaveLength(16);
      for (const c of s.hours) {
        expect(c.uplift).toBe(0);
        expect(c.level).toBe(c.baseline);
      }
    }
    expect(f.kpis.squads).toBe(0);
    expect(f.kpis.offPeakShare).toBe(null);
    expect(f.hotspots).toHaveLength(0);
  });

  test('matches the heritage curves: City Palace is closed at 8, quiet at opening, packed at noon', () => {
    const palace = (hour: number) => cell([], 'city-palace', hour);
    expect(palace(8).label).toBe('closed');
    expect(palace(8).level).toBe(null);
    expect(palace(9).baseline).toBe(levelAt(SITE_BY_ID.get('city-palace')!, at(9, 30), WEEKDAY));
    expect(palace(9).label).toBe('quiet');
    expect(palace(12).baseline).toBe(96);
    expect(palace(12).label).toBe('packed');
  });

  test('knows the lunch gap at Jagdish Temple and weekend and festival factors', () => {
    expect(cell([], 'jagdish-temple', 14).label).toBe('closed');
    expect(cell([], 'jagdish-temple', 15).label).toBe('closed');
    const weekday = baselineFor(SITE_BY_ID.get('city-palace')!, 10, WEEKDAY)!;
    expect(baselineFor(SITE_BY_ID.get('city-palace')!, 10, '2026-11-14')! > weekday).toBe(true);
    expect(forecast([], '2026-11-08').dayNote).toBe(null); // the note is passed in by the API, not guessed here
  });

  test('peak and best alternative hour: the best is the quietest, and City Palace opens at 9:30', () => {
    const palace = site([], 'city-palace');
    expect(palace.peak?.hour).toBe(12);
    expect(palace.best?.hour).toBe(9);
    expect(palace.best?.minutes).toBe(at(9, 30));
    expect(palace.best?.label).toBe('quiet');
  });
});

describe('what planned squads add', () => {
  test('a squad is weighed by its people and how long it stays: the documented uplift', () => {
    // 20 squads of 5 arrive together at 10:00 and stay two hours (Palace): 100 people in hours 10 and 11
    const stops = group('city-palace', at(10), 20);
    const expected = Math.round(100 / CAPACITY_PER_HOUR.Palace * 100);
    expect(expected).toBe(29);
    const ten = cell(stops, 'city-palace', 10);
    expect(ten.baseline).toBe(52);
    expect(ten.uplift).toBe(expected);
    expect(ten.level).toBe(81);
    expect(ten.label).toBe('busy');
    expect(ten.baselineLabel).toBe('moderate');
    expect(cell(stops, 'city-palace', 11).uplift).toBe(expected);
    expect(cell(stops, 'city-palace', 12).uplift).toBe(0);
    expect(cell(stops, 'city-palace', 9).uplift).toBe(0);
  });

  test('the projected level never goes above 100 and closed hours stay closed', () => {
    const stops = group('city-palace', at(11), 40, 10);
    expect(cell(stops, 'city-palace', 11).level).toBe(100);
    expect(cell(stops, 'city-palace', 18).level).toBe(null);
    expect(cell(group('city-palace', at(8), 10), 'city-palace', 8).level).toBe(null);
  });

  test('a visit that starts mid-hour spreads across the hours it overlaps', () => {
    const dwell = DWELL_MINUTES.Palace;
    expect(overlapHours(at(10, 30), dwell, 9)).toBe(0);
    expect(overlapHours(at(10, 30), dwell, 10)).toBe(0.5);
    expect(overlapHours(at(10, 30), dwell, 11)).toBe(1);
    expect(overlapHours(at(10, 30), dwell, 12)).toBe(0.5);
    expect(overlapHours(at(10, 30), dwell, 13)).toBe(0);
  });

  test('a temple visit is shorter than a palace visit', () => {
    const temple = cell(group('jagdish-temple', at(10), 10), 'jagdish-temple', 11);
    expect(temple.uplift).toBe(0); // 45 minutes: gone by 10:45
    expect(cell(group('jagdish-temple', at(10), 10), 'jagdish-temple', 10).uplift > 0).toBe(true);
  });

  test('counts arrivals per cell, site and city, and each squad once', () => {
    const stops = [...group('city-palace', at(10), 4, 6), stop('both', 'jagdish-temple', at(10), 8), stop('both', 'city-palace', at(11), 8)];
    const f = forecast(stops);
    expect(f.sites.find(s => s.id === 'city-palace')!.hours[10 - FIRST_HOUR].squads).toBe(4);
    expect(f.sites.find(s => s.id === 'city-palace')!.squads).toBe(5);
    expect(f.kpis.squads).toBe(5);
    // 4 squads of 6 and one squad of 8, counted once even though it has two stops
    expect(f.kpis.plannedVisitors).toBe(32);
    expect(f.byHour.find(h => h.hour === 10)!.squads).toBe(5);
  });
});

describe('privacy', () => {
  test('fewer than 3 squads show as "<3" and hide their people', () => {
    expect(shownSquads(0)).toBe(0);
    expect(shownSquads(1)).toBe('<3');
    expect(shownSquads(2)).toBe('<3');
    expect(shownSquads(3)).toBe(3);
    expect(shownPeople(2, 11)).toBe(null);
    expect(shownPeople(3, 17)).toBe(17);
    const two = cell(group('gulab-bagh', at(14), 2), 'gulab-bagh', 14);
    expect(two.squads).toBe('<3');
    expect(two.people).toBe(null);
    const three = cell(group('gulab-bagh', at(14), 3), 'gulab-bagh', 14);
    expect(three.squads).toBe(3);
    expect(three.people).toBe(15);
  });

  test('a city with only 2 planned squads shows "<3" in the KPIs too', () => {
    const f = forecast(group('gulab-bagh', at(14), 2));
    expect(f.kpis.squads).toBe('<3');
    expect(f.kpis.plannedVisitors).toBe(null);
  });

  test('squad handles never appear in the output', () => {
    const json = JSON.stringify(forecast([stop('trip-0f8e-secret', 'city-palace', at(10)), ...group('city-palace', at(10), 5)]));
    expect(json.includes('secret')).toBe(false);
    expect(json.includes('trip-')).toBe(false);
  });
});

describe('hotspots and KPIs', () => {
  test('a crowded window with squads heading in becomes a hotspot starting at the front of the crunch', () => {
    const f = forecast(group('city-palace', at(10), 12, 6));
    const palace = f.sites.find(s => s.id === 'city-palace')!;
    expect(palace.hotspot?.startMinutes).toBe(at(10));
    expect(palace.hotspot?.endMinutes).toBe(at(12));
    expect(palace.hotspot?.squads).toBe(12);
    expect(palace.hotspot?.people).toBe(72);
    expect(f.hotspots[0].siteId).toBe('city-palace');
    expect(f.kpis.hotspots).toBe(1);
    expect(f.sites[0].id).toBe('city-palace'); // sites that need attention lead the heatmap
  });

  test('fewer than 3 squads never make a hotspot', () => {
    expect(site(group('city-palace', at(11), 2), 'city-palace').hotspot).toBe(null);
  });

  test('the busiest slot and the share of visits that are already off-peak', () => {
    // 4 visits at a quiet garden in the afternoon, 4 at the palace at noon
    const f = forecast([...group('gulab-bagh', at(14), 4), ...group('city-palace', at(12), 4)]);
    expect(f.kpis.busiest?.siteId).toBe('city-palace');
    expect(f.kpis.busiest?.level).toBe(100);
    expect(f.kpis.offPeakShare).toBe(0.5);
  });

  test('reach counts squads starting a stop inside the window, and the end is exclusive', () => {
    const stops = [...group('city-palace', at(10), 3), ...group('city-palace', at(11, 30), 2), ...group('city-palace', at(12), 4), stop('x', 'jagdish-temple', at(10), 9)];
    const reach = reachOf(stops, 'city-palace', at(10), at(12));
    expect(reach.squads).toBe(5);
    expect(reach.people).toBe(25);
    expect(reach.includesSample).toBe(false);
    expect(reachOf([stop('s', 'city-palace', at(10), 4, true)], 'city-palace', at(10), at(12)).includesSample).toBe(true);
    expect(reliefOf(225)).toBe(68);
  });
});

describe('alternatives for an advisory', () => {
  test('a calm site for the whole window, near and preferably a lesser-known one', () => {
    const f = forecast(group('city-palace', at(10), 12));
    const alt = alternativeSiteFor(f, 'city-palace', at(10), at(12))!;
    expect(alt.id !== 'city-palace').toBe(true);
    expect(alt.level < 65).toBe(true);
    expect(['quiet', 'moderate'].includes(alt.label)).toBe(true);
    const origin = SITE_BY_ID.get('city-palace')!;
    expect(distanceKm(origin, SITE_BY_ID.get(alt.id)!) < 6).toBe(true);
  });

  test('never offers a site that is closed or busy during the window', () => {
    const f = forecast([]);
    // 6–8 PM: nearly every ghat, lake and haveli is busy or shut; whatever is offered must be calm throughout
    const alt = alternativeSiteFor(f, 'gangaur-ghat', at(18), at(20));
    if (alt) {
      const found = f.sites.find(s => s.id === alt.id)!;
      for (const h of [18, 19]) expect(found.hours[h - FIRST_HOUR].level !== null && found.hours[h - FIRST_HOUR].level! < 65).toBe(true);
    }
  });

  test('a calmer time at the same site is outside the window, calm, and no earlier than opening', () => {
    const f = forecast(group('city-palace', at(10), 12));
    const time = alternativeTimeFor(f, 'city-palace', at(10), at(12))!;
    expect(time.hour).toBe(9);
    expect(time.minutes).toBe(at(9, 30));
    expect(time.time).toBe('09:30 AM');
    expect(time.level < 65).toBe(true);
  });

  test('the default window is the hotspot, else two hours from the peak', () => {
    const crowded = site(group('city-palace', at(10), 12), 'city-palace');
    expect(defaultWindow(crowded)).toEqual({ startMinutes: at(10), endMinutes: at(12) });
    const plain = site([], 'city-palace');
    expect(defaultWindow(plain)).toEqual({ startMinutes: at(12), endMinutes: at(14) });
    expect(peakInWindow(plain, at(9), at(10))).toBe(plain.hours[9 - FIRST_HOUR].level);
    expect(peakInWindow(plain, at(6), at(8))).toBe(null); // closed throughout
  });
});

describe('sample squads (the demo layer)', () => {
  test('are deterministic, flagged as sample, and different on different days', () => {
    const a = sampleStops('Udaipur', '2026-11-02');
    const b = sampleStops('Udaipur', '2026-11-02');
    expect(a).toEqual(b);
    expect(a.every(s => s.sample)).toBe(true);
    expect(sampleStops('Udaipur', '2026-11-03').length === a.length && JSON.stringify(sampleStops('Udaipur', '2026-11-03')) === JSON.stringify(a)).toBe(false);
  });

  test('only visit open hours at known sites, with sensible squad sizes, and no squad is in two places at once', () => {
    const stops = sampleStops('Udaipur', '2026-11-02');
    const bySquad = new Map<string, PlannedStop[]>();
    for (const s of stops) {
      expect(SITE_BY_ID.has(s.siteId)).toBe(true);
      expect(s.people >= 4 && s.people <= 10).toBe(true);
      bySquad.set(s.squad, [...(bySquad.get(s.squad) ?? []), s]);
    }
    for (const visits of bySquad.values()) {
      const sorted = [...visits].sort((x, y) => x.minutes - y.minutes);
      expect(sorted.length <= 3).toBe(true);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i].minutes - sorted[i - 1].minutes >= 30).toBe(true);
    }
  });

  test('tomorrow at City Palace: the squads pile into 10–12 and it shows packed (the demo moment)', () => {
    const f = forecast(sampleStops('Udaipur', '2026-11-02'), '2026-11-02');
    const palace = f.sites.find(s => s.id === 'city-palace')!;
    expect(palace.hotspot?.startMinutes).toBe(at(10));
    expect(palace.hotspot?.endMinutes).toBe(at(12));
    expect(palace.hotspot?.label).toBe('packed');
    expect(palace.hotspot!.squads >= 30 && palace.hotspot!.squads <= 55).toBe(true);
    expect(f.hotspots[0].siteId).toBe('city-palace');
    // Without the squads that window is merely moderate at 10 and busy at 11; with them it tips over
    const baseline = forecast([], '2026-11-02').sites.find(s => s.id === 'city-palace')!;
    expect(labelFor(baseline.hours[10 - FIRST_HOUR].level)).toBe('moderate');
    expect(palace.hours[11 - FIRST_HOUR].label).toBe('packed');
    expect(f.kpis.offPeakShare! < 0.5).toBe(true);
  });

  test('lesser-known gems stay quiet', () => {
    const f = forecast(sampleStops('Udaipur', '2026-11-02'), '2026-11-02');
    for (const id of ['ahar-cenotaphs', 'badi-lake', 'vintage-cars']) {
      expect(f.sites.find(s => s.id === id)!.peak!.level < 65).toBe(true);
    }
  });
});
