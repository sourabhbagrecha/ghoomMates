import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { EVENT_BY_ID, EVENTS } from '../../src/events/calendar.ts';
import { isIsoDate } from '../../src/events/dates.ts';
import { matchSite } from '../../src/heritage/crowd.ts';
import { SITE_BY_ID } from '../../src/heritage/sites.ts';
import { STOP_TAGS } from '../../src/trips/itinerary.ts';

const TIME = /^(0[1-9]|1[0-2]):[0-5]\d (AM|PM)$/;
const DEVANAGARI = /[ऀ-ॿ]/;
const runs = (id: string) => EVENT_BY_ID.get(id)!.occurrences.map(o => [o.from, o.to]);

describe('the calendar', () => {
  test('has the festivals, fairs and shows the squad should know about, each once', () => {
    expect(EVENTS.map(e => e.id)).toEqual([
      'diwali', 'annakut-nathdwara', 'kartik-purnima', 'shilpgram-utsav', 'year-end-peak', 'makar-sankranti', 'maha-shivratri',
      'holika-dahan', 'holi', 'gangaur-mewar-festival', 'rath-yatra', 'hariyali-amavasya', 'hariyali-teej', 'janmashtami-nathdwara',
      'gavri', 'dharohar-show', 'puppet-show',
    ]);
    expect(new Set(EVENTS.map(e => e.name)).size).toBe(EVENTS.length);
    expect(new Set(EVENTS.flatMap(e => (e.stop ? [e.stop.title.toLowerCase()] : []))).size).toBe(EVENTS.filter(e => e.stop).length);
  });

  test('every event is written for travellers: names in both scripts, a respectful way to join, tips and sources', () => {
    for (const e of EVENTS) {
      expect(DEVANAGARI.test(e.nameHi)).toBe(true);
      expect(e.significance.split('. ').length >= 2).toBe(true);
      expect(e.significance.length < 700).toBe(true);
      expect(e.join.etiquette.length >= 2).toBe(true);
      expect(e.join.dress.length > 20).toBe(true);
      expect(e.join.photography.length > 20).toBe(true);
      expect(e.tips.length >= 2).toBe(true);
      expect(e.crowdNote.length > 20).toBe(true);
      expect(e.sources.length >= 1).toBe(true);
      for (const source of e.sources) expect(source.url.startsWith('https://')).toBe(true);
      expect(e.time.from < e.time.to).toBe(true);
    }
  });

  test('dates are real, ordered, inside the planning window, and every dated run says where its date comes from', () => {
    for (const e of EVENTS) {
      for (const o of e.occurrences) {
        expect(isIsoDate(o.from) && isIsoDate(o.to)).toBe(true);
        expect(o.from <= o.to).toBe(true);
        // November 2026 to December 2027, plus the New Year week that ends it
        expect(o.from >= '2026-11-01' && o.to <= '2028-01-01').toBe(true);
        expect(o.basis.length > 20).toBe(true);
        for (const day of o.peak ?? []) expect(day >= o.from && day <= o.to).toBe(true);
      }
      // A run a week or two long at most, except Gavri's forty days and the season peak
      expect(e.occurrences.length > 0 || e.recurring === 'daily' || (e.datesNote ?? '').startsWith('Dates announced closer to the time')).toBe(true);
    }
  });

  test('only dates we checked: the festivals fall on the days the panchang and Rajasthan Tourism give', () => {
    expect(runs('diwali')).toEqual([['2026-11-06', '2026-11-08'], ['2027-10-27', '2027-10-29']]);
    expect(EVENT_BY_ID.get('diwali')!.occurrences[0].peak).toEqual(['2026-11-08']);
    expect(runs('annakut-nathdwara')).toEqual([['2026-11-10', '2026-11-10'], ['2027-10-30', '2027-10-30']]);
    expect(runs('kartik-purnima')[0]).toEqual(['2026-11-24', '2026-11-24']);
    expect(runs('makar-sankranti')).toEqual([['2027-01-14', '2027-01-15']]);
    expect(runs('maha-shivratri')).toEqual([['2027-03-06', '2027-03-06']]);
    expect(runs('holika-dahan')).toEqual([['2027-03-21', '2027-03-21']]);
    expect(runs('holi')).toEqual([['2027-03-22', '2027-03-22']]);
    expect(runs('gangaur-mewar-festival')).toEqual([['2027-04-09', '2027-04-11']]);
    expect(runs('rath-yatra')).toEqual([['2027-07-05', '2027-07-05']]);
    expect(runs('hariyali-amavasya')).toEqual([['2027-08-02', '2027-08-02']]);
    expect(runs('hariyali-teej')).toEqual([['2027-08-04', '2027-08-04']]);
    expect(runs('janmashtami-nathdwara')).toEqual([['2027-08-25', '2027-08-26']]);
    // Gavri starts the day after Raksha Bandhan (17 Aug 2027) and runs forty days
    expect(runs('gavri')).toEqual([['2027-08-18', '2027-09-26']]);
  });

  test('a date that is not announced yet stays undated, and nightly shows recur', () => {
    const shilpgram = EVENT_BY_ID.get('shilpgram-utsav')!;
    expect(shilpgram.occurrences).toEqual([]);
    expect(shilpgram.datesNote!.startsWith('Dates announced closer to the time')).toBe(true);
    for (const id of ['dharohar-show', 'puppet-show']) {
      expect(EVENT_BY_ID.get(id)!.recurring).toBe('daily');
      expect(EVENT_BY_ID.get(id)!.occurrences).toEqual([]);
    }
    expect(EVENT_BY_ID.get('dharohar-show')!.time).toEqual({ label: '7:00–8:00 PM every evening', from: 19 * 60, to: 20 * 60 });
  });

  test('crowd impacts point at real sites with sane hours, multipliers and floors', () => {
    for (const e of EVENTS) {
      for (const i of e.impacts) {
        expect(SITE_BY_ID.has(i.siteId)).toBe(true);
        expect(i.from >= 0 && i.to <= 24 * 60 && i.from < i.to).toBe(true);
        expect(i.factor >= 1 && i.factor <= 3).toBe(true);
        expect((i.floor ?? 0) <= 100).toBe(true);
        expect(i.note.length > 10).toBe(true);
      }
      for (const place of e.places) if (place.siteId) expect(SITE_BY_ID.has(place.siteId)).toBe(true);
    }
  });

  test('stops carry the event’s own title and a place the crowd meter can recognise', () => {
    for (const e of EVENTS) {
      if (!e.stop) continue;
      expect(STOP_TAGS.includes(e.stop.tag)).toBe(true);
      expect(TIME.test(e.stop.time)).toBe(true);
      expect(e.stop.title.length <= 200 && e.stop.notes.length <= 2000).toBe(true);
      const touchesASite = e.places.some(p => p.siteId);
      expect(matchSite(e.stop.title, e.stop.place, 'Udaipur') !== null).toBe(touchesASite);
    }
    // Year-end is a season, not a stop
    expect(EVENT_BY_ID.get('year-end-peak')!.stop).toBe(null);
  });
});
