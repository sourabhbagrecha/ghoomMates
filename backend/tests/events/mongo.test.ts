import { test } from 'node:test';
import { expect } from '../expect.ts';
import { createMongoEvents } from '../../src/events/app.ts';
import type { MediaStorage } from '../../src/storage.ts';
import { testDatabase } from '../mongo.ts';

test('hasStop matches a stop title on that day ignoring case, and treats the title literally', async () => {
  const db = await testDatabase();
  try {
    const trip = '11111111-1111-4111-8111-111111111111';
    await db.db.collection('trip_stops').insertOne({ _id: 'stop-1' as any, trip_id: trip, day_number: 2, title: 'Shilpgram Utsav (Day 1)' });
    const events = createMongoEvents(db, {} as MediaStorage, 'http://localhost:5173');
    expect(await events.hasStop(trip, 2, 'shilpgram utsav (day 1)')).toBe(true);
    expect(await events.hasStop(trip, 3, 'Shilpgram Utsav (Day 1)')).toBe(false);
    expect(await events.hasStop(trip, 2, 'Shilpgram.*')).toBe(false);
  } finally {
    await db.close();
  }
});
