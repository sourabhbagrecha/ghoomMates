import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { ApiError } from '../../src/http.ts';
import { createVoiceApp } from '../../src/voice/app.ts';
import { createHistoryRecorder, historyContext, historySection, type HistoryItem, type HistoryMessage } from '../../src/voice/history.ts';
import type { User } from '../../src/auth/types.ts';
import { mount, serve } from '../helpers.ts';
import { testDatabase } from '../mongo.ts';

const TRIP = '11111111-1111-4111-8111-111111111111';
const OTHER_TRIP = '22222222-2222-4222-8222-222222222222';
const asha = { id: 'usr_1', username: 'asha', email: 'asha@test.local', name: 'Asha', preferences: { ghoomate: { notes: [] } } } as unknown as User;
const ravi = { id: 'usr_2', username: 'ravi', email: 'ravi@test.local', name: 'Ravi' } as User;

// Both users are in TRIP; nobody is in OTHER_TRIP.
async function fakeDb() {
  const database = await testDatabase();
  await database.db.collection('trip_members').insertMany([asha, ravi].map(u => ({ trip_id: TRIP, user_id: u.id, ledger_member_id: `ledger-${u.id}`, role: 'mate' })));
  return database;
}

async function withServer(run: (call: (user: User, method: string, path: string, body?: unknown) => Promise<Response>) => Promise<void>) {
  const db = await fakeDb();
  const authenticate = async (token: string) => {
    if (token === 'asha') return asha;
    if (token === 'ravi') return ravi;
    throw new ApiError(401, 'UNAUTHORIZED', 'Bad token');
  };
  const server = await serve(mount('/api/voice', createVoiceApp({
    db,
    authenticate,
    agentToken: () => 'agent',
    tripDetail: async (tripId, userId) => {
      if (tripId !== TRIP) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
      return { id: tripId, name: 'Goa', memberId: `m_${userId}`, members: [] };
    },
    env: {},
  })));
  try {
    await run((user, method, path, body) => server.request(`/api/voice${path}`, {
      method,
      headers: { authorization: `Bearer ${user.username}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }));
  } finally {
    await server.close();
  }
}

describe('context route', () => {
  test('returns the trip, preferences and latest history in one call', async () => {
    await withServer(async (call) => {
      await call(asha, 'POST', '/history', { tripId: TRIP, messages: [{ role: 'user', text: 'hi' }] });
      const res = await call(asha, 'GET', `/context?tripId=${TRIP}`);
      expect(res.status).toBe(200);
      const body = await res.json() as { trip: { name: string; memberId: string }; preferences: unknown; history: { text: string }[] };
      expect(body.trip.name).toBe('Goa');
      expect(body.trip.memberId).toBe('m_usr_1');
      expect(body.preferences).toEqual({ ghoomate: { notes: [] } });
      expect(body.history.map(h => h.text)).toEqual(['hi']);
    });
  });

  test('404s for a trip you are not in, and for a bad id', async () => {
    await withServer(async (call) => {
      expect((await call(asha, 'GET', `/context?tripId=${OTHER_TRIP}`)).status).toBe(404);
      expect((await call(asha, 'GET', '/context?tripId=nope')).status).toBe(404);
    });
  });
});

describe('history routes', () => {
  test('saves turns and reads them back oldest first, private to each person', async () => {
    await withServer(async (call) => {
      const saved = await call(asha, 'POST', '/history', { tripId: TRIP, messages: [{ role: 'user', text: ' hi ' }, { role: 'agent', text: 'Hey Asha!' }] });
      expect(saved.status).toBe(201);
      await call(ravi, 'POST', '/history', { tripId: TRIP, messages: [{ role: 'user', text: 'mine' }] });

      const { items } = await (await call(asha, 'GET', `/history?tripId=${TRIP}`)).json();
      expect(items.map((i: HistoryItem) => [i.role, i.text])).toEqual([['user', 'hi'], ['agent', 'Hey Asha!']]);
      const latest = await (await call(asha, 'GET', `/history?tripId=${TRIP}&limit=1`)).json();
      expect(latest.items.map((i: HistoryItem) => i.text)).toEqual(['Hey Asha!']);
    });
  });

  test('clearing only removes your own messages', async () => {
    await withServer(async (call) => {
      await call(asha, 'POST', '/history', { tripId: TRIP, messages: [{ role: 'user', text: 'a' }] });
      await call(ravi, 'POST', '/history', { tripId: TRIP, messages: [{ role: 'user', text: 'r' }] });
      const cleared = await (await call(asha, 'DELETE', `/history?tripId=${TRIP}`)).json();
      expect(cleared.deleted).toBe(1);
      expect((await (await call(ravi, 'GET', `/history?tripId=${TRIP}`)).json()).items).toHaveLength(1);
    });
  });

  test('non-members get 404 and bad messages 400', async () => {
    await withServer(async (call) => {
      expect((await call(asha, 'GET', `/history?tripId=${OTHER_TRIP}`)).status).toBe(404);
      expect((await call(asha, 'POST', '/history', { tripId: TRIP, messages: [] })).status).toBe(400);
      expect((await call(asha, 'POST', '/history', { tripId: TRIP, messages: [{ role: 'system', text: 'x' }] })).status).toBe(400);
      expect((await call(asha, 'POST', '/history', { tripId: TRIP, messages: [{ role: 'user', text: '  ' }] })).status).toBe(400);
    });
  });
});

describe('history for the model', () => {
  const item = (id: number, role: 'user' | 'agent', text: string): HistoryItem => ({ id: String(id), role, text, createdAt: '2026-11-01T10:00:00Z' });

  test('names the speaker, keeps the latest within the budget, shortens long lines', () => {
    const items = [item(1, 'user', 'old one'), item(2, 'agent', 'reply'), item(3, 'user', 'x'.repeat(400))];
    const lines = historyContext(items, 'Asha', 290);
    expect(lines).toHaveLength(1);
    expect(lines[0].startsWith('Asha: xxx')).toBe(true);
    expect(lines[0].endsWith('…')).toBe(true);
    expect(historyContext(items.slice(0, 2), 'Asha')).toEqual(['Asha: old one', 'You: reply']);
  });

  test('no history, no section', () => {
    expect(historySection([], 'Asha')).toBe('');
    expect(historySection([item(1, 'user', 'hi')], 'Asha').includes('Earlier chats with Asha')).toBe(true);
  });
});

describe('history recorder', () => {
  test('batches messages, skips empty ones and survives a failed save', async () => {
    const batches: HistoryMessage[][] = [];
    let fail = true;
    const recorder = createHistoryRecorder(async (messages) => {
      if (fail) {
        fail = false;
        throw new Error('offline');
      }
      batches.push(messages);
    }, 10_000);
    recorder.add('user', 'first');
    await recorder.flush(); // fails, dropped
    recorder.add('user', '  ');
    recorder.add('user', undefined);
    recorder.add('user', 'hello');
    recorder.add('agent', ' hi there ');
    await recorder.flush();
    expect(batches).toEqual([[{ role: 'user', text: 'hello' }, { role: 'agent', text: 'hi there' }]]);
  });
});
