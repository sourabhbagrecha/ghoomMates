import { after, before, test } from 'node:test';
import express from 'express';
import { expect } from '../expect.ts';
import type { Database } from '../../src/db.ts';
import { errorHandler, notFound } from '../../src/http.ts';
import { signJwt } from '../../src/auth/jwt.ts';
import { createMediaStorage } from '../../src/storage.ts';
import { createApp as createTripsApp } from '../../src/trips/app.ts';
import type { FaceMatch, FaceSearch } from '../../src/trips/faces.ts';
import { serve } from '../helpers.ts';
import { testDatabase } from '../mongo.ts';

// Photo search routes: people (any member with a selfie), expressions and scenes, with the face-indexer's documents
// (selfie_faces, faces, photo_tags) written straight into the test database and a fake vector search.

const SECRET = 'photo-search-test-secret-at-least-32-chars';
const vector = (i: number) => Array.from({ length: 512 }, (_, j) => (j === i ? 1 : 0));

let db: Database;
let server: Awaited<ReturnType<typeof serve>>;
// Face matches per selfie vector (keyed by the index of its 1), as the vector search would return them
const facesOf = new Map<number, FaceMatch[]>();

before(async () => {
  db = await testDatabase();
  const storage = createMediaStorage(SECRET, {});
  const authenticate = async (token: string) => {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return { id: payload.userId, email: payload.email, name: payload.name } as any;
  };
  const faceSearch: FaceSearch = {
    search: async (_trip, embedding) => ({ matches: facesOf.get(embedding.indexOf(1)) ?? [], threshold: 0.4, truncated: false }),
  };
  server = await serve(express()
    .use('/api/trips', createTripsApp(db, storage, authenticate, 'http://localhost:5173', faceSearch))
    .use(notFound).use(errorHandler));
});

after(() => server.close());

