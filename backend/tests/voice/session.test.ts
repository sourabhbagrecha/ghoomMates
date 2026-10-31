import test from 'node:test';
import { expect } from '../expect.ts';
import { ApiError } from '../../src/http.ts';
import { createVoiceApp, type VoiceDb } from '../../src/voice/app.ts';
import type { User } from '../../src/auth/types.ts';
import { mount, serve } from '../helpers.ts';

const LIVEKIT_ENV = { LIVEKIT_URL: 'wss://test.livekit.cloud', LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: 'test-secret-'.repeat(4) };
const TOKEN = 'user-jwt-abc';
const user = { id: 'usr_1', username: 'asha', email: 'asha@test.local', name: 'Asha' } as User;

// Fake pool: usr_1 is a member of 11111111-1111-4111-8111-111111111111 only.
const db: VoiceDb = {
  pool: {
    query: async (_sql, values) => {
      const member = values?.[0] === '11111111-1111-4111-8111-111111111111' && values?.[1] === 'usr_1';
      return { rowCount: member ? 1 : 0, rows: member ? [{ '?column?': 1 }] : [] };
    },
  },
};

const authenticate = async (token: string) => {
  if (token !== TOKEN) throw new ApiError(401, 'UNAUTHORIZED', 'Bad token');
  return user;
};

async function withServer(env: Record<string, string | undefined>, run: (post: (body: unknown, token?: string | null) => Promise<Response>) => Promise<void>) {
  const server = await serve(mount('/api/voice', createVoiceApp({ db, authenticate, agentToken: (user) => `agent-jwt-${user.id}`, env })));
  try {
    await run((body, token = TOKEN) => server.request('/api/voice/session', {
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
