import { describe, test } from 'node:test';
import express from 'express';
import { expect } from '../expect.ts';
import { ApiError, errorHandler, notFound } from '../../src/http.ts';
import { createApp } from '../../src/trips/app.ts';
import { tripLength } from '../../src/trips/itinerary.ts';
import type { Database } from '../../src/db.ts';
import type { MediaStorage } from '../../src/storage.ts';
import type { User } from '../../src/auth/types.ts';
import { serve } from '../helpers.ts';

// PATCH /api/trips/:id against a fake database that answers the few statements a date change runs.
const TRIP_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'organiser-token';
const user = { id: 'usr_1', username: 'asha', email: 'asha@test.local', name: 'Asha' } as User;

type Setup = {
  role?: 'organiser' | 'mate';
  start?: string | null;
  end?: string | null;
  details?: Record<string, unknown>;
  stopDays?: number[];
  titles?: string[];
};

function fakeTrip(setup: Setup) {
  const trip = {
    id: TRIP_ID, name: 'Udaipur Lake Escape', group_name: 'Lake City Squad', destination: 'Udaipur',
    start_date: 'start' in setup ? setup.start : '2026-11-01', end_date: 'end' in setup ? setup.end : '2026-11-05',
    budget: '₹10–20k', cover: 'udaipur', details: setup.details ?? {}, invite_code: 'abcd2345', expense_group_id: '22222222-2222-4222-8222-222222222222',
    created_by: 'usr_1', created_at: new Date('2026-10-31T10:00:00Z'),
    day_titles: setup.titles ?? ['Arrive', 'Palaces', 'Hidden gems', 'Lakes', 'Home'],
  };
  const stops = (setup.stopDays ?? [1, 2, 3, 4, 5, 5]).map((day, i) => ({ id: `stop-${i}`, day_number: day }));
  const log: string[] = [];

  async function query(text: string, values: unknown[] = []) {
    const sql = text.replace(/\s+/g, ' ').trim();
    log.push(sql.split(' ').slice(0, 3).join(' '));
    if (sql.startsWith('SELECT t.*, m.ledger_member_id')) {
      return { rows: [{ ...trip, ledger_member_id: 'member-1', role: setup.role ?? 'organiser' }], rowCount: 1 };
    }
    if (sql.startsWith('UPDATE trips SET name')) {
      const [, name, group, destination, start, end, budget, cover, details] = values as string[];
      Object.assign(trip, { name, group_name: group, destination, start_date: start, end_date: end, budget, cover, details: JSON.parse(details) });
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith('UPDATE trip_stops SET day_number')) {
      const length = Number(values[1]);
      const moving = stops.filter((s) => s.day_number > length);
      moving.forEach((s) => (s.day_number = length));
      return { rows: [], rowCount: moving.length };
    }
    if (sql.startsWith('UPDATE trips SET day_titles')) {
      trip.day_titles = trip.day_titles.slice(0, Number(values[1]));
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('FROM trip_members m JOIN users u')) {
      return {
        rows: [{ ledger_member_id: 'member-1', user_id: 'usr_1', role: setup.role ?? 'organiser', joined_at: new Date('2026-10-31T10:00:00Z'), name: 'Asha', username: 'asha', picture: null, preferences: {}, balance_paise: 0 }],
        rowCount: 1,
      };
    }
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [], rowCount: 0 };
    throw new Error(`Unexpected SQL in test: ${sql}`);
  }

  const db = { pool: { query, connect: async () => ({ query, release: () => {} }) }, close: async () => {} } as unknown as Database;
  return { db, trip, stops, log };
}