async function createUser(name: string, selfie?: { slot: number; status?: string }) {
  const id = `usr_test_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const now = new Date();
  const selfieKey = selfie ? `users/${id}/selfies/s.jpg` : undefined;
  await db.db.collection('users').insertOne({
    _id: id as any, username: id, google_id: id, email: `${id}@test.local`, email_verified: true, name, picture: null,
    preferences: {}, created_at: now, updated_at: now, last_login_at: now, ...(selfieKey ? { selfie_key: selfieKey } : {}),
  });
  if (selfie && selfie.status !== 'processing') {
    await db.db.collection('selfie_faces').insertOne({
      object_name: selfieKey, user_id: id, status: selfie.status ?? 'indexed', embedding: vector(selfie.slot), model_name: 'Facenet512', detector: 'retinaface',
    });
  }
  return { id, token: signJwt({ userId: id, email: `${id}@test.local`, name }, SECRET) };
}

async function call(token: string, path: string, body?: unknown) {
  const response = await server.request(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => null) as any };
}

const face = (emotion: string, smile = 0) => ({ x: 1, y: 1, w: 10, h: 10, distance: 0.2, emotion, smile });
const match = (key: string, ...faces: ReturnType<typeof face>[]): FaceMatch => ({ object_name: key, width: 100, height: 100, distance: 0.2, faces });

test('search photos by any member, expression and scene', async () => {
  const asha = await createUser('Asha Rao', { slot: 1 });
  const bhavya = await createUser('Bhavya Jain', { slot: 2 });
  const chen = await createUser('Chen Li');
  const outsider = await createUser('Dev');
  const trip = (await call(asha.token, '/api/trips', { name: 'Udaipur', groupName: 'Squad' })).data;
  for (const u of [bhavya, chen]) expect((await call(u.token, '/api/trips/join', { code: trip.inviteCode })).status).toBe(200);

  // Members say who can be found in photos
  const detail = (await call(asha.token, `/api/trips/${trip.id}`)).data;
  const selfieOf = Object.fromEntries(detail.members.map((m: any) => [m.name, m.selfie]));
  expect(selfieOf).toEqual({ 'Asha Rao': 'ready', 'Bhavya Jain': 'ready', 'Chen Li': 'none' });

  const key = (n: string) => `trips/${trip.id}/photos/${n}.jpg`;
  const photos = ['hike1', 'hike2', 'haldi1', 'hall1'];
  const now = Date.now();
  await db.db.collection('trip_photos').insertMany(photos.map((n, i) => ({
    _id: `${trip.id}-${n}` as any, trip_id: trip.id, object_key: key(n), uploaded_by: asha.id, content_type: 'image/jpeg', size_bytes: 1,
    width: 100, height: 100, caption: n === 'hall1' ? 'Keynote day' : undefined, created_at: new Date(now + i),
  })));
  await db.db.collection('photo_tags').insertMany([
    { object_name: key('hike1'), trip_id: trip.id, status: 'tagged', caption: 'Friends on a mountain trail', tags: ['hiking', 'mountain'] },
    { object_name: key('hike2'), trip_id: trip.id, status: 'tagged', caption: 'A trek at sunrise', tags: ['trek', 'sunrise'] },
    { object_name: key('haldi1'), trip_id: trip.id, status: 'tagged', caption: 'Turmeric ceremony', tags: ['haldi', 'wedding'] },
    { object_name: key('hall1'), trip_id: trip.id, status: 'tagged', caption: 'Speaker on a stage', tags: ['conference hall', 'stage'] },
  ]);
  await db.db.collection('faces').insertMany([
    { trip_id: trip.id, object_name: key('haldi1'), x: 0, y: 0, w: 5, h: 5, emotion: 'happy', smile: 0.9 },
    { trip_id: trip.id, object_name: key('hall1'), x: 0, y: 0, w: 5, h: 5, emotion: 'neutral', smile: 0.1 },
  ]);
  facesOf.set(1, [match(key('hike1'), face('happy', 0.9)), match(key('haldi1'), face('neutral')), match(key('hall1'), face('neutral'))]);
  facesOf.set(2, [match(key('hike2'), face('neutral')), match(key('haldi1'), face('happy', 0.8))]);

  const find = (body: object, who = asha) => call(who.token, `/api/trips/${trip.id}/photos/find`, body);
  const ids = (r: { data: any }) => [...r.data.photoIds].sort();
  const id = (n: string) => `${trip.id}-${n}`;

  // Someone else's photos, and two people either way
  expect(ids(await find({ userIds: [bhavya.id] }))).toEqual([id('haldi1'), id('hike2')]);
  const either = await find({ userIds: [asha.id, bhavya.id] });
  expect(ids(either)).toEqual([id('haldi1'), id('hall1'), id('hike1'), id('hike2')].sort());
  expect(either.data.label).toBe('You & Bhavya');
  const together = await find({ userIds: [asha.id, bhavya.id], match: 'all' });
  expect([ids(together), together.data.label]).toEqual([[id('haldi1')], 'You with Bhavya']);

  // Expressions belong to the matched person's own face
  expect(ids(await find({ userIds: [asha.id], expression: 'happy' }))).toEqual([id('hike1')]);
  expect(ids(await find({ userIds: [bhavya.id], expression: 'happy' }))).toEqual([id('haldi1')]);
  // With no person: anyone's face
  expect(ids(await find({ expression: 'happy' }))).toEqual([id('haldi1')]);

  // Scenes: tags, stems, captions (the indexer's and the uploader's), combined with people
  expect(ids(await find({ scene: 'hike' }))).toEqual([id('hike1')]);
  expect(ids(await find({ scene: 'conference hall' }))).toEqual([id('hall1')]);
  expect(ids(await find({ scene: 'keynote' }))).toEqual([id('hall1')]);
  const bhavyaHaldi = await find({ userIds: [bhavya.id], scene: 'haldi' });
  expect([ids(bhavyaHaldi), bhavyaHaldi.data.label]).toEqual([[id('haldi1')], 'Bhavya · haldi']);

  // People without a selfie are skipped, and only fail the search when nobody else can be searched
  const withChen = await find({ userIds: [bhavya.id, chen.id] });
  expect([withChen.status, withChen.data.skipped.map((s: any) => [s.name, s.status])]).toEqual([200, [['Chen', 'none']]]);
  const onlyChen = await find({ userIds: [chen.id] });
  expect([onlyChen.status, onlyChen.data.error.code]).toEqual([409, 'NO_SELFIE']);

  // Only trip members, only for members
  expect((await find({ userIds: [outsider.id] })).data.error.code).toBe('NOT_A_MEMBER');
  expect((await find({ userIds: [asha.id] }, outsider)).status).toBe(404);
  expect((await find({})).status).toBe(400);

  // The search box (no Gemini here: the keyword parser)
  const search = (query: string) => call(asha.token, `/api/trips/${trip.id}/photos/search`, { query });
  const smiling = await search('show me all photos where I was smiling');
  expect([ids(smiling), smiling.data.filter]).toEqual([[id('hike1')], { userIds: [asha.id], match: 'any', expression: 'happy' }]);
  expect(ids(await search('give me asha’s and bhavya’s photos'))).toEqual([id('haldi1'), id('hall1'), id('hike1'), id('hike2')].sort());
  expect(ids(await search('all photos of Bhavya from the haldi event'))).toEqual([id('haldi1')]);
  expect(ids(await search('my hiking photos'))).toEqual([id('hike1')]);

  // The album carries each photo's tags and caption for the chips and the viewer
  const album = (await call(asha.token, `/api/trips/${trip.id}/photos`)).data.items;
  const hall = album.find((p: any) => p.id === id('hall1'));
  expect([hall.tags, hall.sceneCaption]).toEqual([['conference hall', 'stage'], 'Speaker on a stage']);
});
