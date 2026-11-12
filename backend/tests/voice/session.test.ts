import test from 'node:test';
import { expect } from '../expect.ts';
import { ApiError } from '../../src/http.ts';
import { createVoiceApp } from '../../src/voice/app.ts';
import type { User } from '../../src/auth/types.ts';
import { mount, serve } from '../helpers.ts';
import { testDatabase } from '../mongo.ts';

const LIVEKIT_ENV = { LIVEKIT_URL: 'wss://test.livekit.cloud', LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: 'test-secret-'.repeat(4) };
const TOKEN = 'user-jwt-abc';
const user = { id: 'usr_1', username: 'asha', email: 'asha@test.local', name: 'Asha' } as User;

// usr_1 is a member of 11111111-1111-4111-8111-111111111111 only.
const db = await testDatabase();
await db.db.collection('trip_members').insertOne({ trip_id: '11111111-1111-4111-8111-111111111111', user_id: 'usr_1', ledger_member_id: 'ledger-usr_1', role: 'mate' });

const authenticate = async (token: string) => {
  if (token !== TOKEN) throw new ApiError(401, 'UNAUTHORIZED', 'Bad token');
  return user;
};

type Post = (body: unknown, token?: string | null, path?: string) => Promise<Response>;

type Worker = { agentName: string; ready(): Promise<boolean> };
type Hold = { holdMs?: number; heartbeatMs?: number; watchMs?: number; joinMs?: number; inRoom?: (room: string, identity: string) => Promise<boolean> };

async function withServer(env: Record<string, string | undefined>, run: (post: Post) => Promise<void>, worker?: Worker, hold: Hold = {}, headers: Record<string, string> = {}) {
  const server = await serve(mount('/api/voice', createVoiceApp({ db, authenticate, agentToken: (user) => `agent-jwt-${user.id}`, env, worker, ...hold })));
  try {
    await run((body, token = TOKEN, path = '/api/voice/session') => server.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }));
  } finally {
    await server.close();
  }
}

const jwtPayload = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));

test('rejects requests without a bearer token', async () => {
  await withServer(LIVEKIT_ENV, async (post) => {
    const res = await post({ tripId: '11111111-1111-4111-8111-111111111111' }, null);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHORIZED');
  });
});

test('returns 404 for a trip the user is not a member of', async () => {
  await withServer(LIVEKIT_ENV, async (post) => {
    const res = await post({ tripId: '22222222-2222-4222-8222-222222222222' });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
  });
});

test('returns 503 VOICE_DISABLED when LiveKit is not configured', async () => {
  await withServer({ LIVEKIT_URL: 'wss://test.livekit.cloud' }, async (post) => {
    const res = await post({ tripId: '11111111-1111-4111-8111-111111111111' });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('VOICE_DISABLED');
  });
});

test('mints a token whose room dispatches the ghoomate agent with the trip metadata', async () => {
  await withServer(LIVEKIT_ENV, async (post) => {
    const res = await post({ tripId: '11111111-1111-4111-8111-111111111111' });
    expect(res.status).toBe(200);
    const session = await res.json();
    expect(session.serverUrl).toBe('wss://test.livekit.cloud');
    expect(session.participantIdentity).toBe('user-usr_1');
    expect(/^ghoomate-11111111-1111-4111-8111-111111111111-usr_1-[0-9a-f]{8}$/.test(session.roomName)).toBe(true);

    const claims = jwtPayload(session.participantToken);
    expect(claims.sub).toBe('user-usr_1');
    expect(claims.iss).toBe('test-key');
    expect(claims.name).toBe('Asha');
    expect(claims.exp - claims.nbf).toBe(15 * 60);
    expect(claims.video).toEqual({ roomJoin: true, room: session.roomName, canPublish: true, canSubscribe: true, canPublishData: true });

    const agents = claims.roomConfig.agents;
    expect(agents).toHaveLength(1);
    expect(agents[0].agentName).toBe('ghoomate');
    expect(JSON.parse(agents[0].metadata)).toEqual({ tripId: '11111111-1111-4111-8111-111111111111', userId: 'usr_1', userName: 'Asha', authToken: 'agent-jwt-usr_1' });
  });
});

test('dispatches to the GHOOMATE_AGENT_NAME worker when one is set', async () => {
  await withServer({ ...LIVEKIT_ENV, GHOOMATE_AGENT_NAME: ' ghoomate-asha ' }, async (post) => {
    const res = await post({ tripId: '11111111-1111-4111-8111-111111111111' });
    expect(res.status).toBe(200);
    const { participantToken } = await res.json();
    expect(jwtPayload(participantToken).roomConfig.agents[0].agentName).toBe('ghoomate-asha');
  });
});

