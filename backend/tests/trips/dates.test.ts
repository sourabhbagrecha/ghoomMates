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
import { testDatabase } from '../mongo.ts';

// PATCH /api/trips/:id against a seeded database holding one trip, its organiser and a few stops.
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

async function seed(db: Database, setup: Setup) {
  const at = new Date('2026-10-31T10:00:00Z');
  const groupId = '22222222-2222-4222-8222-222222222222';
  await db.db.collection('trips').insertOne({
    _id: TRIP_ID as any, name: 'Udaipur Lake Escape', group_name: 'Lake City Squad', destination: 'Udaipur',
    start_date: 'start' in setup ? setup.start : '2026-11-01', end_date: 'end' in setup ? setup.end : '2026-11-05',
    budget: '₹10–20k', cover: 'udaipur', details: setup.details ?? {}, invite_code: 'abcd2345', expense_group_id: groupId,
    created_by: 'usr_1', created_at: at, day_titles: setup.titles ?? ['Arrive', 'Palaces', 'Hidden gems', 'Lakes', 'Home'],
  });
  await db.db.collection('users').insertOne({ _id: 'usr_1' as any, name: 'Asha', username: 'asha', picture: null, preferences: {} });
  await db.db.collection('group_members').insertOne({ _id: 'member-1' as any, group_id: groupId, position: 0, name: 'Asha', balance_paise: 0 });
  await db.db.collection('trip_members').insertOne({ trip_id: TRIP_ID, user_id: 'usr_1', ledger_member_id: 'member-1', role: setup.role ?? 'organiser', joined_at: at });
  await db.db.collection('trip_stops').insertMany((setup.stopDays ?? [1, 2, 3, 4, 5, 5]).map((day, i) => ({
    _id: `stop-${i}` as any, trip_id: TRIP_ID, day_number: day, time: '', minutes: i, title: `Stop ${i}`, tag: '', place: '', notes: '', created_at: at,
  })));
}

type Api = {
  patch: (body: unknown) => Promise<{ status: number; data: any }>;
  trip: () => Promise<Record<string, any>>;
  stopDays: () => Promise<number[]>;
};

async function withTrip(setup: Setup, run: (api: Api) => Promise<void>) {
  const db = await testDatabase();
  await seed(db, setup);
  const authenticate = async (token: string) => {
    if (token !== TOKEN) throw new ApiError(401, 'UNAUTHORIZED', 'Bad token');
    return user;
  };
  const app = express().use('/api/trips', createApp(db, {} as MediaStorage, authenticate, 'http://localhost:5173')).use(notFound).use(errorHandler);
  const server = await serve(app);
  try {
    await run({
      patch: async (body) => {
        const response = await server.request(`/api/trips/${TRIP_ID}`, {
          method: 'PATCH',
          headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        return { status: response.status, data: await response.json() };
      },
      trip: async () => (await db.db.collection('trips').findOne({ _id: TRIP_ID as any }))!,
      stopDays: async () => (await db.db.collection('trip_stops').find({ trip_id: TRIP_ID }).sort({ minutes: 1 }).toArray()).map((s) => s.day_number),
    });
  } finally {
    await server.close();
    await db.close();
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
    await withTrip({}, async ({ patch, trip, stopDays }) => {
      const { status, data } = await patch({ startDate: '2026-11-01', endDate: '2026-11-03' });
      expect(status).toBe(200);
      expect(data.endDate).toBe('2026-11-03');
      expect(data.movedStops).toBe(3);
      expect(await stopDays()).toEqual([1, 2, 3, 3, 3, 3]);
      expect((await trip()).day_titles).toEqual(['Arrive', 'Palaces', 'Hidden gems']);
      expect((await trip()).end_date).toBe('2026-11-03');
    });
  });

  test('moving the whole trip to other dates leaves the plan on the same day numbers', async () => {
    await withTrip({}, async ({ patch, stopDays }) => {
      const { status, data } = await patch({ startDate: '2026-11-10', endDate: '2026-11-14' });
      expect(status).toBe(200);
      expect(data.startDate).toBe('2026-11-10');
      expect(data.movedStops).toBe(0);
      expect(await stopDays()).toEqual([1, 2, 3, 4, 5, 5]);
    });
  });

  test('a longer trip adds empty days and moves nothing', async () => {
    await withTrip({}, async ({ patch, stopDays }) => {
      const { data } = await patch({ endDate: '2026-11-09' });
      expect(data.startDate).toBe('2026-11-01');
      expect(data.endDate).toBe('2026-11-09');
      expect(data.movedStops).toBe(0);
      expect(await stopDays()).toEqual([1, 2, 3, 4, 5, 5]);
    });
  });

  test('picking dates for a flexible trip fits its plan to them', async () => {
    await withTrip({ start: null, end: null, details: { flexibleDays: 5 }, titles: [] }, async ({ patch, stopDays }) => {
      const { status, data } = await patch({ startDate: '2026-11-20', endDate: '2026-11-22' });
      expect(status).toBe(200);
      expect(data.movedStops).toBe(3);
      expect(await stopDays()).toEqual([1, 2, 3, 3, 3, 3]);
    });
  });

  test('editing something else never touches the plan', async () => {
    await withTrip({}, async ({ patch, stopDays }) => {
      const { status, data } = await patch({ name: 'Udaipur Lake Escape 2.0' });
      expect(status).toBe(200);
      expect(data.name).toBe('Udaipur Lake Escape 2.0');
      expect(data.movedStops).toBe(0);
      expect(await stopDays()).toEqual([1, 2, 3, 4, 5, 5]);
    });
  });

  test('only the organiser can move the dates; a mate can still rename the trip', async () => {
    await withTrip({ role: 'mate' }, async ({ patch, trip, stopDays }) => {
      const blocked = await patch({ endDate: '2026-11-03' });
      expect(blocked.status).toBe(403);
      expect(blocked.data.error.code).toBe('FORBIDDEN');
      expect((await trip()).end_date).toBe('2026-11-05');
      expect(await stopDays()).toEqual([1, 2, 3, 4, 5, 5]);

      expect((await patch({ name: 'Renamed', startDate: '2026-11-01', endDate: '2026-11-05' })).status).toBe(200);
      expect((await trip()).name).toBe('Renamed');
    });
  });

  test('rejects dates that are backwards or not dates', async () => {
    await withTrip({}, async ({ patch, trip }) => {
      expect((await patch({ startDate: '2026-11-08', endDate: '2026-11-05' })).status).toBe(400);
      expect((await patch({ endDate: 'Wed 4 Nov' })).status).toBe(400);
      expect((await patch({ startDate: '2026-02-31' })).status).toBe(400);
      expect((await trip()).start_date).toBe('2026-11-01');
      expect((await trip()).end_date).toBe('2026-11-05');
    });
  });
});
