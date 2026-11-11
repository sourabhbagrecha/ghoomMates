import { after, before, test } from 'node:test';
import express from 'express';
import { expect } from '../expect.ts';
import type { Database } from '../../src/db.ts';
import { errorHandler, notFound } from '../../src/http.ts';
import { createApp as createAuthApp } from '../../src/auth/app.ts';
import { createMongoOAuthDatabase } from '../../src/auth/database.ts';
import { signJwt } from '../../src/auth/jwt.ts';
import { OAuthService } from '../../src/auth/service.ts';
import { createMediaRouter, createMediaStorage, type MediaStorage } from '../../src/storage.ts';
import { createApp as createTripsApp } from '../../src/trips/app.ts';
import type { FaceSearch } from '../../src/trips/faces.ts';
import { serve } from '../helpers.ts';
import { testDatabase } from '../mongo.ts';

// Selfie lifecycle: upload to media storage, record it on the profile, serve it by a stable URL, and find-me with
// the embedding the face-indexer stored (or, before it has, by embedding the stored selfie once).

const SECRET = 'selfie-test-secret-that-is-at-least-32-chars';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
const VECTOR = Array.from({ length: 512 }, (_, i) => (i === 0 ? 1 : 0));

let db: Database;
let storage: MediaStorage;
let server: Awaited<ReturnType<typeof serve>>;
const searches: { kind: 'selfie' | 'vector'; payload: unknown }[] = [];

before(async () => {
  db = await testDatabase();
  storage = createMediaStorage(SECRET, {});
  const authDb = createMongoOAuthDatabase(db);
  const auth = new OAuthService(authDb, { jwtSecret: SECRET });
  const authenticate = async (token: string) => (await auth.verifySessionToken(token)).user;
  const faceSearch: FaceSearch = {
    search: async (_trip, selfies) => {
      searches.push({ kind: 'selfie', payload: selfies });
      return { matches: [], threshold: 0.4, truncated: false, embeddings: [VECTOR] };
    },
    searchByEmbeddings: async (_trip, embeddings) => {
      searches.push({ kind: 'vector', payload: embeddings });
      return { matches: [], threshold: 0.4, truncated: false };
    },
  };
  server = await serve(express()
    .use('/api/trips', createTripsApp(db, storage, authenticate, 'http://localhost:5173', faceSearch))
    .use('/api/media', createMediaRouter(storage))
    .use('/auth', createAuthApp(authDb, { jwtSecret: SECRET, storage }))
    .use(notFound).use(errorHandler));
});

after(() => server.close());

