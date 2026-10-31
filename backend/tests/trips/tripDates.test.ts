import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
// The app's trip-date helpers are plain TypeScript with no imports, so the backend tests can run them too
import {
  addDays, addMonths, dayIndex, daysBetween, daysUntil, describeRange, formatDateRange, formatDay, monthGrid, monthLabel, todayISO,
  tripDay, tripDayLabel, tripPhase,
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
