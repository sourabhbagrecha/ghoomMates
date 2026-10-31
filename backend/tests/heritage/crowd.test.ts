import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { cityOf, crowdForStop, dayFactor, formatTime, labelFor, levelAt, liveCrowds, matchSite, suggestFor } from '../../src/heritage/crowd.ts';
import { SITE_BY_ID, SITES } from '../../src/heritage/sites.ts';
import { udaipurDraft } from '../../src/trips/itinerary.ts';

const site = (id: string) => SITE_BY_ID.get(id)!;
const at = (hour: number, minute = 0) => hour * 60 + minute;
const WEEKDAY = '2026-11-12';

describe('sites', () => {
  test('every alternative points at a real site and every curve covers 24 hours', () => {
    for (const s of SITES) {
      expect(s.curve).toHaveLength(24);
      for (const id of s.alternatives) expect(SITE_BY_ID.has(id)).toBe(true);
    }
  });
});

describe('matching stops to sites', () => {
  test('finds the site in the title, then the place', () => {
    expect(matchSite('Sunset at Sajjangarh', '', 'Udaipur')?.id).toBe('sajjangarh');
    expect(matchSite('Morning walk', 'Gulab Bagh', 'Udaipur')?.id).toBe('gulab-bagh');
    expect(matchSite('Lunch', 'Jagdish Chowk', 'Udaipur')).toBe(null);
  });
  test('only cities with crowd data', () => {
    expect(cityOf('Udaipur, Rajasthan')).toBe('Udaipur');
    expect(cityOf('Goa')).toBe(null);
  });
});

describe('levels', () => {
  test('closed hours have no level; midday City Palace is packed, opening time is quiet', () => {
    expect(levelAt(site('city-palace'), at(8), WEEKDAY)).toBe(null);
    expect(labelFor(levelAt(site('city-palace'), at(12), WEEKDAY))).toBe('packed');
    expect(labelFor(levelAt(site('city-palace'), at(9, 30), WEEKDAY))).toBe('quiet');
  });
  test('weekends and festivals are busier, summer is quieter', () => {
    expect(dayFactor('2026-11-14').factor > 1).toBe(true);
    expect(dayFactor('2026-11-08').reason).toBe('Diwali');
    expect(dayFactor('2027-05-12').factor < 1).toBe(true);
  });
  test('formats 12-hour times', () => {
    expect(formatTime(at(9, 30))).toBe('09:30 AM');
    expect(formatTime(at(12))).toBe('12:00 PM');
    expect(formatTime(at(18, 5))).toBe('06:05 PM');
  });
});

describe('nudges', () => {
  test('a quiet stop needs nothing', () => {
    expect(suggestFor(site('city-palace'), at(9, 30), WEEKDAY)).toBe(null);
  });
  test('a packed palace visit moves to opening time', () => {
    const nudge = suggestFor(site('city-palace'), at(12), WEEKDAY);
    expect(nudge?.type === 'shift' && nudge.minutes).toBe(at(9, 30));
  });
  test('a nudge never lands on another of the squad’s stops that day', () => {
    const nudge = suggestFor(site('city-palace'), at(12), WEEKDAY, [at(9, 30)]);
    expect(nudge === null || (nudge.type === 'shift' ? nudge.minutes !== at(9, 30) : nudge.level < 65)).toBe(true);
  });
  test('a sunset crush swaps to a quiet viewpoint with the same feel', () => {
    const nudge = suggestFor(site('sajjangarh'), at(18), WEEKDAY);
    expect(nudge?.type).toBe('swap');
    if (nudge?.type === 'swap') expect(site('sajjangarh').alternatives.includes(nudge.siteId)).toBe(true);
  });
  test('a stop at a closed hour moves into opening hours', () => {
    const nudge = suggestFor(site('jagdish-temple'), at(15), WEEKDAY);
    expect(nudge?.type).toBe('shift');
  });
});

describe('itinerary stops', () => {
  test('non-heritage stops and other cities get no crowd data', () => {
    expect(crowdForStop({ title: 'Check out', place: '', minutes: at(12) }, { city: 'Udaipur', date: WEEKDAY })).toBe(null);
    expect(crowdForStop({ title: 'City Palace', place: '', minutes: at(12) }, { city: null, date: WEEKDAY })).toBe(null);
  });
  test('the Udaipur template keeps every first-choice heritage stop out of the crowds', () => {
    const TIME = /^(\d{2}):(\d{2}) (AM|PM)$/;
    for (const day of udaipurDraft(4).days) {
      for (const [pick] of day.slots) {
        const [, h, m, p] = TIME.exec(pick.time)!;
        const minutes = (Number(h) % 12 + (p === 'PM' ? 12 : 0)) * 60 + Number(m);
        const crowd = crowdForStop({ title: pick.title, place: pick.place, minutes }, { city: 'Udaipur', date: WEEKDAY });
        if (crowd) expect(crowd.level !== null && crowd.level < 65).toBe(true);
      }
    }
  });
});

describe('live view', () => {
  test('lists every site with a level or closed, busiest first', () => {
    const live = liveCrowds('Udaipur', new Date('2026-11-12T12:30:00Z'));
    expect(live.time).toBe('06:00 PM');
    expect(live.sites).toHaveLength(SITES.length);
    const levels = live.sites.map(s => s.level ?? -1);
    expect(levels.every((l, i) => i === 0 || levels[i - 1] >= l)).toBe(true);
  });
});
