import test from 'node:test';
import assert from 'node:assert/strict';
import { Router, type Request } from 'express';
import { createServer } from '../src/app.ts';
import { signJwt } from '../src/auth/jwt.ts';
import { createGemini, GeminiError, limitGemini } from '../src/gemini.ts';
import {
  clientIp, ConcurrencyLimiter, defaultPolicies, edgeGuard, memoryCounters, mongoCounters, RateLimiter, rateLimits, type Policy,
} from '../src/limits.ts';
import { serve } from './helpers.ts';
import { testDatabase } from './mongo.ts';

const SECRET = 'limits-test-jwt-secret-that-is-32-chars-long';
const EDGE = 'edge-secret-for-tests-0123456789abcdef';
const token = (userId: string) => `Bearer ${signJwt({ userId, email: `${userId}@test.com`, name: userId }, SECRET)}`;
const ok = Router().use((req, res) => { res.json({ ip: clientIp(req) }); });

function clock(start = Date.parse('2026-11-15T06:00:00Z')) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

test('RateLimiter allows the limit, then says how long to wait; refused calls do not count', () => {
  const c = clock();
  const limiter = new RateLimiter(3, 60_000, c.now);
  assert.deepEqual([limiter.take('a'), limiter.take('a'), limiter.take('a')], [0, 0, 0]);
  const wait = limiter.take('a');
  assert.ok(wait >= 1 && wait <= 60, `wait ${wait}`);
  assert.equal(limiter.take('b'), 0, 'other keys have their own budget');
  // Two windows on, the old calls have faded out completely
  c.advance(120_000);
  assert.equal(limiter.take('a'), 0);
});

test('RateLimiter slides: calls from the previous window still count for part of the next one', () => {
  const c = clock(Date.parse('2026-11-15T06:00:00Z'));
  const limiter = new RateLimiter(10, 60_000, c.now);
  for (let i = 0; i < 10; i++) assert.equal(limiter.take('a'), 0);
  // 6 s into the next window, 90% of the previous 10 calls still weigh in: 9 + 0 < 10, so one more call fits
  c.advance(66_000);
  assert.equal(limiter.take('a'), 0);
  assert.ok(limiter.take('a') > 0, 'but not a whole new window of them');
});

test('RateLimiter forgets the least recently seen key past maxKeys', () => {
  const c = clock();
  const limiter = new RateLimiter(1, 60_000, c.now, 2);
  limiter.take('a');
  limiter.take('b');
  limiter.take('c'); // evicts a
  assert.equal(limiter.take('a'), 0, 'a was forgotten, so it starts over');
  assert.ok(limiter.take('c') > 0, 'c is still remembered');
});

test('ConcurrencyLimiter holds a place until it is released, once', () => {
  const open = new ConcurrencyLimiter(2);
  const first = open.enter('u')!;
  const second = open.enter('u')!;
  assert.equal(open.enter('u'), null);
  first();
  first();
  assert.ok(open.enter('u'), 'one place came back');
  assert.equal(open.enter('u'), null, 'releasing twice did not give back two');
  second();
});

test('memoryCounters: a daily budget that starts over at midnight India time', async () => {
  // 18:00 UTC is 23:30 in India
  const c = clock(Date.parse('2026-11-15T18:00:00Z'));
  const counters = memoryCounters(c.now);
  assert.equal(await counters.take('x', 2), true);
  assert.equal(await counters.take('x', 2), true);
  assert.equal(await counters.take('x', 2), false);
  c.advance(60 * 60_000); // 00:30 in India
  assert.equal(await counters.take('x', 2), true);
});

test('mongoCounters never lets concurrent callers past the limit, and expires with a TTL index', async () => {
  const database = await testDatabase();
  try {
    const counters = mongoCounters(database.db);
    const results = await Promise.all(Array.from({ length: 12 }, () => counters.take('gemini:all', 5)));
    assert.equal(results.filter(Boolean).length, 5);
    assert.equal(await counters.take('other', 5), true, 'each key has its own count');
    const doc = await database.db.collection('usage_counters').findOne({ _id: { $regex: /^gemini:all:/ } as any });
    assert.equal(doc?.count, 5);
    assert.ok(doc?.expires_at instanceof Date);
    const indexes = await database.db.collection('usage_counters').indexes();
    assert.ok(indexes.some(index => index.key.expires_at === 1 && index.expireAfterSeconds === 0));
  } finally {
    await database.close();
  }
});

// A request as the edge guard sees it, from an address that is not this machine
const fakeRequest = (path: string, headers: Record<string, string> = {}, remoteAddress = '10.1.2.3') =>
  ({ path, headers, socket: { remoteAddress } }) as unknown as Request;

