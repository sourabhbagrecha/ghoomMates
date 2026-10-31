import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from 'express';
import { expect } from '../expect.ts';
import { createServer } from '../../src/app.ts';
import { ApiError } from '../../src/http.ts';
import { createImpactApp } from '../../src/impact/app.ts';
import type { ImpactDb } from '../../src/impact/cache.ts';
import type { User } from '../../src/auth/types.ts';
import type { Gemini } from '../../src/gemini.ts';
import { mount, serve } from '../helpers.ts';
import { PLAN, TRIP, TRIP_ID, fakeGemini, stopId } from './fixtures.ts';

const asha = { id: 'usr_1', username: 'asha', email: 'asha@test.local', name: 'Asha' } as User;
const ben = { id: 'usr_2', username: 'ben', email: 'ben@test.local', name: 'Ben' } as User;
const zed = { id: 'usr_9', username: 'zed', email: 'zed@test.local', name: 'Zed' } as User;
const MEMBERS = [{ member_id: 'm1', user_id: asha.id, name: 'Asha' }, { member_id: 'm2', user_id: ben.id, name: 'Ben' }];
const EXPENSES = [
  { id: 'e1', description: 'Dal baati churma lunch', amount_paise: 480_000, category: 'food' },
  { id: 'e2', description: 'City Palace tickets', amount_paise: 360_000, category: 'fun' },
  { id: 'e3', description: 'Mystery gifts', amount_paise: 200_000, category: 'other' },
];

/** In-memory stand-in for the few queries the impact routes run. Asha and Ben are in TRIP_ID; Zed is in no trip. */
function fakeDb() {
  const picks: { from: string; to: string; mode: string; by: string }[] = [];
  const ticks: { user: string; pledge: string }[] = [];
  const cache = new Map<string, unknown>();
  const writes: string[] = [];
  const db: ImpactDb = {
    pool: {
      query: async (sql, values = []) => {
        const text = sql.replace(/\s+/g, ' ').trim();
        const rows = (list: unknown[]) => ({ rowCount: list.length, rows: list });
        if (text.includes('FROM trips t JOIN trip_members m')) {
          const member = values[0] === TRIP_ID ? MEMBERS.find(m => m.user_id === values[1]) : undefined;
          return rows(member ? [{
            id: TRIP_ID, name: TRIP.name, group_name: TRIP.groupName, destination: TRIP.destination, start_date: TRIP.startDate,
            expense_group_id: 'g1', day_titles: TRIP.dayTitles, ledger_member_id: member.member_id,
          }] : []);
        }
        if (text.includes('FROM trip_members m JOIN users u')) return rows(MEMBERS);
        if (text.includes('FROM trip_stops')) {
          return rows(PLAN.map(s => ({ id: s.id, day_number: s.dayNumber, time: s.time, minutes: s.minutes, title: s.title, tag: s.tag, place: s.place })));
        }
        if (text.startsWith('SELECT from_stop_id, to_stop_id, mode FROM impact_legs')) {
          return rows(picks.map(p => ({ from_stop_id: p.from, to_stop_id: p.to, mode: p.mode })));
        }
        if (text.startsWith('INSERT INTO impact_legs')) {
          const [, from, to, mode, by] = values as string[];
          const i = picks.findIndex(p => p.from === from && p.to === to);
          if (i >= 0) picks.splice(i, 1);
          picks.push({ from, to, mode, by });
          writes.push(`leg ${mode}`);
          return rows([]);
        }
        if (text.startsWith('DELETE FROM impact_legs')) {
          const i = picks.findIndex(p => p.from === values[1] && p.to === values[2]);
          if (i >= 0) picks.splice(i, 1);
          writes.push('leg reset');
          return rows([]);
        }
        if (text.includes('FROM impact_pledges p JOIN trip_members m')) {
          return rows(ticks.map(t => ({ pledge_id: t.pledge, member_id: MEMBERS.find(m => m.user_id === t.user)!.member_id })));
        }
        if (text.startsWith('INSERT INTO impact_pledges')) {
          const [, user, pledge] = values as string[];
          if (!ticks.some(t => t.user === user && t.pledge === pledge)) ticks.push({ user, pledge });
          return rows([]);
        }
        if (text.startsWith('DELETE FROM impact_pledges')) {
          const i = ticks.findIndex(t => t.user === values[1] && t.pledge === values[2]);
          if (i >= 0) ticks.splice(i, 1);
          return rows([]);
        }
        if (text.includes('FROM expenses')) return rows(EXPENSES);
        if (text.startsWith('SELECT key, value FROM impact_cache')) {
          return rows((values[0] as string[]).filter(k => cache.has(k)).map(key => ({ key, value: cache.get(key) })));
        }
        if (text.startsWith('INSERT INTO impact_cache')) {
          const [keys, json] = values as [string[], string[]];
          keys.forEach((k, i) => { if (!cache.has(k)) cache.set(k, JSON.parse(json[i])); });
          return rows([]);
        }
        throw new Error(`Unexpected query: ${text}`);
      },
    },
  };
  return { db, picks, ticks, cache, writes };
}

