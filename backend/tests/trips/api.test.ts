import { after, before, test } from 'node:test';
import express from 'express';
import { expect } from '../expect.ts';
import { openDatabase, type Database } from '../../src/db.ts';
import { loadEnv } from '../../src/env.ts';
loadEnv();
import { ApiError, errorHandler, notFound } from '../../src/http.ts';
import { createMediaRouter, createMediaStorage } from '../../src/storage.ts';
import { createApp } from '../../src/trips/app.ts';
import type { User } from '../../src/auth/types.ts';
import { serve } from '../helpers.ts';

// Run against the test database: DB_NAME=ghoomates_test, or a DATABASE_URL pointing at it.
let db: Database;
let server: Awaited<ReturnType<typeof serve>>;
const users = new Map<string, User>();

async function createUser(name: string) {
  const id = `usr_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const { rows: [row] } = await db.pool.query(
    `INSERT INTO users (id, username, google_id, email, email_verified, name) VALUES ($1, $1, $1, $2, true, $3) RETURNING id, email, name`,
    [id, `${id}@test.local`, name],
  );
  users.set(id, { ...row, username: id, preferences: {}, googleId: id, emailVerified: true, createdAt: '', updatedAt: '', lastLoginAt: '' });
  return id;
}

before(async () => {
  db = await openDatabase();
  // Local media storage: the same signed-URL flow as GCS, without network access
  const storage = createMediaStorage('test-secret-'.repeat(4), {});
  const authenticate = async (token: string) => {
    const user = users.get(token);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Bad token');
    return user;
  };
  const app = express()
    .use('/api/trips', createApp(db, storage, authenticate, 'http://localhost:5173'))
    .use('/api/media', createMediaRouter(storage))
    .use(notFound).use(errorHandler);
  server = await serve(app);
});

after(async () => {
  await server.close();
  await db.close();
});

async function call(token: string | null, path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  const response = await server.request(path, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: response.status === 204 ? null : await response.json() as any };
}

test('create, invite, join, split an expense, settle, and upload a photo', async () => {
  const asha = await createUser('Asha');
  const ben = await createUser('Ben');
  const chen = await createUser('Chen');

  expect((await call(null, '/api/trips')).status).toBe(401);

  const created = await call(asha, '/api/trips', { name: 'Goa Beach Break', groupName: 'Goa Gang', destination: 'Goa', startDate: '2026-12-12', endDate: '2026-12-15', cover: 'goa' });
  expect(created.status).toBe(201);
  const trip = created.data;
  expect(trip.role).toBe('organiser');
  expect(trip.startDate).toBe('2026-12-12');
  expect(trip.members).toHaveLength(1);
  expect(trip.inviteUrl).toBe(`http://localhost:5173/#/join/${trip.inviteCode}`);

  // Non-members can't see the trip, but can preview the invite without signing in
  expect((await call(ben, `/api/trips/${trip.id}`)).status).toBe(404);
  const preview = await call(null, `/api/trips/invites/${trip.inviteCode}`);
  expect(preview.status).toBe(200);
  expect(preview.data.invitedBy.name).toBe('Asha');
  expect(preview.data.alreadyMember).toBe(false);

  expect((await call(ben, '/api/trips/join', { code: trip.inviteCode })).status).toBe(200);
  // Joining twice is a no-op
  expect((await call(ben, '/api/trips/join', { code: trip.inviteCode })).data.members).toHaveLength(2);
  const joined = await call(chen, '/api/trips/join', { code: trip.inviteCode.toUpperCase() });
  expect(joined.data.members).toHaveLength(3);
  expect((await call(null, '/api/trips/join', { code: 'nope1234' })).status).toBe(401);
  expect((await call(chen, '/api/trips/join', { code: 'nope1234' })).status).toBe(404);

  const [a, b, c] = joined.data.members.map((m: { memberId: string }) => m.memberId);
  const list = await call(ben, '/api/trips');
  expect(list.data.items.some((t: { id: string }) => t.id === trip.id)).toBe(true);

  // Asha pays ₹900 for dinner, split equally
  const dinner = await call(ben, `/api/trips/${trip.id}/expenses`, {
    description: 'Beach-shack dinner', amountPaise: 90000, payerMemberId: a, category: 'food',
    split: { type: 'equal', participants: [{ memberId: a }, { memberId: b }, { memberId: c }] },
  });
  expect(dinner.status).toBe(201);
  expect(dinner.data.category).toBe('food');
  expect(dinner.data.shares.map((s: { amountPaise: number }) => s.amountPaise)).toEqual([30000, 30000, 30000]);
  // Ben pays ₹300 for a cab, exact split
  expect((await call(ben, `/api/trips/${trip.id}/expenses`, {
    description: 'Cab', amountPaise: 30000, payerMemberId: b, category: 'travel',
    split: { type: 'exact', participants: [{ memberId: a, value: 10000 }, { memberId: c, value: 20000 }] },
  })).status).toBe(201);
  expect((await call(ben, `/api/trips/${trip.id}/expenses`, { description: 'Bad', amountPaise: 100, payerMemberId: a, category: 'nope', split: { type: 'equal', participants: [{ memberId: a }] } })).status).toBe(400);

  const summary = (await call(chen, `/api/trips/${trip.id}/summary`)).data;
  expect(summary.totalSpentPaise).toBe(120000);
  expect(summary.memberId).toBe(c);
  const net = Object.fromEntries(summary.balances.map((x: { memberId: string; netPaise: number }) => [x.memberId, x.netPaise]));
  expect(net[a]).toBe(50000);
  expect(net[b]).toBe(0);
  expect(net[c]).toBe(-50000);
  expect(summary.transfers).toEqual([{ fromMemberId: c, toMemberId: a, amountPaise: 50000 }]);
  expect((await call(chen, `/api/trips/${trip.id}/expenses`)).data.items).toHaveLength(2);

  // Ben can't record a payment between Chen and Asha; Chen can
  expect((await call(ben, `/api/trips/${trip.id}/settlements`, { fromMemberId: c, toMemberId: a, amountPaise: 50000 })).status).toBe(400);
  expect((await call(chen, `/api/trips/${trip.id}/settlements`, { fromMemberId: c, toMemberId: a, amountPaise: 50000, note: 'via GPay' })).status).toBe(201);
  expect((await call(asha, `/api/trips/${trip.id}/summary`)).data.transfers).toEqual([]);

  // Photo: get a signed URL, PUT the bytes, register it, then read it back through its signed URL
  const upload = await call(ben, `/api/trips/${trip.id}/uploads`, { kind: 'photo', contentType: 'image/png' });
  expect(upload.status).toBe(201);
  expect((await call(ben, `/api/trips/${trip.id}/photos`, { photos: [{ key: upload.data.key }] })).status).toBe(400);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const put = await server.request(upload.data.upload.url, { method: 'PUT', headers: upload.data.upload.headers, body: png });
  expect(put.status).toBe(200);
  expect((await call(ben, `/api/trips/${trip.id}/photos`, { photos: [{ key: upload.data.key, width: 1, height: 1 }] })).status).toBe(201);
  expect((await call(ben, `/api/trips/${trip.id}/photos`, { photos: [{ key: `trips/${crypto.randomUUID()}/photos/x.png` }] })).status).toBe(400);
  const photos = (await call(asha, `/api/trips/${trip.id}/photos`)).data;
  expect(photos.total).toBe(1);
  const image = await server.request(photos.items[0].url);
  expect(image.status).toBe(200);
  expect(Buffer.from(await image.arrayBuffer()).equals(png)).toBe(true);
  expect((await server.request(photos.items[0].url.replace(/sig=[^&]+/, 'sig=forged'))).status).toBe(403);

  // Receipts attach to expenses the same way
  const receipt = await call(asha, `/api/trips/${trip.id}/uploads`, { kind: 'receipt', contentType: 'image/png' });
  await server.request(receipt.data.upload.url, { method: 'PUT', headers: receipt.data.upload.headers, body: png });
  const withReceipt = await call(asha, `/api/trips/${trip.id}/expenses`, {
    description: 'Scooters', amountPaise: 1500, payerMemberId: a, category: 'travel', receiptKey: receipt.data.key,
    split: { type: 'equal', participants: [{ memberId: a }, { memberId: b }] },
  });
  expect(withReceipt.status).toBe(201);
  expect(typeof withReceipt.data.receiptUrl).toBe('string');

  const renamed = await call(asha, `/api/trips/${trip.id}`, { name: 'Goa 2026' }, 'PATCH');
  expect(renamed.data.name).toBe('Goa 2026');
});

