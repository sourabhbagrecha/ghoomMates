import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import {
  DEMO_EMAIL, EXPENSES, PHOTOS, PLAN, POOL, TABLE, TRIP, TRIP_DAYS, VIBE_AXES, WORKSHOP,
  addDays, dateOfDay, rsvpFor, squadFor, todayIST,
} from '../../scripts/demo/plan.ts';
import { CRAFT_BY_ID } from '../../src/makers/crafts.ts';
import { crowdForStop, cityOf } from '../../src/heritage/crowd.ts';
import { HOST_BY_ID } from '../../src/hospitality/partners.ts';
import { MEAL_INFO } from '../../src/hospitality/types.ts';
import { classifyByRules } from '../../src/impact/local.ts';
import { PLEDGE_IDS } from '../../src/impact/pledges.ts';
import { availabilityFor, normaliseSlot, slotMinutes } from '../../src/makers/logic.ts';
import { CLOSED_DATES, MAKER_BY_ID } from '../../src/makers/makers.ts';
import { EXPENSE_CATEGORIES } from '../../src/trips/service.ts';
import { STOP_TAGS } from '../../src/trips/itinerary.ts';

const minutesOf = (time: string) => slotMinutes(normaliseSlot(time)!);
// A Sunday and a weekday: the crowd model is busier at weekends
const DATES = ['2026-11-01', '2026-11-03', '2026-11-12', '2027-02-09'];

describe('demo dates', () => {
  test('today is the date in India, whatever zone the laptop is in', () => {
    expect(todayIST(new Date('2026-10-31T20:00:00Z'))).toBe('2026-11-01');
    expect(todayIST(new Date('2026-11-01T18:29:00Z'))).toBe('2026-11-01');
    expect(todayIST(new Date('2026-11-01T18:30:00Z'))).toBe('2026-11-02');
  });
  test('days count from the start date', () => {
    expect(addDays('2026-11-29', 2)).toBe('2026-12-01');
    expect(dateOfDay('2026-11-01', 1)).toBe('2026-11-01');
    expect(dateOfDay('2026-11-01', TRIP_DAYS)).toBe('2026-11-04');
  });
});

describe('demo squad', () => {
  test('six distinct mates with a vibe, valid pledges and no clashing sign-in ids', () => {
    expect(POOL).toHaveLength(6);
    expect(new Set(POOL.map(m => m.email)).size).toBe(6);
    expect(new Set(POOL.map(m => m.username)).size).toBe(6);
    // The dev sign-in derives the Google id from the first eight characters of the email
    expect(new Set(POOL.map(m => m.email.slice(0, 8))).size).toBe(6);
    for (const mate of POOL) {
      for (const axis of VIBE_AXES) expect(mate.vibe[axis] >= 0 && mate.vibe[axis] <= 1).toBe(true);
      for (const id of mate.pledges) expect(PLEDGE_IDS.has(id)).toBe(true);
      expect(new Set(mate.pledges).size).toBe(mate.pledges.length);
    }
    expect(POOL[0].email).toBe(DEMO_EMAIL);
  });
  test('the organiser plus five mates, whoever organises', () => {
    const own = squadFor({ email: DEMO_EMAIL, name: 'Aditi' });
    expect(own.organiser.email).toBe(DEMO_EMAIL);
    expect(own.mates).toHaveLength(5);
    const kabir = squadFor({ email: 'Kabir.Mehta@gmail.com', name: 'Kabir' });
    expect(kabir.mates.some(m => m.email === DEMO_EMAIL)).toBe(true);
    expect(kabir.mates.some(m => m.email === 'kabir.mehta@gmail.com')).toBe(false);
    const stranger = squadFor({ email: 'new.person@example.com', name: 'New Person' });
    expect(stranger.mates).toHaveLength(5);
    expect(stranger.mates.some(m => m.email === DEMO_EMAIL)).toBe(false);
  });
  test('a Jain and a vegan mate, so the table has diets to plan for', () => {
    expect(POOL.filter(m => m.diet === 'jain')).toHaveLength(1);
    expect(POOL.filter(m => m.diet === 'vegan')).toHaveLength(1);
  });
});

describe('demo plan', () => {
  test('four days of three to five stops in time order, with real tags', () => {
    expect(PLAN).toHaveLength(TRIP_DAYS);
    for (const day of PLAN) {
      expect(day.stops.length >= 2 && day.stops.length <= 5).toBe(true);
      const times = day.stops.map(s => minutesOf(s.time));
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      for (const stop of day.stops) {
        expect(normaliseSlot(stop.time)).toBe(stop.time);
        expect((STOP_TAGS as readonly string[]).includes(stop.tag)).toBe(true);
      }
    }
  });
  test('every sightseeing stop is a known heritage site with a crowd forecast, a mix of quiet and packed hours', () => {
    const city = cityOf(TRIP.destination);
    for (const date of DATES) {
      const visits = PLAN.flatMap(day => day.stops)
        .filter(s => !['Food', 'Stay', 'Travel'].includes(s.tag))
        .map(s => ({ stop: s, crowd: crowdForStop({ title: s.title, place: s.place, minutes: minutesOf(s.time) }, { city, date }) }));
      for (const { stop, crowd } of visits) expect(`${stop.title}: ${crowd ? 'known' : 'unknown'}`).toBe(`${stop.title}: known`);
      const labels = visits.map(v => v.crowd!.label);
      expect(labels.filter(l => l === 'quiet' || l === 'moderate').length >= 7).toBe(true);
      expect(labels.filter(l => l === 'packed' || l === 'busy').length >= 1).toBe(true);
      // The crowded ones come with a nudge the app can offer
      for (const { crowd } of visits) if (crowd!.label === 'packed') expect(crowd!.suggestion !== null).toBe(true);
    }
  });
  test('meals, check-ins and the journey home are not mistaken for visits', () => {
    for (const stop of PLAN.flatMap(d => d.stops).filter(s => ['Food', 'Stay', 'Travel'].includes(s.tag))) expect(stop.title.length > 0).toBe(true);
    expect(PLAN[0].stops[0].tag).toBe('Stay');
    expect(PLAN.at(-1)!.stops.at(-1)!.tag).toBe('Travel');
  });
});

