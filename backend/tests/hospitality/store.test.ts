import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { dateString, MemoryStore, MongoStore } from '../../src/hospitality/store.ts';
import { testDatabase } from '../mongo.ts';

const booking = { hostId: 'kesar-pol-haveli', tripId: '11111111-1111-4111-8111-111111111111', group: 'Goa Gang', userId: 'usr_1', date: '2026-11-02', meal: 'dinner' as const, time: '08:00 PM', headcount: 6, dietary: { veg: 4, jain: 2, vegan: 0 }, note: '' };

describe('the MongoDB store', () => {
  test('saving a booking upserts on the trip, host, day and meal, and maps the document back', async () => {
    const database = await testDatabase();
    const store = new MongoStore(database);
    const saved = await store.saveBooking(booking);
    expect(saved).toEqual({ ...booking, id: saved.id, stopId: null, dayNumber: null, createdAt: saved.createdAt });
    expect(Number.isNaN(Date.parse(saved.createdAt))).toBe(false);
    const again = await store.saveBooking({ ...booking, headcount: 9, dietary: { veg: 9, jain: 0, vegan: 0 }, group: 'Goa Gang 2' });
    expect([again.id, again.headcount, again.group, again.createdAt]).toEqual([saved.id, 9, 'Goa Gang 2', saved.createdAt]);
    expect(await database.db.collection('hospitality_reservations').countDocuments()).toBe(1);
    await store.setStop(saved.id, 'stop-1', 3);
    expect(await store.findBooking(saved.id)).toEqual({ ...again, stopId: 'stop-1', dayNumber: 3 });
    expect((await store.findSlot(booking.tripId, booking.hostId, booking.date, 'dinner'))?.id).toBe(saved.id);
    await store.deleteBooking(saved.id);
    expect(await store.findBooking(saved.id)).toBe(null);
  });

  test('reads bookings for a host over a date range, in date order', async () => {
    const database = await testDatabase();
    const store = new MongoStore(database);
    const later = await store.saveBooking({ ...booking, date: '2026-11-05' });
    const first = await store.saveBooking({ ...booking, meal: 'lunch' });
    await store.saveBooking({ ...booking, date: '2026-11-09' });
    await store.saveBooking({ ...booking, hostId: 'pal-rasoi' });
    // A missing diet breakdown counts everyone as vegetarian
    await database.db.collection<any>('hospitality_reservations').updateOne({ _id: later.id }, { $set: { dietary: {}, headcount: 4 } });
    const list = await store.bookingsForHost('kesar-pol-haveli', '2026-11-01', '2026-11-07');
    expect(list.map(b => b.id)).toEqual([first.id, later.id]);
    expect(list[1].dietary).toEqual({ veg: 4, jain: 0, vegan: 0 });
    expect(await store.bookingsForTrip(booking.tripId)).toHaveLength(4);
  });

  test('finding nothing is null, and the squad is counted from profiles', async () => {
    const database = await testDatabase();
    const store = new MongoStore(database);
    expect(await store.findBooking('x')).toBe(null);
    expect(await store.findSlot('t', 'h', '2026-11-02', 'lunch')).toBe(null);
    expect(await store.squad('t')).toBe(null);
    await database.db.collection<any>('users').insertMany([
      { _id: 'usr_1', preferences: { diet: 'jain' }, google_id: 'g1', email: 'a@x', username: 'a' },
      { _id: 'usr_2', preferences: {}, google_id: 'g2', email: 'b@x', username: 'b' },
      { _id: 'usr_3', preferences: null, google_id: 'g3', email: 'c@x', username: 'c' },
    ]);
    await database.db.collection('trip_members').insertMany(['usr_1', 'usr_2', 'usr_3'].map((user_id, i) => ({ trip_id: 't', user_id, ledger_member_id: `m${i}` })));
    expect(await store.squad('t')).toEqual({ members: 3, diets: { veg: 2, jain: 1, vegan: 0 } });
  });

  test('leftovers: kilos keep two decimals and a day is replaced, not doubled', async () => {
    const database = await testDatabase();
    const store = new MongoStore(database);
    const saved = await store.saveWaste({ hostId: 'pal-rasoi', date: '2026-11-01', leftoverKg: 2.349, covers: 40, note: 'x' }, 'usr_1');
    expect(saved).toEqual({ hostId: 'pal-rasoi', date: '2026-11-01', leftoverKg: 2.35, covers: 40, note: 'x' });
    await store.saveWaste({ hostId: 'pal-rasoi', date: '2026-11-01', leftoverKg: 1.5, covers: 30, note: 'y' }, 'usr_1');
    await store.saveWaste({ hostId: 'pal-rasoi', date: '2026-10-30', leftoverKg: 3, covers: 20, note: '' }, null);
    await store.saveWaste({ hostId: 'pal-rasoi', date: '2026-11-20', leftoverKg: 3, covers: 20, note: '' }, null);
    expect(await store.wasteLogs('pal-rasoi', '2026-10-25', '2026-11-07')).toEqual([
      { hostId: 'pal-rasoi', date: '2026-10-30', leftoverKg: 3, covers: 20, note: '' },
      { hostId: 'pal-rasoi', date: '2026-11-01', leftoverKg: 1.5, covers: 30, note: 'y' },
    ]);
  });

  test('a date field is a plain YYYY-MM-DD whether it is a string or a local-midnight Date', () => {
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