async function createUser(name: string) {
  const id = `usr_test_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const now = new Date();
  await db.db.collection('users').insertOne({
    _id: id as any, username: id, google_id: id, email: `${id}@test.local`, email_verified: true, name, picture: null,
    preferences: {}, created_at: now, updated_at: now, last_login_at: now,
  });
  return { id, token: signJwt({ userId: id, email: `${id}@test.local`, name }, SECRET) };
}

async function call(token: string, path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  const response = await server.request(path, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => null) as any };
}

// What the app does: ask for a signed URL, PUT the image there, return the key
async function upload(token: string, kind: 'selfie' | 'avatar') {
  const { status, data } = await call(token, '/auth/uploads', { kind, contentType: 'image/jpeg', size: JPEG.length });
  expect(status).toBe(201);
  const put = await server.request(data.upload.url, { method: 'PUT', headers: data.upload.headers, body: JPEG });
  expect(put.status).toBe(200);
  return data.key as string;
}

test('a selfie is uploaded to storage and the profile points at it by a stable URL', async () => {
  const asha = await createUser('Asha');
  const key = await upload(asha.token, 'selfie');
  expect(key.startsWith(`users/${asha.id}/selfies/`)).toBe(true);

  const saved = await call(asha.token, '/auth/profile', { selfieKey: key }, 'PATCH');
  expect(saved.status).toBe(200);
  expect(saved.data.user.selfie).toBe(`/api/media/${key}`);
  // The selfie is also the profile photo, stored as a URL and never as image data
  expect(saved.data.user.picture).toBe(`/api/media/${key}`);
  expect((await db.db.collection('users').findOne({ _id: asha.id as any }))?.selfie_key).toBe(key);

  // The stable URL redirects to a fresh signed read URL, which serves the image
  const redirect = await server.request(`/api/media/${key}`, { redirect: 'manual' });
  expect(redirect.status).toBe(302);
  const image = await server.request(redirect.headers.get('location')!);
  expect(Buffer.from(await image.arrayBuffer()).equals(JPEG)).toBe(true);
  expect((await server.request('/api/media/users/nope.jpg', { redirect: 'manual' })).status).toBe(404);
});

test('profile pictures must be this user’s finished uploads, never inline data', async () => {
  const asha = await createUser('Asha');
  const ben = await createUser('Ben');
  const bens = await upload(ben.token, 'selfie');
  const patch = (body: unknown) => call(asha.token, '/auth/profile', body, 'PATCH');

  expect((await patch({ selfieKey: bens })).status).toBe(400);
  expect((await patch({ selfieKey: `users/${asha.id}/selfies/${crypto.randomUUID()}.jpg` })).data.error.code).toBe('UPLOAD_NOT_FOUND');
  expect((await patch({ selfieKey: await upload(asha.token, 'avatar') })).status).toBe(400);
  expect((await patch({ picture: 'data:image/jpeg;base64,AAAA' })).data.error.code).toBe('PICTURE_UPLOAD_REQUIRED');
  expect((await call(asha.token, '/auth/uploads', { kind: 'selfie', contentType: 'image/gif' })).status).toBe(400);
  expect((await call(asha.token, '/auth/uploads', { kind: 'selfie', contentType: 'image/jpeg', size: 7 * 1024 * 1024 })).status).toBe(413);
});

test('a separate profile photo keeps the selfie; replacing or deleting the selfie deletes the old object', async () => {
  const asha = await createUser('Asha');
  const first = await upload(asha.token, 'selfie');
  await call(asha.token, '/auth/profile', { selfieKey: first }, 'PATCH');
  const avatar = await upload(asha.token, 'avatar');
  const withAvatar = await call(asha.token, '/auth/profile', { pictureKey: avatar }, 'PATCH');
  expect(withAvatar.data.user.picture).toBe(`/api/media/${avatar}`);
  expect(withAvatar.data.user.selfie).toBe(`/api/media/${first}`);

  const second = await upload(asha.token, 'selfie');
  const replaced = await call(asha.token, '/auth/profile', { selfieKey: second, pictureKey: avatar }, 'PATCH');
  expect(replaced.data.user.selfie).toBe(`/api/media/${second}`);
  expect(replaced.data.user.picture).toBe(`/api/media/${avatar}`);
  await new Promise((r) => setTimeout(r, 50));
  expect(await storage.size(first)).toBe(null);

  // Deleting the selfie keeps a profile photo that isn't the selfie
  const deleted = await call(asha.token, '/auth/profile', { selfieKey: null }, 'PATCH');
  expect(deleted.data.user.selfie).toBe(undefined);
  expect(deleted.data.user.picture).toBe(`/api/media/${avatar}`);
  await new Promise((r) => setTimeout(r, 50));
  expect(await storage.size(second)).toBe(null);
});

test('find-me uses the stored selfie embedding, embedding the selfie only when the indexer has not yet', async () => {
  const asha = await createUser('Asha');
  const trip = (await call(asha.token, '/api/trips', { name: 'Goa', groupName: 'Goa Gang' })).data;
  const findMe = () => call(asha.token, `/api/trips/${trip.id}/photos/find-me`, undefined, 'POST');

  expect((await findMe()).data.error.code).toBe('NO_SELFIE');

  // Before the face-indexer has run: the stored selfie is embedded once and its vector kept
  const key = await upload(asha.token, 'selfie');
  await call(asha.token, '/auth/profile', { selfieKey: key }, 'PATCH');
  searches.length = 0;
  expect((await findMe()).status).toBe(200);
  expect(searches).toEqual([{ kind: 'selfie', payload: [JPEG.toString('base64')] }]);
  const kept = await db.db.collection('selfie_faces').findOne({ object_name: key });
  expect([kept?.user_id, kept?.status, kept?.generation, kept?.embedding.length]).toEqual([asha.id, 'indexed', 0, 512]);
  expect((await findMe()).status).toBe(200);
  expect(searches[1]).toEqual({ kind: 'vector', payload: [VECTOR] });

  // A new selfie the indexer already embedded (the usual case): only the vector search runs
  const next = await upload(asha.token, 'selfie');
  await call(asha.token, '/auth/profile', { selfieKey: next }, 'PATCH');
  const indexed = VECTOR.map((_, i) => (i === 1 ? 1 : 0));
  await db.db.collection('selfie_faces').insertOne({ object_name: next, user_id: asha.id, generation: 7, status: 'indexed', embedding: indexed });
  searches.length = 0;
  expect((await findMe()).status).toBe(200);
  expect(searches).toEqual([{ kind: 'vector', payload: [indexed] }]);

  // The indexer found no face in the selfie
  await db.db.collection('selfie_faces').updateOne({ object_name: next }, { $set: { status: 'no_face', embedding: null } });
  const noFace = await findMe();
  expect([noFace.status, noFace.data.error.code]).toEqual([422, 'NO_FACE']);
});
