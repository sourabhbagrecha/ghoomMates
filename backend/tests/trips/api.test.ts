import { after, before, test } from 'node:test';
import express from 'express';
import { expect } from '../expect.ts';
import type { Database } from '../../src/db.ts';
import { ApiError, errorHandler, notFound } from '../../src/http.ts';
import { createMediaRouter, createMediaStorage } from '../../src/storage.ts';
import { createApp } from '../../src/trips/app.ts';
import { deleteTripAnswers } from '../../src/trips/squad.ts';
import type { User } from '../../src/auth/types.ts';
import { serve } from '../helpers.ts';
import { testDatabase } from '../mongo.ts';

// Drafts never call Gemini here: no key, no network
delete process.env.GEMINI_API_KEY;

let db: Database;
let server: Awaited<ReturnType<typeof serve>>;
const users = new Map<string, User>();

async function createUser(name: string) {
  const id = `usr_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const email = `${id}@test.local`;
  const now = new Date();
  await db.db.collection('users').insertOne({
    _id: id as any, username: id, google_id: id, email, email_verified: true, name, picture: null, preferences: {},
    created_at: now, updated_at: now, last_login_at: now,
  });
  users.set(id, { id, email, name, username: id, preferences: {}, googleId: id, emailVerified: true, createdAt: '', updatedAt: '', lastLoginAt: '' });
  return id;
}

before(async () => {
  db = await testDatabase();
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

// The test database goes away with the in-process server (tests/mongo.ts stops it after this file)
after(() => server.close());

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
  expect(photos.faceSummary).toEqual({ indexed: 0, noFaces: 0, pending: 1, failed: 0, faces: 0 });
  expect(photos.items[0].faces).toEqual({ status: 'pending', count: 0 });
  // The face service indexes it (a face_photos doc in another trip with the same name doesn't count)
  await db.db.collection('face_photos').insertMany([
    { bucket: 'b', object_name: upload.data.key, generation: 1, trip_id: trip.id, face_count: 2, status: 'indexed', indexed_at: new Date() },
    { bucket: 'b', object_name: upload.data.key, generation: 1, trip_id: crypto.randomUUID(), face_count: 5, status: 'indexed', indexed_at: new Date() },
  ]);
  const indexed = (await call(asha, `/api/trips/${trip.id}/photos`)).data;
  expect(indexed.faceSummary).toEqual({ indexed: 1, noFaces: 0, pending: 0, failed: 0, faces: 2 });
  expect(indexed.items[0].faces).toEqual({ status: 'indexed', count: 2 });
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
  await db.db.collection('users').updateOne({ _id: asha as any }, { $set: { preferences: { vibe: { adventure: 0.9, food: 0.8, nightlife: 0.2, culture: 0.5, chill: 0.6, shops: 0.3 } } } });
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

// users.preferences.taste and pref_answers in the shapes the prefs module writes (src/prefs/contract.ts)
function storedTaste(means: Record<string, number>, extra: Record<string, unknown> = {}) {
  const full: Record<string, number> = { adventure: 0.5, food: 0.5, nightlife: 0.5, culture: 0.5, chill: 0.5, shops: 0.5, ...means };
  return {
    v: 2, axes: Object.fromEntries(Object.entries(full).map(([axis, m]) => [axis, { a: 10 * m, b: 10 * (1 - m) }])),
    style: {}, tags: {}, dealbreakers: [], diet: null, answered: 10, updatedAt: '2026-11-19T10:00:00.000Z', ...extra,
  };
}

const UDAIPUR_CARDS: Record<string, { title: string; axes: Record<string, number>; place: Record<string, unknown> }> = {
  'exp:palace': { title: 'City Palace royal stories walk', axes: { culture: 1 }, place: { area: 'City Palace, Udaipur', startTime: '09:30 AM', duration: '2.5 hrs', priceRupees: 1099 } },
  'exp:boat': { title: 'Lake Pichola sunset boat ride', axes: { chill: 0.9, culture: 0.6 }, place: { area: 'Lal Ghat, Udaipur', startTime: '04:45 PM', duration: '2 hrs', priceRupees: 1299 } },
  'exp:food-walk': { title: 'Old city kachori and chaat walk', axes: { food: 1 }, place: { area: 'Jagdish Chowk, Udaipur', startTime: '05:30 PM', duration: '3 hrs' } },
  'exp:painting': { title: 'Mewar miniature painting workshop', axes: { culture: 1 }, place: { area: 'Hathi Pol, Udaipur', startTime: '10:00 AM', duration: '3 hrs' } },
};

async function swipe(userId: string, scope: string, cardId: string, verdict: 'nope' | 'like' | 'love' | 'skip') {
  const card = UDAIPUR_CARDS[cardId];
  const now = new Date();
  await db.db.collection('pref_answers').insertOne({
    user_id: userId, scope, card_id: cardId, format: 'swipe', ms: 800,
    reply: verdict === 'skip' ? { kind: 'skip' } : { kind: 'swipe', verdict },
    card: { title: card.title, kind: 'experience', axes: card.axes, tags: [], city: 'Udaipur', place: card.place },
    created_at: now, updated_at: now,
  });
}

async function udaipurSquad() {
  const riya = await createUser('Riya Shah');
  const kabir = await createUser('Kabir Mehta');
  const dee = await createUser('Dee Rao');
  const pat = await createUser('Pat Iyer');
  const trip = (await call(riya, '/api/trips', { name: 'Lake City', destination: 'Udaipur', startDate: '2026-12-11', endDate: '2026-12-13' })).data;
  for (const u of [kabir, dee, pat]) await call(u, '/api/trips/join', { code: trip.inviteCode });
  const setTaste = (id: string, taste: unknown) => db.db.collection('users').updateOne({ _id: id as any }, { $set: { 'preferences.taste': taste } });
  await setTaste(riya, storedTaste({ chill: 0.9 }, { style: { mornings: { sum: 1, weight: 2 } } }));
  await setTaste(kabir, storedTaste({ culture: 0.8 }));
  await setTaste(dee, storedTaste({ adventure: 0.2 }, { dealbreakers: ['heights'] }));
  // Riya loves the boat; Kabir likes everything; Dee only says no or skips; Pat hasn't swiped
  for (const id of Object.keys(UDAIPUR_CARDS)) {
    await swipe(riya, trip.id, id, id === 'exp:boat' ? 'love' : 'like');
    await swipe(kabir, trip.id, id, 'like');
    await swipe(dee, trip.id, id, id === 'exp:painting' ? 'nope' : 'skip');
  }
  await swipe(riya, 'core', 'exp:boat', 'like');
  return { riya, kabir, dee, pat, trip };
}

const stopsOf = (plan: { days: { stops: any[] }[] }) => plan.days.flatMap(d => d.stops);

test('squad insights for members, and never who said no', async () => {
  const { riya, dee, trip } = await udaipurSquad();
  const outsider = await createUser('Olu');
  const res = await call(riya, `/api/trips/${trip.id}/squad`);
  expect(res.status).toBe(200);
  const squad = res.data;
  expect(squad.city).toBe('Udaipur');
  expect(squad.members.map((m: { name: string }) => m.name)).toEqual(['Riya', 'Kabir', 'Dee', 'Pat']);
  expect(squad.pending).toEqual(['Pat']);
  expect(squad.members[0].isMe).toBe(true);
  expect(squad.members[0].coreDone).toBe(true);
  // Only your own count: anyone else's would give away how many cards they said no to
  expect(squad.members.map((m: { tripAnswered: number }) => m.tripAnswered)).toEqual([4, 0, 0, 0]);
  // Kabir and Dee have a taste but no core swipes: not pending, not core-done
  expect(squad.members.map((m: { coreDone: boolean }) => m.coreDone)).toEqual([true, false, false, false]);
  expect(squad.mustDos).toEqual([{ cardId: 'exp:boat', title: 'Lake Pichola sunset boat ride', fans: ['Riya'] }]);
  expect(squad.consensus).toHaveLength(3);
  expect(squad.contested).toEqual([{ cardId: 'exp:painting', title: 'Mewar miniature painting workshop', fans: ['Riya', 'Kabir'] }]);
  expect(squad.dealbreakers).toEqual(['heights']);
  expect(squad.style.mornings.value).toBe(0.5);
  const { members: _members, pending: _pending, twin: _twin, ...rest } = squad;
  expect(JSON.stringify(rest).includes('Dee')).toBe(false);

  // Your own count takes skips too: it's how far through the deck you are
  const mine = (await call(dee, `/api/trips/${trip.id}/squad`)).data.members.find((m: { isMe: boolean }) => m.isMe);
  expect(mine.tripAnswered).toBe(4);

  expect((await call(outsider, `/api/trips/${trip.id}/squad`)).status).toBe(404);
});

test('a group-fair draft from a partial squad, and why-lines that survive saving and editing', async () => {
  const { riya, kabir, trip } = await udaipurSquad();

  // A plan that predates the squad's swipes is stale
  const early = await call(riya, `/api/trips/${trip.id}/stops`, { dayNumber: 1, time: '10:00 AM', title: 'Breakfast', tag: 'Food' });
  expect(early.status).toBe(201);
  let plan = (await call(riya, `/api/trips/${trip.id}/itinerary`)).data;
  expect(plan.stale).toBe(true);
  expect(plan.pending).toEqual(['Pat']);
  const plain = plan.days[0].stops[0];
  expect([plain.axis, plain.forMembers, plain.split, plain.why, plain.cardId]).toEqual([null, [], false, null, null]);

  // No Gemini key: the plan comes from the squad's swiped cards
  const draft = (await call(kabir, `/api/trips/${trip.id}/itinerary/draft`, {})).data;
  expect(draft.source).toBe('shortlist');
  expect(draft.basis).toEqual({ answered: 3, total: 4, pending: ['Pat'] });
  expect(draft.days).toHaveLength(3);
  const options = draft.days.flatMap((d: { slots: unknown[][] }) => d.slots.flat()) as { cardId: string | null; why: string | null }[];
  expect(options.find(o => o.cardId === 'exp:boat')!.why).toBe('Riya’s must-do');
  expect(options.some(o => o.cardId === 'exp:painting')).toBe(false);
  // Dee is only in the fairness scores (every member with data is); no stop or why-line names her
  expect(JSON.stringify(draft.days).includes('Dee')).toBe(false);
  expect(draft.fairness.members.map((m: { name: string }) => m.name)).toEqual(['Riya', 'Kabir', 'Dee']);

  const days = draft.days.map((d: { title: string; slots: unknown[][] }) => ({ title: d.title, stops: d.slots.map(o => o[0]) }));
  expect((await call(kabir, `/api/trips/${trip.id}/itinerary`, { days }, 'PUT')).status).toBe(200);
  plan = (await call(riya, `/api/trips/${trip.id}/itinerary`)).data;
  expect(plan.stale).toBe(false);
  const saved = stopsOf(plan).find(s => s.cardId === 'exp:boat');
  expect([saved.axis, saved.forMembers, saved.split, saved.why]).toEqual(['chill', ['Riya'], false, 'Riya’s must-do']);

  // An edit that doesn't send the why-fields keeps them; one that does changes only those
  const patch = (body: unknown) => call(riya, `/api/trips/${trip.id}/stops/${saved.id}`, body, 'PATCH');
  const reload = async () => stopsOf((await call(riya, `/api/trips/${trip.id}/itinerary`)).data).find(s => s.id === saved.id);
  expect((await patch({ title: 'Sunset boat', time: '05:00 PM', tag: 'Chill' })).status).toBe(200);
  let edited = await reload();
  expect([edited.title, edited.axis, edited.forMembers, edited.why, edited.cardId]).toEqual(['Sunset boat', 'chill', ['Riya'], 'Riya’s must-do', 'exp:boat']);
  expect((await patch({ title: 'Sunset boat', why: 'Golden hour on the lake', split: true })).status).toBe(200);
  edited = await reload();
  expect([edited.why, edited.split, edited.cardId, edited.forMembers]).toEqual(['Golden hour on the lake', true, 'exp:boat', ['Riya']]);
  expect((await patch({ title: 'Sunset boat', why: 'x'.repeat(121) })).status).toBe(400);
  expect((await patch({ title: 'Sunset boat', axis: 'karaoke' })).status).toBe(400);
  expect((await patch({ title: 'Sunset boat', forMembers: Array.from({ length: 11 }, (_, i) => `M${i}`) })).status).toBe(400);

  // Someone swipes again after the plan was shared: it's stale until it is saved again
  await db.db.collection('users').updateOne({ _id: kabir as any }, { $set: { 'preferences.taste.updatedAt': new Date(Date.now() + 60_000).toISOString() } });
  expect((await call(riya, `/api/trips/${trip.id}/itinerary`)).data.stale).toBe(true);

  // A one-day redo keeps the basis
  const day2 = (await call(riya, `/api/trips/${trip.id}/itinerary/draft`, { day: 2 })).data;
  expect(day2.days).toHaveLength(1);
  expect(day2.basis.pending).toEqual(['Pat']);
});

test('pref_answers cascade with a deleted trip or a member who leaves', async () => {
  const { riya, dee, trip } = await udaipurSquad();
  const count = (filter: object) => db.db.collection('pref_answers').countDocuments(filter);
  expect(await count({ scope: trip.id })).toBe(12);
  expect(await deleteTripAnswers(db.db, trip.id, dee)).toBe(4);
  expect(await count({ scope: trip.id, user_id: dee })).toBe(0);
  expect(await count({ scope: trip.id })).toBe(8);
  expect(await deleteTripAnswers(db.db, trip.id)).toBe(8);
  expect(await count({ scope: trip.id })).toBe(0);
  // The core deck isn't the trip's
  expect(await count({ scope: 'core', user_id: riya })).toBe(1);
});