function guarded(secret: string | undefined, req: Request) {
  let passed = false;
  try {
    edgeGuard(secret)(req, {} as any, () => { passed = true; });
  } catch (err: any) {
    return err.status as number;
  }
  return passed ? 200 : 0;
}

test('edgeGuard: with EDGE_SECRET, only the Worker (and loopback, and /health) get through', () => {
  assert.equal(guarded(undefined, fakeRequest('/api/trips')), 200, 'off without a secret');
  assert.equal(guarded(EDGE, fakeRequest('/api/trips')), 403, 'straight to run.app');
  assert.equal(guarded(EDGE, fakeRequest('/api/trips', { 'x-edge-secret': 'wrong' })), 403);
  assert.equal(guarded(EDGE, fakeRequest('/api/trips', { 'x-edge-secret': EDGE })), 200);
  assert.equal(guarded(EDGE, fakeRequest('/', {})), 403, 'the web app too');
  assert.equal(guarded(EDGE, fakeRequest('/health')), 200);
  assert.equal(guarded(EDGE, fakeRequest('/api/voice/context', {}, '127.0.0.1')), 200, 'the voice worker in this server');
});

test('clientIp: the Worker’s X-Client-IP only with the edge secret, else the address Cloud Run appended', () => {
  const viaWorker = fakeRequest('/api/x', { 'x-edge-secret': EDGE, 'x-client-ip': '203.0.113.7', 'x-forwarded-for': '1.1.1.1, 172.70.1.1' });
  guarded(EDGE, viaWorker);
  assert.equal(clientIp(viaWorker), '203.0.113.7');

  const spoofed = fakeRequest('/api/x', { 'x-client-ip': '203.0.113.7', 'x-forwarded-for': '9.9.9.9, 198.51.100.4' });
  guarded(undefined, spoofed);
  assert.equal(clientIp(spoofed), '198.51.100.4', 'the last entry, not the one the client wrote');

  const garbage = fakeRequest('/api/x', { 'x-edge-secret': EDGE, 'x-client-ip': 'not an ip' });
  guarded(EDGE, garbage);
  assert.equal(clientIp(garbage), '10.1.2.3', 'falls back to the socket');
});

test('the server refuses direct requests once EDGE_SECRET is set (end to end through createServer)', async () => {
  // The test client is on loopback, which the guard lets through, so prove the guard is mounted with a header check:
  // the Worker's X-Client-IP is believed only with the secret
  const server = await serve(createServer({ guards: [edgeGuard(EDGE)], auth: ok, expenses: ok }));
  try {
    const withSecret = await server.request('/api/anything', { headers: { 'x-edge-secret': EDGE, 'x-client-ip': '203.0.113.9' } });
    assert.equal((await withSecret.json()).ip, '203.0.113.9');
    const without = await server.request('/api/anything', { headers: { 'x-client-ip': '203.0.113.9' } });
    assert.notEqual((await without.json()).ip, '203.0.113.9');
  } finally {
    await server.close();
  }
});

