import { test } from 'node:test';
import { expect } from '../expect.ts';
import { transaction } from '../../src/db.ts';
import { deleteStopsCascade } from '../../src/trips/itinerary.ts';
import { testDatabase } from '../mongo.ts';

const TRIP = '11111111-1111-4111-8111-111111111111';

test('deleting stops removes their RSVPs and impact legs and unlinks bookings and reservations', async () => {
  const db = await testDatabase();
  try {
    const c = (name: string) => db.db.collection(name);
    await c('trip_stops').insertMany(['gone', 'kept'].map((id, i) => ({ _id: id as any, trip_id: TRIP, day_number: 1, minutes: i, title: id })));
    await c('trip_stop_rsvps').insertMany([{ stop_id: 'gone', user_id: 'usr_1', rsvp: 'going' }, { stop_id: 'kept', user_id: 'usr_1', rsvp: 'skip' }]);
    await c('impact_legs').insertMany([
      { trip_id: TRIP, from_stop_id: 'gone', to_stop_id: 'kept' },
      { trip_id: TRIP, from_stop_id: 'kept', to_stop_id: 'gone' },
      { trip_id: TRIP, from_stop_id: 'kept', to_stop_id: 'kept' },
    ]);
    await c('maker_bookings').insertMany([{ _id: 'booking' as any, trip_id: TRIP, stop_id: 'gone' }, { _id: 'other' as any, trip_id: TRIP, stop_id: 'kept' }]);
    await c('hospitality_reservations').insertOne({ _id: 'meal' as any, trip_id: TRIP, stop_id: 'gone' });

    await transaction(db, (session) => deleteStopsCascade(db.db, ['gone'], session));

    expect((await c('trip_stops').find().toArray()).map((s) => s._id)).toEqual(['kept']);
    expect((await c('trip_stop_rsvps').find().toArray()).map((r) => r.stop_id)).toEqual(['kept']);
    expect(await c('impact_legs').countDocuments()).toBe(1);
    const booking = await c('maker_bookings').findOne({ _id: 'booking' as any });
    expect(booking !== null && !('stop_id' in booking)).toBe(true);
    expect((await c('maker_bookings').findOne({ _id: 'other' as any }))?.stop_id).toBe('kept');
    const meal = await c('hospitality_reservations').findOne({ _id: 'meal' as any });
    expect(meal !== null && !('stop_id' in meal)).toBe(true);
  } finally {
    await db.close();
  }
});