// A fake inline worker: `up` is what its health check says; counts the checks
function fakeWorker(up: boolean, agentName = 'ghoomate-prod-1a2b3c4d') {
  const calls = { ready: 0 };
  const worker: Worker = { agentName, ready: async () => { calls.ready += 1; return up; } };
  return { worker, calls };
}

test("waits for this server's worker and dispatches to its own agent name", async () => {
  const { worker, calls } = fakeWorker(true);
  await withServer({ ...LIVEKIT_ENV, GHOOMATE_AGENT_NAME: 'ghoomate-prod' }, async (post) => {
    const res = await post({ tripId: '11111111-1111-4111-8111-111111111111' });
    expect(res.status).toBe(200);
    const { participantToken } = await res.json();
    expect(jwtPayload(participantToken).roomConfig.agents[0].agentName).toBe('ghoomate-prod-1a2b3c4d');
    expect(calls.ready).toBe(1);
  }, worker);
});

test('returns 503 VOICE_AGENT_WAKING when the worker is not registered in time', async () => {
  const { worker } = fakeWorker(false);
  await withServer(LIVEKIT_ENV, async (post) => {
    const res = await post({ tripId: '11111111-1111-4111-8111-111111111111' });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('VOICE_AGENT_WAKING');
  }, worker);
});

test('does not wait for the worker for a trip the user is not in', async () => {
  const { worker, calls } = fakeWorker(true);
  await withServer(LIVEKIT_ENV, async (post) => {
    expect((await post({ tripId: '22222222-2222-4222-8222-222222222222' })).status).toBe(404);
    expect(calls.ready).toBe(0);
  }, worker);
});

const NDJSON = { accept: 'application/x-ndjson' };

test('a held session sends the token as the first line, then heartbeats, until its time is up', async () => {
  await withServer(LIVEKIT_ENV, async (post) => {
    const started = Date.now();
    const res = await post({ tripId: '11111111-1111-4111-8111-111111111111' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/x-ndjson; charset=utf-8');
    const body = await res.text();
    expect(Date.now() - started >= 140).toBe(true);
    const [first, ...rest] = body.split('\n');
    expect(JSON.parse(first).participantIdentity).toBe('user-usr_1');
    expect(rest.length >= 3 && rest.every(line => line === '')).toBe(true);
  }, undefined, { holdMs: 150, heartbeatMs: 30, inRoom: async () => true }, NDJSON);
});

test('a held session ends once the user has left the room', async () => {
  const seen: string[] = [];
  let checks = 0;
  // In the room for the first two checks, then gone
  const inRoom = async (room: string, identity: string) => { seen.push(`${room} ${identity}`); checks += 1; return checks <= 2; };
  await withServer(LIVEKIT_ENV, async (post) => {
    const res = await post({ tripId: '11111111-1111-4111-8111-111111111111' });
    const [first] = (await res.text()).split('\n');
    const session = JSON.parse(first);
    expect(checks).toBe(3);
    expect(seen[0]).toBe(`${session.roomName} user-usr_1`);
  }, undefined, { holdMs: 60_000, heartbeatMs: 1000, watchMs: 10, joinMs: 60_000, inRoom }, NDJSON);
});

test('a held session ends if the user never joins the room', async () => {
  await withServer(LIVEKIT_ENV, async (post) => {
    const started = Date.now();
    const res = await post({ tripId: '11111111-1111-4111-8111-111111111111' });
    await res.text();
    const ms = Date.now() - started;
    expect(ms >= 80 && ms < 1000).toBe(true);
  }, undefined, { holdMs: 60_000, heartbeatMs: 1000, watchMs: 10, joinMs: 80, inRoom: async () => false }, NDJSON);
});

test('a held session keeps going while LiveKit cannot be reached, until its time is up', async () => {
  await withServer(LIVEKIT_ENV, async (post) => {
    const started = Date.now();
    const res = await post({ tripId: '11111111-1111-4111-8111-111111111111' });
    await res.text();
    expect(Date.now() - started >= 140).toBe(true);
  }, undefined, { holdMs: 150, heartbeatMs: 1000, watchMs: 10, joinMs: 20, inRoom: async () => { throw new Error('unreachable'); } }, NDJSON);
});

test('a held session ends when the app closes it', async () => {
  await withServer(LIVEKIT_ENV, async (post) => {
    const res = await post({ tripId: '11111111-1111-4111-8111-111111111111' });
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    expect(JSON.parse(new TextDecoder().decode(value).split('\n')[0]).serverUrl).toBe('wss://test.livekit.cloud');
    await reader.cancel();
  }, undefined, { holdMs: 60_000, heartbeatMs: 10, inRoom: async () => true }, NDJSON);
});

test('errors before the token are plain JSON, held or not', async () => {
  await withServer(LIVEKIT_ENV, async (post) => {
    const res = await post({ tripId: '22222222-2222-4222-8222-222222222222' });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
  }, undefined, {}, NDJSON);
});