async function withTrip(setup: Setup, run: (api: ReturnType<typeof fakeTrip> & { patch: (body: unknown) => Promise<{ status: number; data: any }> }) => Promise<void>) {
  const fake = fakeTrip(setup);
  const authenticate = async (token: string) => {
    if (token !== TOKEN) throw new ApiError(401, 'UNAUTHORIZED', 'Bad token');
    return user;
  };
  const app = express().use('/api/trips', createApp(fake.db, {} as MediaStorage, authenticate, 'http://localhost:5173')).use(notFound).use(errorHandler);
  const server = await serve(app);
  try {
    await run({
      ...fake,
      patch: async (body) => {
        const response = await server.request(`/api/trips/${TRIP_ID}`, {
          method: 'PATCH',
          headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        return { status: response.status, data: await response.json() };
      },
    });
  } finally {
    await server.close();
  }
}

describe('how long a trip is', () => {
  const trip = (start: string | null, end: string | null, details: Record<string, unknown> = {}) => ({ start_date: start, end_date: end, details }) as Parameters<typeof tripLength>[0];

  test('counts both end days, and falls back to the flexible length, then to 3', () => {
    expect(tripLength(trip('2026-11-01', '2026-11-04'))).toBe(4);
    expect(tripLength(trip('2026-11-01', null))).toBe(1);
    expect(tripLength(trip(null, null, { flexibleDays: 5 }))).toBe(5);
    expect(tripLength(trip(null, null))).toBe(3);
  });
  test('stops at the 14 days an itinerary can hold', () => {
    expect(tripLength(trip('2026-11-01', '2026-12-31'))).toBe(14);
  });
});

describe('changing a trip’s dates', () => {
  test('a shorter trip keeps every stop: the removed days’ stops move to the new last day', async () => {
    await withTrip({}, async ({ patch, trip, stops, log }) => {
      const { status, data } = await patch({ startDate: '2026-11-01', endDate: '2026-11-03' });
      expect(status).toBe(200);
      expect(data.endDate).toBe('2026-11-03');
      expect(data.movedStops).toBe(3);
      expect(stops.map((s) => s.day_number)).toEqual([1, 2, 3, 3, 3, 3]);
      expect(trip.day_titles).toEqual(['Arrive', 'Palaces', 'Hidden gems']);
      // The new dates and the re-homed stops are saved together
      expect(log.filter((l) => ['BEGIN', 'COMMIT'].includes(l))).toEqual(['BEGIN', 'COMMIT']);
    });
  });

  test('moving the whole trip to other dates leaves the plan on the same day numbers', async () => {
    await withTrip({}, async ({ patch, stops, log }) => {
      const { status, data } = await patch({ startDate: '2026-11-10', endDate: '2026-11-14' });
      expect(status).toBe(200);
      expect(data.startDate).toBe('2026-11-10');
      expect(data.movedStops).toBe(0);
      expect(stops.map((s) => s.day_number)).toEqual([1, 2, 3, 4, 5, 5]);
      expect(log.some((l) => l.startsWith('UPDATE trip_stops'))).toBe(false);
    });
  });

  test('a longer trip adds empty days and moves nothing', async () => {
    await withTrip({}, async ({ patch, stops }) => {
      const { data } = await patch({ endDate: '2026-11-09' });
      expect(data.startDate).toBe('2026-11-01');
      expect(data.endDate).toBe('2026-11-09');
      expect(data.movedStops).toBe(0);
      expect(stops.map((s) => s.day_number)).toEqual([1, 2, 3, 4, 5, 5]);
    });
  });

  test('picking dates for a flexible trip fits its plan to them', async () => {
    await withTrip({ start: null, end: null, details: { flexibleDays: 5 }, titles: [] }, async ({ patch, stops }) => {
      const { status, data } = await patch({ startDate: '2026-11-20', endDate: '2026-11-22' });
      expect(status).toBe(200);
      expect(data.movedStops).toBe(3);
      expect(stops.map((s) => s.day_number)).toEqual([1, 2, 3, 3, 3, 3]);
    });
  });

  test('editing something else never touches the plan', async () => {
    await withTrip({}, async ({ patch, stops, log }) => {
      const { status, data } = await patch({ name: 'Udaipur Lake Escape 2.0' });
      expect(status).toBe(200);
      expect(data.name).toBe('Udaipur Lake Escape 2.0');
      expect(data.movedStops).toBe(0);
      expect(stops.map((s) => s.day_number)).toEqual([1, 2, 3, 4, 5, 5]);
      expect(log.some((l) => l.startsWith('UPDATE trip_stops'))).toBe(false);
    });
  });

  test('only the organiser can move the dates; a mate can still rename the trip', async () => {
    await withTrip({ role: 'mate' }, async ({ patch, trip, stops }) => {
      const blocked = await patch({ endDate: '2026-11-03' });
      expect(blocked.status).toBe(403);
      expect(blocked.data.error.code).toBe('FORBIDDEN');
      expect(trip.end_date).toBe('2026-11-05');
      expect(stops.map((s) => s.day_number)).toEqual([1, 2, 3, 4, 5, 5]);

      expect((await patch({ name: 'Renamed', startDate: '2026-11-01', endDate: '2026-11-05' })).status).toBe(200);
      expect(trip.name).toBe('Renamed');
    });
  });

  test('rejects dates that are backwards or not dates', async () => {
    await withTrip({}, async ({ patch, trip }) => {
      expect((await patch({ startDate: '2026-11-08', endDate: '2026-11-05' })).status).toBe(400);
      expect((await patch({ endDate: 'Wed 4 Nov' })).status).toBe(400);
      expect((await patch({ startDate: '2026-02-31' })).status).toBe(400);
      expect(trip.start_date).toBe('2026-11-01');
      expect(trip.end_date).toBe('2026-11-05');
    });
  });
});
