import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { dateString, MemoryStore, PgStore, type HospitalityDb } from '../../src/hospitality/store.ts';

type Query = { text: string; values: unknown[] };

/** A pool that records what was asked and answers from a script */
function fakeDb(answer: (text: string, values: unknown[]) => any[]) {
  const queries: Query[] = [];
  const db: HospitalityDb = {
    pool: {
      query: async (text, values = []) => {
        queries.push({ text, values });
        const rows = answer(text, values);
        return { rowCount: rows.length, rows };
      },
    },
  };
  return { db, queries };
}

const row = (over: Record<string, unknown> = {}) => ({
  id: '33333333-3333-4333-8333-333333333333', host_id: 'kesar-pol-haveli', trip_id: '11111111-1111-4111-8111-111111111111', group_name: 'Goa Gang',
  user_id: 'usr_1', meal_date: '2026-11-02', meal: 'dinner', meal_time: '08:00 PM', headcount: 6, dietary: { veg: 4, jain: 2, vegan: 0 }, note: '',
  stop_id: null, day_number: null, created_at: new Date('2026-11-01T02:30:00Z'), ...over,
});

const booking = { hostId: 'kesar-pol-haveli', tripId: '11111111-1111-4111-8111-111111111111', group: 'Goa Gang', userId: 'usr_1', date: '2026-11-02', meal: 'dinner' as const, time: '08:00 PM', headcount: 6, dietary: { veg: 4, jain: 2, vegan: 0 }, note: '' };

describe('the Postgres store', () => {
  test('saving a booking upserts on the trip, host, day and meal, and maps the row back', async () => {
    const { db, queries } = fakeDb(() => [row()]);
    const saved = await new PgStore(db).saveBooking(booking);
    expect(queries[0].text.includes('ON CONFLICT (trip_id, host_id, meal_date, meal) DO UPDATE')).toBe(true);
    expect(queries[0].values.slice(1)).toEqual(['kesar-pol-haveli', booking.tripId, 'Goa Gang', 'usr_1', '2026-11-02', 'dinner', '08:00 PM', 6, JSON.stringify(booking.dietary), '']);
    expect(saved).toEqual({
      id: '33333333-3333-4333-8333-333333333333', hostId: 'kesar-pol-haveli', tripId: booking.tripId, group: 'Goa Gang', userId: 'usr_1', date: '2026-11-02',
      meal: 'dinner', time: '08:00 PM', headcount: 6, dietary: { veg: 4, jain: 2, vegan: 0 }, note: '', stopId: null, dayNumber: null, createdAt: '2026-11-01T02:30:00.000Z',
    });
  });

  test('reads bookings for a host over a date range', async () => {
    const { db, queries } = fakeDb(() => [row(), row({ id: 'other', headcount: '4', dietary: {} })]);
    const list = await new PgStore(db).bookingsForHost('kesar-pol-haveli', '2026-11-01', '2026-11-07');
    expect(queries[0].values).toEqual(['kesar-pol-haveli', '2026-11-01', '2026-11-07']);
    expect(list.map(b => b.headcount)).toEqual([6, 4]);
    // A missing diet breakdown counts everyone as vegetarian
    expect(list[1].dietary).toEqual({ veg: 4, jain: 0, vegan: 0 });
  });

  test('finding nothing is null, and the squad is counted from profiles', async () => {
    const empty = new PgStore(fakeDb(() => []).db);
    expect(await empty.findBooking('x')).toBe(null);
    expect(await empty.findSlot('t', 'h', '2026-11-02', 'lunch')).toBe(null);
    expect(await empty.squad('t')).toBe(null);
    const squad = new PgStore(fakeDb(() => [{ preferences: { diet: 'jain' } }, { preferences: {} }, { preferences: null }]).db);
    expect(await squad.squad('t')).toEqual({ members: 3, diets: { veg: 2, jain: 1, vegan: 0 } });
  });

  test('leftovers: numeric kilos come back as numbers and a day is replaced, not doubled', async () => {
    const { db, queries } = fakeDb(() => [{ host_id: 'pal-rasoi', log_date: '2026-11-01', leftover_kg: '2.35', covers: 40, note: 'x' }]);
    const saved = await new PgStore(db).saveWaste({ hostId: 'pal-rasoi', date: '2026-11-01', leftoverKg: 2.35, covers: 40, note: 'x' }, 'usr_1');
    expect(queries[0].text.includes('ON CONFLICT (host_id, log_date) DO UPDATE')).toBe(true);
    expect(queries[0].values).toEqual(['pal-rasoi', '2026-11-01', 2.35, 40, 'x', 'usr_1']);
    expect(saved).toEqual({ hostId: 'pal-rasoi', date: '2026-11-01', leftoverKg: 2.35, covers: 40, note: 'x' });
  });

  test('a date column is a plain YYYY-MM-DD whether the driver gives a string or a local-midnight Date', () => {
    expect(dateString('2026-11-02')).toBe('2026-11-02');
    expect(dateString(new Date(2026, 10, 2))).toBe('2026-11-02');
  });
});

describe('the memory store', () => {
  test('keeps one booking per trip, host, day and meal, and filters by host and dates', async () => {
    const store = new MemoryStore(true);
    const first = await store.saveBooking(booking);
    const again = await store.saveBooking({ ...booking, headcount: 9 });
    expect(again.id).toBe(first.id);
    expect(again.headcount).toBe(9);
    await store.saveBooking({ ...booking, meal: 'lunch', date: '2026-11-09' });
    expect(await store.bookingsForHost('kesar-pol-haveli', '2026-11-01', '2026-11-07')).toHaveLength(1);
    expect(await store.bookingsForHost('pal-rasoi', '2026-11-01', '2026-11-30')).toHaveLength(0);
    expect(await store.bookingsForTrip(booking.tripId)).toHaveLength(2);
    await store.setStop(first.id, 'stop-1', 3);
    expect((await store.findBooking(first.id))?.stopId).toBe('stop-1');
    await store.deleteBooking(first.id);
    expect(await store.findBooking(first.id)).toBe(null);
  });
  test('is not persistent unless a test says so', () => {
    expect(new MemoryStore().persistent).toBe(false);
    expect(new MemoryStore(true).persistent).toBe(true);
  });
});
