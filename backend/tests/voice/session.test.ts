import test from 'node:test';
import { expect } from '../expect.ts';
import { ApiError } from '../../src/http.ts';
import { createVoiceApp } from '../../src/voice/app.ts';
import type { VoiceAgent } from '../../src/voice/wake.ts';
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

async function withServer(env: Record<string, string | undefined>, run: (post: Post) => Promise<void>, agent?: VoiceAgent) {
  const server = await serve(mount('/api/voice', createVoiceApp({ db, authenticate, agentToken: (user) => `agent-jwt-${user.id}`, env, agent })));
  try {
    await run((body, token = TOKEN, path = '/api/voice/session') => server.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
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

// A fake agent service: `up` is what its health check says; counts the calls
function fakeAgent(up: boolean) {
  const calls = { ready: 0, ping: 0 };
  const agent: VoiceAgent = {
    ready: async () => { calls.ready += 1; return up; },
    ping: async () => { calls.ping += 1; return up; },
  };
  return { agent, calls };
}

test('wakes the agent service before minting the token', async () => {
  const { agent, calls } = fakeAgent(true);
  await withServer(LIVEKIT_ENV, async (post) => {
    const res = await post({ tripId: '11111111-1111-4111-8111-111111111111' });
    expect(res.status).toBe(200);
    expect(typeof (await res.json()).participantToken).toBe('string');
    expect(calls.ready).toBe(1);
  }, agent);
});

test('returns 503 VOICE_AGENT_WAKING when the agent service is not ready in time', async () => {
  const { agent } = fakeAgent(false);
  await withServer(LIVEKIT_ENV, async (post) => {
    const res = await post({ tripId: '11111111-1111-4111-8111-111111111111' });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('VOICE_AGENT_WAKING');
  }, agent);
});

test('does not wake the agent for a trip the user is not in', async () => {
  const { agent, calls } = fakeAgent(true);
  await withServer(LIVEKIT_ENV, async (post) => {
    expect((await post({ tripId: '22222222-2222-4222-8222-222222222222' })).status).toBe(404);
    expect(calls.ready).toBe(0);
  }, agent);
});

test('keepalive pings the agent service, and needs a signed-in user', async () => {
  const { agent, calls } = fakeAgent(true);
  await withServer(LIVEKIT_ENV, async (post) => {
    expect((await post({}, null, '/api/voice/keepalive')).status).toBe(401);
    const res = await post({}, TOKEN, '/api/voice/keepalive');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(calls.ping).toBe(1);
  }, agent);
});

test('keepalive answers ok without an agent service (local dev, inline worker)', async () => {
  await withServer(LIVEKIT_ENV, async (post) => {
    const res = await post({}, TOKEN, '/api/voice/keepalive');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
