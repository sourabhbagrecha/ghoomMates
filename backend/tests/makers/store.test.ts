import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { ApiError } from '../../src/http.ts';
import { MongoMakersStore, type NewBooking } from '../../src/makers/store.ts';
import { testDatabase } from '../mongo.ts';

const booking = (over: Partial<NewBooking> = {}): NewBooking => ({
  tripId: '11111111-1111-4111-8111-111111111111', makerId: 'mahendra-chitera', bookedBy: 'usr_asha', dayNumber: 2,
  date: '2026-11-12', slot: '10:30 AM', people: 4, pricePerPerson: 1500, total: 6000, note: '', ...over,
});

async function rejected(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return err instanceof ApiError ? `${err.status} ${err.code}` : String(err);
  }
  return 'booked';
}

describe('the MongoDB makers store', () => {
  test('fills a slot to capacity, turns the next squad away, and cancelling frees the seats', async () => {
    const database = await testDatabase();
    const store = new MongoMakersStore(database);
    const first = await store.create(booking(), 8);
    expect(first.status).toBe('confirmed');
    const second = await store.create(booking({ tripId: '22222222-2222-4222-8222-222222222222', people: 4 }), 8);
    expect(await store.booked('mahendra-chitera', '2026-11-12')).toEqual({ '10:30 AM': 8 });

    expect(await rejected(store.create(booking({ tripId: '33333333-3333-4333-8333-333333333333', people: 1 }), 8))).toBe('409 SLOT_UNAVAILABLE');
    // The rejected booking left no trace and didn't take any seats
    expect(await database.db.collection('maker_bookings').countDocuments()).toBe(2);
    expect((await database.db.collection('maker_slots').findOne({}))?.people).toBe(8);
    // Another slot is unaffected
    expect((await store.create(booking({ slot: '02:00 PM', people: 8 }), 8)).people).toBe(8);

    await store.cancel(second.id);
    await store.cancel(second.id);
    expect(await store.booked('mahendra-chitera', '2026-11-12')).toEqual({ '10:30 AM': 4, '02:00 PM': 8 });
    const third = await store.create(booking({ tripId: '33333333-3333-4333-8333-333333333333', people: 4 }), 8);
    expect(await store.findOpen(third.tripId, 'mahendra-chitera', '2026-11-12', '10:30 AM')).toEqual(third);
  });

  test('two squads racing for the last seats: only one gets them', async () => {
    const store = new MongoMakersStore(await testDatabase());
    const results = await Promise.all(['a', 'b', 'c'].map(n => rejected(store.create(booking({ tripId: `${n}-trip`, people: 5 }), 10))));
    expect(results.filter(r => r === 'booked')).toHaveLength(2);
    expect(results.filter(r => r === '409 SLOT_UNAVAILABLE')).toHaveLength(1);
  });

  test('lists a trip’s confirmed bookings by date and attaches the itinerary stop', async () => {
    const store = new MongoMakersStore(await testDatabase());
    const later = await store.create(booking({ date: '2026-11-13' }), 8);
    const early = await store.create(booking(), 8);
    const gone = await store.create(booking({ slot: '02:00 PM' }), 8);
    await store.cancel(gone.id);
    await store.attachStop(early.id, 'stop-1');
    const list = await store.forTrip(early.tripId);
    expect(list.map(b => b.id)).toEqual([early.id, later.id]);
    expect(list[0].stopId).toBe('stop-1');
  });
});
