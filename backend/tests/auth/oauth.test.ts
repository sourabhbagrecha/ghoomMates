import test from 'node:test';
import assert from 'node:assert/strict';
import { signJwt, verifyJwt } from '../../src/auth/jwt.ts';
import { createApp } from '../../src/auth/app.ts';
import { createInMemoryOAuthDatabase } from '../../src/auth/database.ts';
import { mount, serve } from '../helpers.ts';

const TEST_SECRET = 'a-very-secret-test-key-32-characters-minimum';

test('JWT signing and verification', () => {
  const payload = {
    userId: 'usr_12345',
    email: 'traveler@ghoommates.com',
    name: 'Traveler One',
  };

  const token = signJwt(payload, TEST_SECRET, 3600);
  assert.ok(typeof token === 'string');
  assert.equal(token.split('.').length, 3);

  const decoded = verifyJwt(token, TEST_SECRET);
  assert.equal(decoded.userId, 'usr_12345');
  assert.equal(decoded.email, 'traveler@ghoommates.com');
  assert.equal(decoded.name, 'Traveler One');
});

test('JWT rejects invalid signature', () => {
  const token = signJwt({ userId: 'u1', email: 'e1@test.com', name: 'User' }, TEST_SECRET);
  assert.throws(() => {
    verifyJwt(token, 'different-secret-key-at-least-32-chars-long');
  });
});

test('OAuth app health and dev mock login endpoints', async () => {
  // Use in-memory database for testing
  const db = createInMemoryOAuthDatabase();
  const server = await serve(mount('/auth', createApp(db, {
    jwtSecret: TEST_SECRET,
    googleClientId: 'mock-google-client-id.apps.googleusercontent.com',
    googleClientSecret: 'mock-google-client-secret',
  })));

  // Health check
  const healthRes = await server.request('/auth/health');
  assert.equal(healthRes.status, 200);
  const healthBody = await healthRes.json();
  assert.equal(healthBody.status, 'ok');

  // Config check
  const configRes = await server.request('/auth/config');
  assert.equal(configRes.status, 200);
  const configBody = await configRes.json();
  assert.equal(configBody.isConfigured, true);
  assert.equal(configBody.googleClientId, 'mock-google-client-id.apps.googleusercontent.com');

  // Dev mock login
  const loginRes = await server.request('/auth/dev/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test.user@ghoommates.com',
        name: 'Test Explorer',
        picture: 'https://example.com/avatar.png',
    }),
  });
  assert.equal(loginRes.status, 200);
  const loginBody = await loginRes.json();
  assert.ok(loginBody.token);
  assert.equal(loginBody.user.email, 'test.user@ghoommates.com');
  assert.equal(loginBody.user.name, 'Test Explorer');

  // Verify /auth/me with Bearer token
  const meRes = await server.request('/auth/me', {
    headers: { Authorization: `Bearer ${loginBody.token}` },
  });
  assert.equal(meRes.status, 200);
  const meBody = await meRes.json();
  assert.equal(meBody.user.id, loginBody.user.id);
  assert.equal(meBody.user.email, 'test.user@ghoommates.com');

  await server.close();
  await db.terminate();
});


 test('profiles persist across login, merge preferences, and reject invalid or duplicate usernames', async () => {
  const db = createInMemoryOAuthDatabase();
  const server = await serve(mount('/auth', createApp(db, { jwtSecret: TEST_SECRET })));
  const login = async (email: string) => (await server.request('/auth/dev/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name: 'Google Name' }),
  })).json();
  try {
    const first = await login('first@example.com');
    assert.ok(first.user.username);
    assert.deepEqual(first.user.preferences, {});
    const patch = (token: string, body: unknown) => server.request('/auth/profile', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    });
    assert.equal((await patch(first.token, { username: '@traveler', name: 'Custom Name', picture: 'https://example.com/me.jpg', preferences: { language: 'hi' } })).status, 200);
    assert.equal((await patch(first.token, { preferences: { colour: 'amber' } })).status, 200);
    const returning = await login('first@example.com');
    assert.equal(returning.user.id, first.user.id);
    assert.equal(returning.user.username, 'traveler');
    assert.equal(returning.user.name, 'Custom Name');
    assert.equal(returning.user.picture, 'https://example.com/me.jpg');
    // Pictures are uploaded to media storage first; inline image data is refused
    assert.equal((await patch(first.token, { picture: 'data:image/jpeg;base64,test' })).status, 400);
    assert.deepEqual(returning.user.preferences, { language: 'hi', colour: 'amber' });
    const second = await login('second@example.com');
    assert.equal((await patch(second.token, { username: 'traveler' })).status, 409);
    assert.equal((await patch(first.token, { preferences: [] })).status, 400);
    assert.equal((await patch(first.token, { username: 'a b' })).status, 400);
    assert.equal((await patch('invalid', { username: 'another' })).status, 401);
  } finally { await server.close(); await db.terminate(); }
});