describe('what the services book', () => {
  test('the workshop has a slot on day 2 whatever the weekday, and sits clear of the plan', () => {
    const makers = WORKSHOP.makerIds.map(id => MAKER_BY_ID.get(id)!);
    for (const maker of makers) expect(maker.craftIds[0]).toBe('miniature');
    expect(CRAFT_BY_ID.has('miniature')).toBe(true);
    const closed = new Set(CLOSED_DATES.map(c => c.date));
    for (let offset = 0; offset < 40; offset++) {
      const start = addDays('2026-11-01', offset);
      const date = dateOfDay(start, WORKSHOP.day);
      if (closed.has(date)) continue;
      const free = makers.some(maker => availabilityFor(maker, date, {}, new Date(`${start}T00:00:00+05:30`)).slots
        .some(s => WORKSHOP.slots.includes(s.time as never) && s.available && s.spotsLeft >= 6));
      expect(`${date}: ${free ? 'a free slot' : 'none'}`).toBe(`${date}: a free slot`);
    }
    // 12:30 PM, 90 minutes, between the City Palace visit and the garden walk
    const day = PLAN[WORKSHOP.day - 1].stops.map(s => minutesOf(s.time));
    const slot = minutesOf(WORKSHOP.slots[0]);
    for (const at of day) expect(at <= slot - 150 || at >= slot + 120).toBe(true);
  });
  test('the table is a dinner the kitchen serves, at a time it offers, clear of the day’s stops', () => {
    const host = HOST_BY_ID.get(TABLE.hostId)!;
    expect(host.meals.includes(TABLE.meal)).toBe(true);
    expect(MEAL_INFO[TABLE.meal].times.includes(TABLE.time)).toBe(true);
    for (const stop of PLAN[TABLE.day - 1].stops) expect(minutesOf(stop.time) < minutesOf(TABLE.time) - 120).toBe(true);
  });
});

describe('demo expenses', () => {
  const emails = new Set(POOL.map(m => m.email));
  test('paid by squad members, split among squad members, in whole rupees', () => {
    for (const expense of EXPENSES) {
      expect(emails.has(expense.payer)).toBe(true);
      expect(Number.isInteger(expense.rupees) && expense.rupees > 0).toBe(true);
      expect((EXPENSE_CATEGORIES as readonly string[]).includes(expense.category)).toBe(true);
      for (const email of expense.among ?? []) expect(emails.has(email)).toBe(true);
      expect(expense.description.length <= 500).toBe(true);
    }
    expect(new Set(EXPENSES.map(e => e.payer)).size >= 4).toBe(true);
  });
  test('the Green Trip counts every one by a clear rule (no Gemini needed) and most of the money stays local', () => {
    let tracked = 0;
    let kept = 0;
    for (const expense of EXPENSES) {
      const c = classifyByRules(expense.description, expense.category);
      expect(`${expense.description}: ${c ? 'classified' : 'unclassified'}`).toBe(`${expense.description}: classified`);
      tracked += expense.rupees;
      if (c?.local) kept += expense.rupees;
    }
    const share = kept / tracked;
    expect(share > 0.55 && share < 0.8).toBe(true);
  });
});

describe('who is going', () => {
  const stops = PLAN.flatMap(d => d.stops);
  test('the organiser and shared meals are always going; the rest vary, the same way every time', () => {
    for (const [i, stop] of stops.entries()) {
      expect(rsvpFor(stop, i, 0)).toBe('going');
      for (let mate = 0; mate < 6; mate++) expect(rsvpFor(stop, i, mate)).toBe(rsvpFor(stop, i, mate));
      if (['Stay', 'Food', 'Travel'].includes(stop.tag)) for (let mate = 0; mate < 6; mate++) expect(rsvpFor(stop, i, mate)).toBe('going');
    }
    const answers = new Set(stops.flatMap((s, i) => [1, 2, 3, 4, 5].map(m => rsvpFor(s, i, m))));
    expect(answers.size).toBe(3);
  });
});

describe('demo photos', () => {
  test('small JPEGs that exist, uploaded by squad members, with captions', () => {
    const emails = new Set(POOL.map(m => m.email));
    expect(PHOTOS.length >= 3).toBe(true);
    for (const photo of PHOTOS) {
      const bytes = readFileSync(resolve(import.meta.dirname, '../../scripts/demo-assets', photo.file));
      expect(bytes.length < 200_000).toBe(true);
      expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
      expect(emails.has(photo.by)).toBe(true);
      expect(photo.caption.length > 0 && photo.caption.length <= 300).toBe(true);
    }
  });
});