async function withServer(
  options: { gemini?: Gemini } = {},
  run: (call: (user: User | null, method: string, path: string, body?: unknown) => Promise<{ status: number; data: any }>, state: ReturnType<typeof fakeDb>) => Promise<void>,
) {
  const state = fakeDb();
  const authenticate = async (token: string) => {
    const user = [asha, ben, zed].find(u => u.username === token);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Bad token');
    return user;
  };
  const server = await serve(mount('/api/impact', createImpactApp({ db: state.db, authenticate, gemini: options.gemini, env: {} })));
  try {
    await run(async (user, method, path, body) => {
      const res = await server.request(`/api/impact${path}`, {
        method,
        headers: { ...(user ? { authorization: `Bearer ${user.username}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, data: await res.json() };
    }, state);
  } finally {
    await server.close();
  }
}

const trip = `/trips/${TRIP_ID}`;
const FAR_RIDE = { fromStopId: stopId(5), toStopId: stopId(6) };

describe('access', () => {
  test('signed-in members only; everyone else gets the same 404 as a trip that doesn’t exist', async () => {
    await withServer({}, async (call) => {
      expect((await call(null, 'GET', trip)).status).toBe(401);
      expect((await call(zed, 'GET', trip)).status).toBe(404);
      expect((await call(asha, 'GET', '/trips/22222222-2222-4222-8222-222222222222')).status).toBe(404);
      expect((await call(asha, 'GET', '/trips/not-a-trip')).status).toBe(404);
      expect((await call(zed, 'GET', `${trip}/pledges`)).status).toBe(404);
      expect((await call(zed, 'PUT', `${trip}/legs`, { ...FAR_RIDE, mode: 'auto' })).status).toBe(404);
      expect((await call(zed, 'PUT', `${trip}/pledges`, { pledgeId: 'refill', taken: true })).status).toBe(404);
    });
  });
});

describe('GET /trips/:tripId', () => {
  test('returns the whole report, with no Gemini and no Maps key', async () => {
    await withServer({}, async (call) => {
      const { status, data } = await call(asha, 'GET', trip);
      expect(status).toBe(200);
      expect(data.tripId).toBe(TRIP_ID);
      expect(data.squad).toEqual({ size: 2, memberIds: ['m1', 'm2'] });
      expect(data.footprint.days.map((d: any) => d.number)).toEqual([1, 2]);
      assert.ok(data.footprint.totalKg > 0 && data.footprint.savedPct > 0);
      expect(data.footprint.source).toBe('estimate');
      expect(data.crowdSmart.heritageStops).toBe(5);
      // Lunch is local income; tickets aren't, and the mystery gifts stay unplaced without Gemini
      expect(data.local.trackedPaise).toBe(1_040_000);
      expect(data.local.keptPaise).toBe(480_000);
      expect(data.local.classifier).toBe('rules');
      expect(data.pledges.items).toHaveLength(8);
      expect(data.score.parts).toHaveLength(4);
      assert.ok(data.swaps.length >= 1 && data.swaps.length <= 3);
      expect(data.method.sources).toHaveLength(3);
      // The caller's own membership drives "mine"
      expect(data.pledges.mine).toBe(0);
    });
  });
});

describe('PUT /trips/:tripId/legs', () => {
  test('validates the ride and the mode', async () => {
    await withServer({}, async (call, state) => {
      expect((await call(asha, 'PUT', `${trip}/legs`, { fromStopId: 'nope', toStopId: stopId(6), mode: 'auto' })).status).toBe(400);
      expect((await call(asha, 'PUT', `${trip}/legs`, { ...FAR_RIDE, mode: 'helicopter' })).status).toBe(400);
      expect((await call(asha, 'PUT', `${trip}/legs`, { ...FAR_RIDE })).status).toBe(400);
      // Two stops that aren't consecutive
      const stranger = await call(asha, 'PUT', `${trip}/legs`, { fromStopId: stopId(1), toStopId: stopId(4), mode: 'auto' });
      expect([stranger.status, stranger.data.error.code]).toEqual([404, 'NOT_FOUND']);
      // Too far to walk, and no boat on dry land
      const walk = await call(asha, 'PUT', `${trip}/legs`, { ...FAR_RIDE, mode: 'walk' });
      expect([walk.status, walk.data.error.code]).toEqual([400, 'VALIDATION_ERROR']);
      assert.match(walk.data.error.message, /not practical/);
      const boat = await call(asha, 'PUT', `${trip}/legs`, { ...FAR_RIDE, mode: 'boat' });
      expect(boat.status).toBe(400);
      expect(state.picks).toEqual([]);
    });
  });

  test('switching a cab to an e-rickshaw is stored, shows up in the report, and lowers the footprint; null undoes it', async () => {
    await withServer({}, async (call, state) => {
      const before = (await call(asha, 'GET', trip)).data;
      const cab = before.footprint.days[1].legs[0];
      expect([cab.fromStopId, cab.toStopId, cab.mode]).toEqual([FAR_RIDE.fromStopId, FAR_RIDE.toStopId, 'cab']);

      const put = await call(ben, 'PUT', `${trip}/legs`, { ...FAR_RIDE, mode: 'erickshaw' });
      expect(put.status).toBe(200);
      const swapped = put.data.footprint.days[1].legs[0];
      expect([swapped.mode, swapped.chosen]).toEqual(['erickshaw', true]);
      assert.ok(put.data.footprint.totalKg < before.footprint.totalKg);
      expect(state.picks).toEqual([{ from: FAR_RIDE.fromStopId, to: FAR_RIDE.toStopId, mode: 'erickshaw', by: ben.id }]);

      // Everyone sees it
      const seen = (await call(asha, 'GET', trip)).data;
      expect(seen.footprint.totalKg).toBe(put.data.footprint.totalKg);

      const undone = await call(asha, 'PUT', `${trip}/legs`, { ...FAR_RIDE, mode: null });
      expect(undone.status).toBe(200);
      expect(undone.data.footprint.totalKg).toBe(before.footprint.totalKg);
      expect(state.picks).toEqual([]);
    });
  });
});

describe('pledges', () => {
  test('each member ticks their own and the squad sees everyone’s', async () => {
    await withServer({}, async (call) => {
      const start = await call(asha, 'GET', `${trip}/pledges`);
      expect(start.status).toBe(200);
      expect([start.data.items.length, start.data.ticks, start.data.possible]).toEqual([8, 0, 16]);

      const ticked = await call(asha, 'PUT', `${trip}/pledges`, { pledgeId: 'refill', taken: true });
      expect(ticked.status).toBe(200);
      expect(ticked.data.pledges.items.find((p: any) => p.id === 'refill').ticks).toEqual(['m1']);
      expect(ticked.data.pledges.mine).toBe(1);
      // The score comes back with it
      assert.ok(ticked.data.score.parts.find((p: any) => p.id === 'pledges').points > 0);

      await call(ben, 'PUT', `${trip}/pledges`, { pledgeId: 'refill', taken: true });
      await call(ben, 'PUT', `${trip}/pledges`, { pledgeId: 'no-flash', taken: true });
      const mine = (await call(asha, 'GET', `${trip}/pledges`)).data;
      expect(mine.items.find((p: any) => p.id === 'refill').ticks).toEqual(['m1', 'm2']);
      expect([mine.mine, mine.ticks]).toEqual([1, 3]);
      const bens = (await call(ben, 'GET', `${trip}/pledges`)).data;
      expect(bens.mine).toBe(2);

      // Ticking twice changes nothing; unticking only removes your own
      await call(asha, 'PUT', `${trip}/pledges`, { pledgeId: 'refill', taken: true });
      const off = await call(asha, 'PUT', `${trip}/pledges`, { pledgeId: 'refill', taken: false });
      expect(off.data.pledges.items.find((p: any) => p.id === 'refill').ticks).toEqual(['m2']);
    });
  });

  test('unknown pledges and malformed bodies are rejected', async () => {
    await withServer({}, async (call) => {
      expect((await call(asha, 'PUT', `${trip}/pledges`, { pledgeId: 'world-peace', taken: true })).status).toBe(400);
      expect((await call(asha, 'PUT', `${trip}/pledges`, { pledgeId: 'refill', taken: 'yes' })).status).toBe(400);
      expect((await call(asha, 'PUT', `${trip}/pledges`, {})).status).toBe(400);
    });
  });
});

describe('with Gemini', () => {
  test('sorts what the rules couldn’t place, re-words the swaps, caches both, and leaves quick edits to the cache', async () => {
    const gemini = fakeGemini((request) => {
      const prompt = String(request.prompt);
      if (prompt.includes('Give each numbered description')) return { items: [{ i: 1, class: 'local-artisan' }] };
      // Re-word the first swap, keeping its numbers
      return { tips: [{ i: 1, text: `Tip: ${/^1\. (.+)$/m.exec(prompt)![1]}` }] };
    });
    await withServer({ gemini }, async (call, state) => {
      const { data } = await call(asha, 'GET', trip);
      expect(data.local.classifier).toBe('rules+gemini');
      // Lunch ₹4,800 + the gifts ₹2,000 (Gemini: crafts) are kept; the tickets aren't
      expect(data.local.keptPaise).toBe(680_000);
      expect(data.local.byClass.find((c: any) => c.id === 'local-artisan').paise).toBe(200_000);
      expect([...state.cache.keys()].some(k => k.startsWith('expense:'))).toBe(true);
      expect(data.swaps[0].text.startsWith('Tip: ')).toBe(true);
      expect([...state.cache.keys()].some(k => k.startsWith('swaps:'))).toBe(true);
      const before = gemini.calls.length;
      expect(before).toBe(2);

      // Cached now: another GET doesn't ask again, and a ride change never waits on Gemini
      await call(asha, 'GET', trip);
      await call(asha, 'PUT', `${trip}/legs`, { ...FAR_RIDE, mode: 'auto' });
      await call(asha, 'PUT', `${trip}/pledges`, { pledgeId: 'refill', taken: true });
      expect(gemini.calls.length).toBe(before);
    });
  });

  test('a Gemini that fails changes nothing but the wording', async () => {
    const gemini = fakeGemini(() => { throw new Error('quota exceeded'); });
    await withServer({ gemini }, async (call) => {
      const { status, data } = await call(asha, 'GET', trip);
      expect(status).toBe(200);
      expect(data.local.classifier).toBe('rules');
      expect(data.local.keptPaise).toBe(480_000);
    });
  });
});

describe('mounting', () => {
  test('/api/impact is routed before the expense ledger’s catch-all, and is a clean 503 without a database', async () => {
    const stub = (name: string) => Router().use((_req, res) => { res.json({ handledBy: name }); });
    const wired = await serve(createServer({ auth: stub('auth'), expenses: stub('expenses'), impact: stub('impact') }));
    try {
      expect((await (await wired.request('/api/impact/trips/abc')).json()).handledBy).toBe('impact');
      expect((await (await wired.request('/api/groups/abc')).json()).handledBy).toBe('expenses');
    } finally {
      await wired.close();
    }
    const bare = await serve(createServer({ auth: stub('auth') }));
    try {
      const res = await bare.request('/api/impact/trips/abc');
      expect(res.status).toBe(503);
      expect((await res.json()).error.code).toBe('SERVICE_UNAVAILABLE');
    } finally {
      await bare.close();
    }
  });
});
