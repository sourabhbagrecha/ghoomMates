import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
// The app's trip-date helpers are plain TypeScript with no imports, so the backend tests can run them too
import {
  addDays, addMonths, dayIndex, daysBetween, daysUntil, describeRange, formatDateRange, formatDay, monthGrid, monthLabel, pickDate, todayISO,
  tripDay, tripDayLabel, tripPhase, unavailableReason,
} from '../../../frontend/src/data/tripDates.ts';

describe('today in India', () => {
  test('rolls over at midnight IST (18:30 UTC), not at midnight UTC', () => {
    expect(todayISO(new Date('2026-10-31T18:29:59Z'))).toBe('2026-10-31');
    expect(todayISO(new Date('2026-10-31T18:30:00Z'))).toBe('2026-11-01');
    expect(todayISO(new Date('2026-11-01T00:30:00Z'))).toBe('2026-11-01');
    expect(todayISO(new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01');
  });
});

describe('day maths', () => {
  test('adds days across months, years and leap days', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
  });
  test('counts whole days, even over a clock change somewhere else', () => {
    expect(daysBetween('2026-11-01', '2026-11-04')).toBe(3);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-11-04', '2026-11-01')).toBe(-3);
  });
  test('rejects dates that do not exist', () => {
    expect(Number.isNaN(dayIndex('2026-02-31'))).toBe(true);
    expect(Number.isNaN(dayIndex('1 Nov 2026'))).toBe(true);
    expect(Number.isNaN(dayIndex('2026-13-01'))).toBe(true);
  });
});

describe('where a trip is in time', () => {
  const trip = { startDate: '2026-11-01', endDate: '2026-11-04' };

  test('is live from its first day to its last, both included', () => {
    expect(tripPhase(trip, '2026-10-31')).toBe('upcoming');
    expect(tripPhase(trip, '2026-11-01')).toBe('live');
    expect(tripPhase(trip, '2026-11-03')).toBe('live');
    expect(tripPhase(trip, '2026-11-04')).toBe('live');
    expect(tripPhase(trip, '2026-11-05')).toBe('past');
  });
  test('a trip without an end date is a one-day trip; one without dates is upcoming', () => {
    expect(tripPhase({ startDate: '2026-11-01', endDate: null }, '2026-11-01')).toBe('live');
    expect(tripPhase({ startDate: '2026-11-01', endDate: null }, '2026-11-02')).toBe('past');
    expect(tripPhase({ startDate: null, endDate: null }, '2026-11-01')).toBe('upcoming');
  });
  test('counts the day of the trip and the days to go', () => {
    expect(tripDay(trip, '2026-11-01')).toEqual({ day: 1, total: 4 });
    expect(tripDay(trip, '2026-11-04')).toEqual({ day: 4, total: 4 });
    expect(tripDay({ startDate: null, endDate: null }, '2026-11-01')).toBe(null);
    expect(daysUntil('2026-11-20', '2026-11-01')).toBe(19);
    expect(daysUntil(null, '2026-11-01')).toBe(null);
  });
  test('a trip starting at midnight IST turns live on that minute, wherever the device is', () => {
    const justBefore = new Date('2026-10-31T18:29:00Z');
    const justAfter = new Date('2026-10-31T18:31:00Z');
    expect(tripPhase(trip, todayISO(justBefore))).toBe('upcoming');
    expect(tripPhase(trip, todayISO(justAfter))).toBe('live');
  });
  test('gives the same answers whatever time zone the device is set to', () => {
    const original = process.env.TZ;
    try {
      for (const zone of ['UTC', 'Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Auckland']) {
        process.env.TZ = zone;
        expect(tripDay(trip, '2026-11-03')).toEqual({ day: 3, total: 4 });
        expect(tripDayLabel('2026-11-01', 3)).toBe('Tue, 3 Nov');
        expect(formatDateRange('2026-11-01', '2026-11-04')).toBe('Sun 1 – Wed 4 Nov');
        expect(todayISO(new Date('2026-10-31T19:00:00Z'))).toBe('2026-11-01');
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe('display', () => {
  test('formats days and ranges', () => {
    expect(formatDay('2026-11-01')).toBe('Sun, 1 Nov');
    expect(formatDateRange('2026-12-12', '2026-12-16')).toBe('Sat 12 – Wed 16 Dec');
    expect(formatDateRange('2026-11-28', '2026-12-01')).toBe('Sat 28 Nov – Tue 1 Dec');
    expect(formatDateRange('2026-12-30', '2027-01-02')).toBe('Wed 30 Dec – Sat 2 Jan');
    expect(formatDateRange('2026-11-01', '2026-11-01')).toBe('Sun 1 Nov');
    expect(formatDateRange('2026-11-01', null)).toBe('Sun 1 Nov');
    expect(formatDateRange(null, null)).toBe('Dates TBD');
    expect(tripDayLabel(null, 2)).toBe('Day 2');
  });
  test('describes a picked range for the trip-length summary', () => {
    expect(describeRange('2026-11-01', '2026-11-04')).toEqual({ value: '4 days · 3 nights', detail: 'Sun, 1 Nov → Wed, 4 Nov' });
    expect(describeRange('2026-11-01', '2026-11-01')).toEqual({ value: 'A day trip', detail: 'Sun, 1 Nov' });
    expect(describeRange('2026-11-01', '2026-11-02').value).toBe('2 days · 1 night');
    expect(describeRange('2026-11-01', null)).toEqual({ value: 'Pick an end date', detail: 'Starting Sun, 1 Nov' });
    expect(describeRange(null, null)).toEqual({ value: 'Pick an end date', detail: 'Tap your first day' });
  });
});

describe('month calendars', () => {
  test('lays out a Monday-first grid', () => {
    // 1 Nov 2026 is a Sunday: six empty cells first. 1 Dec is a Tuesday: one.
    expect(monthGrid({ year: 2026, month: 10 })).toEqual({ days: 30, blanks: 6 });
    expect(monthGrid({ year: 2026, month: 11 })).toEqual({ days: 31, blanks: 1 });
    expect(monthGrid({ year: 2028, month: 1 })).toEqual({ days: 29, blanks: 1 });
  });
  test('steps between months and years', () => {
    expect(addMonths({ year: 2026, month: 10 }, 1)).toEqual({ year: 2026, month: 11 });
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(monthLabel({ year: 2026, month: 10 })).toBe('November 2026');
  });
});

describe('picking a range', () => {
  const none = { start: null, end: null };

  test('the first tap sets the start, the second the end, a third starts over', () => {
    const first = pickDate(none, '2026-11-01');
    expect(first).toEqual({ start: '2026-11-01', end: null });
    const second = pickDate(first, '2026-11-04');
    expect(second).toEqual({ start: '2026-11-01', end: '2026-11-04' });
    expect(pickDate(second, '2026-11-10')).toEqual({ start: '2026-11-10', end: null });
  });
  test('tapping the same day again makes a one-day trip; an earlier day moves the start', () => {
    expect(pickDate({ start: '2026-11-05', end: null }, '2026-11-05')).toEqual({ start: '2026-11-05', end: '2026-11-05' });
    expect(pickDate({ start: '2026-11-05', end: null }, '2026-11-02')).toEqual({ start: '2026-11-02', end: null });
  });
  test('a locked start never moves: every tap sets the end', () => {
    const live = { start: '2026-11-01', end: '2026-11-04' };
    expect(pickDate(live, '2026-11-03', '2026-11-01')).toEqual({ start: '2026-11-01', end: '2026-11-03' });
    expect(pickDate(live, '2026-11-09', '2026-11-01')).toEqual({ start: '2026-11-01', end: '2026-11-09' });
  });
});

describe('days you cannot pick', () => {
  const rules = { first: '2026-11-01', maxDays: 14 };

  test('past days are out, today is in', () => {
    expect(unavailableReason('2026-10-31', { start: null, end: null }, rules)).toBe('already passed');
    expect(unavailableReason('2026-11-01', { start: null, end: null }, rules)).toBe(null);
  });
  test('while choosing the end, a trip cannot run past the itinerary limit, but days before the start are still fine', () => {
    const choosing = { start: '2026-11-10', end: null };
    expect(unavailableReason('2026-11-23', choosing, rules)).toBe(null);
    expect(unavailableReason('2026-11-24', choosing, rules)).toBe('beyond the 14-day limit');
    expect(unavailableReason('2026-11-03', choosing, rules)).toBe(null);
  });
  test('with a full range any day from today on starts a new one', () => {
    expect(unavailableReason('2026-12-30', { start: '2026-11-10', end: '2026-11-12' }, rules)).toBe(null);
  });
  test('a locked start rules out the days before it and counts the limit from it', () => {
    const locked = { ...rules, lockedStart: '2026-11-01' };
    const live = { start: '2026-11-01', end: '2026-11-04' };
    expect(unavailableReason('2026-11-14', live, locked)).toBe(null);
    expect(unavailableReason('2026-11-15', live, locked)).toBe('beyond the 14-day limit');
    // A trip that began on 28 Oct: its running days are behind us, so they can't be picked as the new last day
    const began = { ...rules, lockedStart: '2026-10-28' };
    expect(unavailableReason('2026-10-30', { start: '2026-10-28', end: '2026-11-03' }, began)).toBe('already passed');
    expect(unavailableReason('2026-11-02', { start: '2026-10-28', end: '2026-11-03' }, began)).toBe(null);
    // Before a locked start that is still ahead of us
    expect(unavailableReason('2026-11-02', { start: '2026-11-04', end: '2026-11-06' }, { ...rules, lockedStart: '2026-11-04' })).toBe('before the first day');
  });
});