const policy = (overrides: Partial<Policy>): Policy => ({ name: 'p', methods: '*', path: /^\/api\//, per: 'client', message: 'slow down', ...overrides });

async function withLimits(policies: Policy[], run: (request: (path: string, init?: RequestInit) => Promise<Response>) => Promise<void>, routes = ok) {
  const server = await serve(createServer({ guards: [rateLimits({ jwtSecret: SECRET, counters: memoryCounters(), policies })], auth: routes, expenses: routes }));
  try {
    await run(server.request);
  } finally {
    await server.close();
  }
}

test('rateLimits: 429 with Retry-After and the error envelope; limits follow the signed-in user', async () => {
  await withLimits([policy({ perMinute: 2 })], async (request) => {
    const as = (who: string) => request('/api/x', { headers: { authorization: token(who) } });
    assert.equal((await as('usr_a')).status, 200);
    assert.equal((await as('usr_a')).status, 200);
    const refused = await as('usr_a');
    assert.equal(refused.status, 429);
    assert.ok(Number(refused.headers.get('retry-after')) >= 1);
    assert.deepEqual((await refused.json()).error, { code: 'RATE_LIMITED', message: 'slow down' });
    assert.equal((await as('usr_b')).status, 200, 'another user on the same address is not affected');
    assert.equal((await request('/api/x')).status, 200, 'nor is a signed-out visitor');
    // A forged token is not a user: it counts against the address instead
    assert.equal((await request('/api/x', { headers: { authorization: 'Bearer forged.token.here' } })).status, 200);
    assert.equal((await request('/api/x')).status, 429, 'the address has used its 2 now');
    assert.equal((await request('/health')).status, 200, 'paths outside the policy are not counted');
  });
});

test('rateLimits: per-IP policies count everyone behind an address together', async () => {
  await withLimits([policy({ per: 'ip', perMinute: 2 })], async (request) => {
    assert.equal((await request('/api/x', { headers: { authorization: token('usr_a') } })).status, 200);
    assert.equal((await request('/api/x', { headers: { authorization: token('usr_b') } })).status, 200);
    assert.equal((await request('/api/x', { headers: { authorization: token('usr_c') } })).status, 429);
  });
});

test('rateLimits: daily budgets per caller and for everyone together, and methods are matched', async () => {
  await withLimits([policy({ methods: ['POST'], perDay: 2, perDayAll: 3 })], async (request) => {
    const post = (who: string) => request('/api/x', { method: 'POST', headers: { authorization: token(who) } });
    assert.equal((await post('usr_a')).status, 200);
    assert.equal((await post('usr_a')).status, 200);
    assert.equal((await post('usr_a')).status, 429, 'usr_a used their day');
    assert.equal((await post('usr_b')).status, 200, 'the third call of the day overall');
    assert.equal((await post('usr_c')).status, 429, 'everyone’s budget is spent');
    assert.equal((await request('/api/x', { headers: { authorization: token('usr_a') } })).status, 200, 'GET is not covered');
  });
});

test('rateLimits: a held request keeps its place until it ends', async () => {
  let finish: (() => void) | undefined;
  const held = Router().post('/hold', (_req, res) => {
    res.write('started\n');
    finish = () => res.end();
  }).use((_req, res) => { res.json({}); });
  await withLimits([policy({ concurrent: 1 })], async (request) => {
    const auth = { authorization: token('usr_a') };
    const first = await request('/api/hold', { method: 'POST', headers: auth });
    assert.equal(first.status, 200);
    assert.equal((await request('/api/hold', { method: 'POST', headers: auth })).status, 429);
    finish!();
    await first.text();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal((await request('/api/other', { headers: auth })).status, 200, 'room again once the first one ended');
  }, held);
});

test('defaultPolicies cover the routes that cost money', () => {
  const policies = defaultPolicies({});
  const names = (method: string, path: string) =>
    policies.filter(p => (p.methods === '*' || p.methods.includes(method)) && p.path.test(path)).map(p => p.name).sort();
  const trip = '2b4f1e0a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
  assert.deepEqual(names('POST', `/api/reels/trips/${trip}`), ['client', 'ip', 'reel']);
  assert.deepEqual(names('GET', `/api/reels/trips/${trip}`), ['client', 'ip']);
  for (const path of [`/api/trips/${trip}/itinerary/draft`, `/api/trips/${trip}/photos/search`, '/api/hospitality/menu', '/api/ops/advisories/draft', '/api/events/diwali/ask', '/api/makers/m1/ask']) {
    assert.deepEqual(names('POST', path), ['ai', 'client', 'ip'], path);
  }
  assert.deepEqual(names('POST', `/api/trips/${trip}/photos/find`), ['client', 'ip', 'photo-search']);
  assert.deepEqual(names('POST', `/api/trips/${trip}/uploads`), ['client', 'ip', 'upload']);
  assert.deepEqual(names('POST', '/auth/uploads'), ['client', 'ip', 'upload']);
  assert.deepEqual(names('POST', '/api/voice/session'), ['client', 'ip', 'voice']);
  for (const [method, path] of [['POST', '/auth/google/verify'], ['GET', '/auth/callback'], ['POST', '/auth/callback'], ['POST', '/auth/dev/login']]) {
    assert.deepEqual(names(method, path), ['client', 'ip', 'signin'], path);
  }
  assert.deepEqual(names('GET', '/'), [], 'the web app is not counted');
  assert.deepEqual(names('GET', '/assets/app.js'), []);
  const voice = policies.find(p => p.name === 'voice')!;
  assert.equal(voice.concurrent, 2);
  assert.equal(voice.perDayAll, 300);
  assert.equal(defaultPolicies({ VOICE_SESSIONS_PER_DAY: '50' }).find(p => p.name === 'voice')!.perDayAll, 50, 'set from the environment');
});

test('a spent Gemini budget stops the call before it is made, as a GeminiError the features fall back on', async () => {
  let calls = 0;
  const gemini = createGemini({ GEMINI_API_KEY: 'test' } as NodeJS.ProcessEnv, (async () => { calls++; throw new Error('no network in tests'); }) as typeof fetch);
  limitGemini(async () => false);
  try {
    await assert.rejects(gemini.json({ prompt: 'hi', schema: { type: 'OBJECT' } }), (err: unknown) => err instanceof GeminiError && err.status === 429);
    assert.equal(calls, 0);
  } finally {
    limitGemini(async () => true);
  }
});