test('draft, share and edit an itinerary with RSVPs', async () => {
  const asha = await createUser('Asha');
  const ben = await createUser('Ben');
  await db.pool.query(`UPDATE users SET preferences = $2 WHERE id = $1`, [asha, JSON.stringify({ vibe: { adventure: 0.9, food: 0.8, nightlife: 0.2, culture: 0.5, chill: 0.6, shops: 0.3 } })]);
  const trip = (await call(asha, '/api/trips', { name: 'Jaipur Royal Weekend', destination: 'Jaipur', startDate: '2026-12-11', endDate: '2026-12-13', details: { tweaks: ['More food stops'] } })).data;
  await call(ben, '/api/trips/join', { code: trip.inviteCode });

  // Gemini when GEMINI_API_KEY is set, otherwise the template; both return slots with options
  const draft = await call(asha, `/api/trips/${trip.id}/itinerary/draft`, {});
  expect(draft.status).toBe(200);
  expect(draft.data.days).toHaveLength(3);
  expect(draft.data.days[0].slots[0].length >= 1).toBe(true);

  const days = draft.data.days.map((d: { title: string; slots: { time: string; title: string; tag: string; place: string; notes: string }[][] }) => ({ title: d.title, stops: d.slots.map((options) => options[0]) }));
  const saved = await call(asha, `/api/trips/${trip.id}/itinerary`, { days }, 'PUT');
  expect(saved.status).toBe(200);
  expect(saved.data.days).toHaveLength(3);
  const first = saved.data.days[0].stops[0];

  expect((await call(ben, `/api/trips/${trip.id}/stops/${first.id}/rsvp`, { rsvp: 'going' }, 'PUT')).status).toBe(200);
  const added = await call(ben, `/api/trips/${trip.id}/stops`, { dayNumber: 2, time: '6:15 am', title: 'Sunrise at Nahargarh', tag: 'Adventure' });
  expect(added.status).toBe(201);
  expect((await call(ben, `/api/trips/${trip.id}/stops/${added.data.id}`, { title: 'Sunrise at Nahargarh Fort', time: '06:00 AM', tag: 'Adventure', dayNumber: 2 }, 'PATCH')).status).toBe(200);

  const plan = (await call(asha, `/api/trips/${trip.id}/itinerary`)).data;
  const sunrise = plan.days[1].stops[0];
  expect(sunrise.title).toBe('Sunrise at Nahargarh Fort');
  expect(sunrise.time).toBe('06:00 AM');
  // Everyone is going until they say otherwise
  expect(sunrise.going).toHaveLength(2);
  expect(sunrise.myRsvp).toBe('going');
  expect(sunrise.answered).toBe(false);
  expect(plan.days[0].stops[0].going).toHaveLength(2);

  expect((await call(asha, `/api/trips/${trip.id}/stops/${added.data.id}/rsvp`, { rsvp: 'skip' }, 'PUT')).status).toBe(200);
  const skipped = (await call(asha, `/api/trips/${trip.id}/itinerary`)).data.days[1].stops[0];
  expect(skipped.going).toHaveLength(1);
  expect(skipped.myRsvp).toBe('skip');
  expect(skipped.answered).toBe(true);
  expect((await call(asha, `/api/trips/${trip.id}/stops/${added.data.id}`, undefined, 'DELETE')).status).toBe(204);
});
