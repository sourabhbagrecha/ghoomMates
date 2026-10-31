import test from 'node:test';
import assert from 'node:assert/strict';
import { signJwt, verifyJwt } from '../src/jwt.ts';
import { createApp } from '../src/app.ts';
import { openOAuthDatabase } from '../src/database.ts';

const TEST_SECRET = 'a-very-secret-test-key-32-characters-minimum';

test('JWT signing and verification', () => {
  const payload = {
    userId: 'usr_12345',
    email: 'traveler@ghoomates.com',
    name: 'Traveler One',
  };

  const token = signJwt(payload, TEST_SECRET, 3600);
  assert.ok(typeof token === 'string');
  assert.equal(token.split('.').length, 3);

  const decoded = verifyJwt(token, TEST_SECRET);
  assert.equal(decoded.userId, 'usr_12345');
  assert.equal(decoded.email, 'traveler@ghoomates.com');
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
  const db = await openOAuthDatabase('');
  const app = createApp(db, {
    jwtSecret: TEST_SECRET,
    googleClientId: 'mock-google-client-id.apps.googleusercontent.com',
    googleClientSecret: 'mock-google-client-secret',
  });

  // Health check
  const healthRes = await app(new Request('http://localhost:3002/health'));
  assert.equal(healthRes.status, 200);
  const healthBody = await healthRes.json();
  assert.equal(healthBody.status, 'ok');

  // Config check
  const configRes = await app(new Request('http://localhost:3002/auth/config'));
  assert.equal(configRes.status, 200);
  const configBody = await configRes.json();
  assert.equal(configBody.isConfigured, true);
  assert.equal(configBody.googleClientId, 'mock-google-client-id.apps.googleusercontent.com');

  // Dev mock login
  const loginRes = await app(
    new Request('http://localhost:3002/auth/dev/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test.user@ghoomates.com',
        name: 'Test Explorer',
        picture: 'https://example.com/avatar.png',
      }),
    })
  );
  assert.equal(loginRes.status, 200);
  const loginBody = await loginRes.json();
  assert.ok(loginBody.token);
  assert.equal(loginBody.user.email, 'test.user@ghoomates.com');
  assert.equal(loginBody.user.name, 'Test Explorer');

  // Verify /auth/me with Bearer token
  const meRes = await app(
    new Request('http://localhost:3002/auth/me', {
      headers: { Authorization: `Bearer ${loginBody.token}` },
    })
  );
  assert.equal(meRes.status, 200);
  const meBody = await meRes.json();
  assert.equal(meBody.user.id, loginBody.user.id);
  assert.equal(meBody.user.email, 'test.user@ghoomates.com');

  await db.terminate();
});

