import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import type { User } from '../../src/auth/types.ts';
import { GeminiError, wavFromPcm, type Gemini, type JsonRequest, type SpeechRequest } from '../../src/gemini.ts';
import { SITES } from '../../src/heritage/sites.ts';
import { ApiError } from '../../src/http.ts';
import { createMediaRouter, createMediaStorage, type MediaStorage } from '../../src/storage.ts';
import { createStoriesApp } from '../../src/stories/app.ts';
import { CURATED } from '../../src/stories/curated/index.ts';
import { NARRATOR_VOICE } from '../../src/stories/narration.ts';
import type { StoriesDb } from '../../src/stories/service.ts';
import { mount, serve } from '../helpers.ts';

const TRIP = '11111111-1111-4111-8111-111111111111';
const OTHER_TRIP = '22222222-2222-4222-8222-222222222222';
const user = (id: string, name: string) => ({ id, username: name.toLowerCase(), email: `${name.toLowerCase()}@test.local`, name }) as User;
const asha = user('usr_1', 'Asha');
const ravi = user('usr_2', 'Ravi');
const meera = user('usr_3', 'Meera');
const outsider = user('usr_9', 'Outsider');
const USERS = [asha, ravi, meera, outsider];

const vibe = (scores: Record<string, number>) => ({ adventure: 0.3, food: 0.3, nightlife: 0.3, culture: 0.3, chill: 0.3, shops: 0.3, ...scores });
const MEMBERS = [
  { user: asha, memberId: 'm1', preferences: { vibe: vibe({ culture: 0.9, food: 0.8 }) } },
  { user: ravi, memberId: 'm2', preferences: { vibe: vibe({ culture: 0.8, food: 0.7 }) } },
  { user: meera, memberId: 'm3', preferences: {} },
];

type StampRow = { user_id: string; site_id: string; score: number; total: number; lang: string; trip_id: string | null; stamped_at: Date };

/** In-memory stand-in for the queries the stories routes run. asha, ravi and meera are on TRIP; nobody is on OTHER_TRIP. */
function fakeDb() {
  const cache = new Map<string, unknown>();
  const narrations = new Map<string, Record<string, unknown>>();
  const stamps = new Map<string, StampRow>();
  const state = { down: false, queries: [] as string[] };
  let tick = 0;
  const member = (trip: unknown, userId: unknown) => trip === TRIP && MEMBERS.some(m => m.user.id === userId);
  const db: StoriesDb = {
    pool: {
      query: async (sql: string, values: unknown[] = []) => {
        if (state.down) throw new Error('connection refused');
        state.queries.push(sql);
        const ok = (rows: any[]) => ({ rowCount: rows.length, rows });
        if (sql.startsWith('SELECT 1 FROM trip_members')) return ok(member(values[0], values[1]) ? [{}] : []);
        if (sql.startsWith('SELECT u.preferences FROM trip_members')) return ok(values[0] === TRIP ? MEMBERS.map(m => ({ preferences: m.preferences })) : []);
        if (sql.startsWith('SELECT user_id FROM trip_members')) return ok(values[0] === TRIP ? MEMBERS.map(m => ({ user_id: m.user.id })) : []);
        if (sql.startsWith('SELECT story FROM story_cache')) {
          const story = cache.get(values.join('|'));
          return ok(story ? [{ story }] : []);
        }
        if (sql.startsWith('INSERT INTO story_cache')) {
          const key = values.slice(0, 4).join('|');
          if (!cache.has(key)) cache.set(key, JSON.parse(values[4] as string));
          return { rowCount: 1, rows: [] };
        }
        if (sql.includes('FROM story_narrations')) {
          const row = narrations.get(values.join('|'));
          return ok(row ? [row] : []);
        }
        if (sql.startsWith('INSERT INTO story_narrations')) {
          narrations.set(values.slice(0, 5).join('|'), { audio_key: values[5], duration_sec: values[6], marks: JSON.parse(values[7] as string) });
          return { rowCount: 1, rows: [] };
        }
        if (sql.startsWith('INSERT INTO heritage_stamps')) {
          const [recipients, siteId, score, total, lang, tripId] = values as [string[], string, number, number, string, string | null];
          const rows = recipients.map((userId) => {
            const key = `${userId}|${siteId}`;
            const existing = stamps.get(key);
            const row: StampRow = existing
              ? { ...existing, score: Math.max(existing.score, score) }
              : { user_id: userId, site_id: siteId, score, total, lang, trip_id: tripId, stamped_at: new Date(Date.UTC(2026, 10, 1, 10, tick++)) };
            stamps.set(key, row);
            return { user_id: userId, score: row.score, total: row.total, inserted: !existing };
          });
          return ok(rows);
        }
        if (sql.startsWith('SELECT site_id, score, total, stamped_at FROM heritage_stamps')) {
          return ok([...stamps.values()].filter(s => s.user_id === values[0]).sort((a, b) => a.stamped_at.getTime() - b.stamped_at.getTime()));
        }
        if (sql.includes('s.site_id, s.score')) {
          // The squad's passports
          const rows: any[] = values[0] === TRIP ? MEMBERS.flatMap((m): any[] => {
            const mine = [...stamps.values()].filter(s => s.user_id === m.user.id);
            const base = { member_id: m.memberId, user_id: m.user.id, name: m.user.name, picture: null };
            return mine.length ? mine.map(s => ({ ...base, site_id: s.site_id, score: s.score, total: s.total, stamped_at: s.stamped_at })) : [{ ...base, site_id: null, score: null, total: null, stamped_at: null }];
          }) : [];
          return ok(rows);
        }
        if (sql.includes('s.site_id = $2')) {
          // Who in the squad holds the stamp for one site
          return ok(values[0] === TRIP ? MEMBERS.map((m) => {
            const stamp = stamps.get(`${m.user.id}|${values[1]}`);
            return { member_id: m.memberId, user_id: m.user.id, name: m.user.name, picture: null, score: stamp?.score ?? null, total: stamp?.total ?? null };
          }) : []);
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
    },
  };
  return { db, cache, narrations, stamps, state };
}

function fakeStorage() {
  const objects = new Map<string, { data: Buffer; type: string }>();
  const storage = {
    kind: 'local', description: 'test',
    createUpload: async () => { throw new Error('unused'); },
    readUrl: async (key: string) => `https://media.test/${key}`,
    size: async (key: string) => objects.get(key)?.data.length ?? null,
    put: async (key: string, data: Buffer, type: string) => { objects.set(key, { data, type }); },
  } as MediaStorage;
  return { storage, objects };
}

const tone = (seconds: number) => {
  const pcm = Buffer.alloc(Math.round(seconds * 24_000) * 2);
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(8000 * Math.sin(i / 10)), i * 2);
  return wavFromPcm(pcm, 24_000);
};

type Fake = Gemini & { calls: { json: JsonRequest[]; speech: SpeechRequest[] } };

function fakeGemini({ enabled = true, json, speech }: { enabled?: boolean; json?: (request: JsonRequest) => unknown | Promise<unknown>; speech?: (request: SpeechRequest) => Buffer | Promise<Buffer> } = {}): Fake {
  const calls = { json: [] as JsonRequest[], speech: [] as SpeechRequest[] };
  return {
    enabled,
    imageEnabled: false,
    models: { lite: 'lite', smart: 'smart', image: 'image', tts: 'tts' },
    calls,
    json: (async (request: JsonRequest) => {
      calls.json.push(request);
      if (!json) throw new GeminiError('no json handler');
      return json(request);
    }) as Gemini['json'],
    image: async () => { throw new GeminiError('no images'); },
    speech: async (request: SpeechRequest) => {
      calls.speech.push(request);
      if (!speech) throw new GeminiError('no speech handler');
      return speech(request);
    },
  };
}

/** What Gemini would send back for a site: the classic telling lightly reworded, in either language */
function retelling(siteId: string, lang: 'en' | 'hi' = 'en') {
  const body = CURATED.get(siteId)![lang];
  return {
    title: `${body.title} (retold)`,
    panels: body.panels.map(p => ({ heading: p.heading, text: p.text, lookFor: p.lookFor })),
    quiz: body.quiz.map(q => ({ question: q.question, options: [...q.options], answerIndex: q.answerIndex, fact: q.fact })),
    careNote: body.careNote,
  };
}

type Options = { gemini?: Gemini; vertex?: Gemini; slowMs?: number; now?: () => number; db?: ReturnType<typeof fakeDb>; storage?: ReturnType<typeof fakeStorage> };

async function withServer(options: Options, run: (api: Api, ctx: { db: ReturnType<typeof fakeDb>; storage: ReturnType<typeof fakeStorage> }) => Promise<void>) {
  const db = options.db ?? fakeDb();
  const storage = options.storage ?? fakeStorage();
  const authenticate = async (token: string) => {
    const found = USERS.find(u => u.username === token);
    if (!found) throw new ApiError(401, 'UNAUTHORIZED', 'Bad token');
    return found;
  };
  const router = createStoriesApp({ db: db.db, storage: storage.storage, gemini: options.gemini ?? fakeGemini({ enabled: false }), vertex: options.vertex, slowMs: options.slowMs ?? 500, now: options.now, retryMs: 1, authenticate });
  const server = await serve(mount('/api/stories', router));
  const api: Api = async (as, method, path, body) => {
    const res = await server.request(`/api/stories${path}`, {
      method,
      headers: { ...(as ? { authorization: `Bearer ${as.username}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => null) as any };
  };
  try {
    await run(api, { db, storage });
  } finally {
    await server.close();
  }
}

type Api = (as: User | null, method: string, path: string, body?: unknown) => Promise<{ status: number; data: any }>;

describe('the story catalogue', () => {
  test('lists every heritage site, hand-written stories first, with their painted cover', async () => {
    await withServer({}, async (api) => {
      const { status, data } = await api(null, 'GET', '/');
      expect(status).toBe(200);
      expect(data.items).toHaveLength(SITES.length);
      const curated = data.items.filter((i: { curated: boolean }) => i.curated);
      expect(curated.length >= 6).toBe(true);
      expect(data.items.slice(0, curated.length).every((i: { curated: boolean }) => i.curated)).toBe(true);
      const bagore = data.items.find((i: { siteId: string }) => i.siteId === 'bagore-ki-haveli');
      expect(bagore.art).toBe('/stories/bagore-ki-haveli/1.jpg');
      expect(bagore.narrated).toEqual({ en: true, hi: true });
      expect(data.items.find((i: { siteId: string }) => i.siteId === 'gangaur-ghat').art).toBe(null);
    });
  });
});

describe('reading a story', () => {
  test('the classic telling is hand-written, instant and needs no Gemini', async () => {
    const gemini = fakeGemini({ json: () => { throw new Error('should not be called'); } });
    await withServer({ gemini }, async (api, { db }) => {
      const en = await api(null, 'GET', '/city-palace');
      expect(en.status).toBe(200);
      expect(en.data.lang).toBe('en');
      expect(en.data.audience).toBe('classic');
      expect(en.data.generated).toBe(false);
      expect(en.data.panels).toHaveLength(4);
      expect(en.data.panels[0].art).toBe('/stories/city-palace/1.jpg');
      expect(en.data.quiz).toHaveLength(3);
      expect(en.data.narration.source).toBe('static');
      expect(en.data.narration.marks).toHaveLength(4);

      const hi = await api(null, 'GET', '/bagore-ki-haveli?lang=hi&audience=classic');
      expect(hi.data.lang).toBe('hi');
      expect(hi.data.title).toBe('घाट किनारे प्रधानमंत्री की हवेली');
      expect(hi.data.narration.url).toBe('/stories/bagore-ki-haveli/hi.m4a');
      expect(gemini.calls.json).toHaveLength(0);
      expect(db.state.queries).toHaveLength(0);
    });
  });

  test('a site without a hand-written story opens with one built from its notes, in English', async () => {
    await withServer({}, async (api) => {
      const { status, data } = await api(null, 'GET', '/gangaur-ghat?lang=hi');
      expect(status).toBe(200);
      expect(data.lang).toBe('en');
      expect(data.generated).toBe(false);
      expect(data.panels).toHaveLength(3);
      expect(data.panels[0].art).toBe(undefined);
      expect(data.quiz).toHaveLength(3);
      expect(data.narration).toBe(null);
    });
  });

  test('unknown sites are 404 and bad options 400', async () => {
    await withServer({}, async (api) => {
      expect((await api(null, 'GET', '/atlantis')).status).toBe(404);
      expect((await api(null, 'GET', '/city-palace?lang=fr')).status).toBe(400);
      expect((await api(null, 'GET', '/city-palace?audience=aliens')).status).toBe(400);
    });
  });

  test('a retelling for the audience comes from Gemini, reuses the painted art and is cached', async () => {
    const gemini = fakeGemini({ json: () => retelling('city-palace') });
    await withServer({ gemini }, async (api, { db }) => {
      const first = await api(null, 'GET', '/city-palace?audience=family');
      expect(first.data.generated).toBe(true);
      expect(first.data.audience).toBe('family');
      expect(first.data.title).toBe('The Palace Four Centuries in the Making (retold)');
      expect(first.data.panels.map((p: { art: string }) => p.art)).toEqual(CURATED.get('city-palace')!.art);
      expect(first.data.narration).toBe(null);
      expect(first.data.vibe).toBe(null);

      const prompt = String(gemini.calls.json[0].prompt);
      expect(gemini.calls.json[0].model).toBe('smart');
      expect(prompt.includes('children')).toBe(true);
      expect(gemini.calls.json[0].system!.includes('Never invent dates')).toBe(true);

      // Second open: straight from the database
      const again = await api(null, 'GET', '/city-palace?audience=family');
      expect(again.data.generated).toBe(true);
      expect(gemini.calls.json).toHaveLength(1);
      expect(db.cache.size).toBe(1);
      // Another audience is another retelling
      await api(null, 'GET', '/city-palace?audience=couple');
      expect(gemini.calls.json).toHaveLength(2);
    });
  });

  test('a Hindi retelling must come back in Hindi', async () => {
    const gemini = fakeGemini({ json: (request) => (String(request.prompt).includes('Devanagari') ? retelling('sajjangarh', 'hi') : null) });
    await withServer({ gemini }, async (api) => {
      const { data } = await api(null, 'GET', '/sajjangarh?lang=hi&audience=friends');
      expect(data.generated).toBe(true);
      expect(data.lang).toBe('hi');
      expect(/[ऀ-ॿ]/.test(data.panels[0].text)).toBe(true);
    });
  });

  test('with Gemini off the audience chips fall back to the classic telling', async () => {
    await withServer({ gemini: fakeGemini({ enabled: false }) }, async (api) => {
      const { data } = await api(null, 'GET', '/jagdish-temple?audience=couple');
      expect(data.generated).toBe(false);
      expect(data.audience).toBe('classic');
      expect(data.panels).toHaveLength(4);
    });
  });

  test('a Gemini outage gives the classic telling at once, and later requests skip Gemini until it cools off', async () => {
    let now = 1_000_000;
    let healthy = false;
    const gemini = fakeGemini({ json: () => { if (!healthy) throw new GeminiError('Gemini 429: quota', 429); return retelling('fateh-sagar'); } });
    await withServer({ gemini, now: () => now }, async (api) => {
      const first = await api(null, 'GET', '/fateh-sagar?audience=history');
      expect(first.data.generated).toBe(false);
      expect(first.data.audience).toBe('classic');
      expect(gemini.calls.json).toHaveLength(1);

      await api(null, 'GET', '/fateh-sagar?audience=history');
      expect(gemini.calls.json).toHaveLength(1);

      healthy = true;
      now += 60_000;
      const later = await api(null, 'GET', '/fateh-sagar?audience=history');
      expect(later.data.generated).toBe(true);
      expect(gemini.calls.json).toHaveLength(2);
    });
  });

  test('when the API key is out of quota Vertex AI gets a second go', async () => {
    const gemini = fakeGemini({ json: () => { throw new GeminiError('Gemini 429: quota', 429); } });
    const vertex = fakeGemini({ json: () => retelling('pichola-boat') });
    await withServer({ gemini, vertex }, async (api) => {
      const { data } = await api(null, 'GET', '/pichola-boat?audience=friends');
      expect(data.generated).toBe(true);
      expect(gemini.calls.json).toHaveLength(1);
      expect(vertex.calls.json).toHaveLength(1);
    });
  });

  test('an answer that invents a year is not trusted', async () => {
    const raw = retelling('sajjangarh');
    raw.panels[0].text += ' It was finished in 1999.';
    const gemini = fakeGemini({ json: () => raw });
    await withServer({ gemini }, async (api, { db }) => {
      const { data } = await api(null, 'GET', '/sajjangarh?audience=history');
      expect(data.generated).toBe(false);
      expect(db.cache.size).toBe(0);
    });
  });

  test('a slow retelling shows the classic telling now and is ready for the next open', async () => {
    const gemini = fakeGemini({ json: async () => { await new Promise(resolve => setTimeout(resolve, 150)); return retelling('saheliyon-ki-bari'); } });
    await withServer({ gemini, slowMs: 20 }, async (api, { db }) => {
      const first = await api(null, 'GET', '/saheliyon-ki-bari?audience=couple');
      expect(first.data.generated).toBe(false);
      expect(first.data.audience).toBe('classic');
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(db.cache.size).toBe(1);
      const second = await api(null, 'GET', '/saheliyon-ki-bari?audience=couple');
      expect(second.data.generated).toBe(true);
      expect(gemini.calls.json).toHaveLength(1);
    });
  });

  test('two readers asking at once share one retelling', async () => {
    const gemini = fakeGemini({ json: async () => { await new Promise(resolve => setTimeout(resolve, 60)); return retelling('city-palace'); } });
    await withServer({ gemini }, async (api) => {
      const [a, b] = await Promise.all([api(null, 'GET', '/city-palace?audience=family'), api(null, 'GET', '/city-palace?audience=family')]);
      expect(a.data.generated && b.data.generated).toBe(true);
      expect(gemini.calls.json).toHaveLength(1);
    });
  });

  test('a squad member gets the story tuned to the squad’s vibe; strangers and signed-out readers do not', async () => {
    const gemini = fakeGemini({ json: () => retelling('city-palace') });
    await withServer({ gemini }, async (api) => {
      const member = await api(asha, 'GET', `/city-palace?audience=friends&tripId=${TRIP}`);
      expect(member.data.vibe).toBe('culture+food');
      expect(String(gemini.calls.json[0].prompt).includes('culture and food')).toBe(true);

      // The same squad vibe reuses the cached retelling
      const mate = await api(ravi, 'GET', `/city-palace?audience=friends&tripId=${TRIP}`);
      expect(mate.data.vibe).toBe('culture+food');
      expect(gemini.calls.json).toHaveLength(1);

      const stranger = await api(outsider, 'GET', `/city-palace?audience=friends&tripId=${TRIP}`);
      expect(stranger.data.vibe).toBe(null);
      const signedOut = await api(null, 'GET', `/city-palace?audience=friends&tripId=${TRIP}`);
      expect(signedOut.data.vibe).toBe(null);
      const otherTrip = await api(asha, 'GET', `/city-palace?audience=friends&tripId=${OTHER_TRIP}`);
      expect(otherTrip.data.vibe).toBe(null);
      expect(gemini.calls.json).toHaveLength(2);
    });
  });

  test('the story still opens when the database is down', async () => {
    const db = fakeDb();
    db.state.down = true;
    const gemini = fakeGemini({ json: () => retelling('city-palace') });
    await withServer({ db, gemini }, async (api) => {
      expect((await api(null, 'GET', '/city-palace')).status).toBe(200);
      const tuned = await api(asha, 'GET', `/city-palace?audience=family&tripId=${TRIP}`);
      expect(tuned.status).toBe(200);
      expect(tuned.data.generated).toBe(true);
    });
  });
});

describe('narration', () => {
  test('needs a signed-in reader', async () => {
    await withServer({}, async (api) => {
      expect((await api(null, 'POST', '/city-palace/narration', { lang: 'en' })).status).toBe(401);
    });
  });

  test('a hand-written story plays its shipped recording without calling Gemini', async () => {
    const gemini = fakeGemini({ speech: () => { throw new Error('should not be called'); } });
    await withServer({ gemini }, async (api) => {
      const { status, data } = await api(asha, 'POST', '/bagore-ki-haveli/narration', { lang: 'hi', audience: 'classic' });
      expect(status).toBe(200);
      expect(data.source).toBe('static');
      expect(data.url).toBe('/stories/bagore-ki-haveli/hi.m4a');
      expect(data.marks).toHaveLength(4);
      expect(gemini.calls.speech).toHaveLength(0);
    });
  });

  test('a retelling is recorded panel by panel, stored, and replayed from the cache', async () => {
    const gemini = fakeGemini({ json: () => retelling('city-palace') });
    const vertex = fakeGemini({ speech: () => tone(1.5) });
    await withServer({ gemini, vertex }, async (api, { storage, db }) => {
      await api(asha, 'GET', '/city-palace?audience=family');
      const first = await api(asha, 'POST', '/city-palace/narration', { lang: 'en', audience: 'family' });
      expect(first.status).toBe(200);
      expect(first.data.cached).toBe(false);
      expect(first.data.source).toBe('gemini');
      expect(first.data.marks).toHaveLength(4);
      expect(first.data.marks[0]).toBe(0);
      expect(first.data.durationSec > 6).toBe(true);
      expect(first.data.url.startsWith('https://media.test/stories/narration/city-palace/en/family-all-')).toBe(true);
      expect(first.data.url.endsWith('.wav')).toBe(true);

      // One recording per panel, in the storyteller's voice, steered by director's notes that are not read out
      expect(vertex.calls.speech).toHaveLength(4);
      expect(gemini.calls.speech).toHaveLength(0);
      expect(vertex.calls.speech.every(r => r.voice === NARRATOR_VOICE)).toBe(true);
      expect(vertex.calls.speech[0].text.includes('#### TRANSCRIPT')).toBe(true);
      expect(vertex.calls.speech[0].text.includes('fifteen-fifties')).toBe(true);
      const [key, object] = [...storage.objects.entries()][0];
      expect(object.type).toBe('audio/wav');
      expect(key.endsWith('.wav')).toBe(true);
      expect(db.narrations.size).toBe(1);

      const again = await api(ravi, 'POST', '/city-palace/narration', { lang: 'en', audience: 'family' });
      expect(again.data.cached).toBe(true);
      expect(again.data.url).toBe(first.data.url);
      expect(vertex.calls.speech).toHaveLength(4);
    });
  });

  test('without Vertex the API-key client records it, and two requests at once share one recording', async () => {
    const gemini = fakeGemini({ json: () => retelling('jagdish-temple'), speech: async () => { await new Promise(resolve => setTimeout(resolve, 30)); return tone(1); } });
    await withServer({ gemini }, async (api) => {
      await api(null, 'GET', '/jagdish-temple?audience=couple');
      const [a, b] = await Promise.all([
        api(asha, 'POST', '/jagdish-temple/narration', { lang: 'en', audience: 'couple' }),
        api(ravi, 'POST', '/jagdish-temple/narration', { lang: 'en', audience: 'couple' }),
      ]);
      expect(a.status).toBe(200);
      expect(a.data.url).toBe(b.data.url);
      expect(gemini.calls.speech).toHaveLength(4);
    });
  });

  test('a rate-limited recording is retried', async () => {
    let failures = 1;
    const gemini = fakeGemini({
      json: () => retelling('jagdish-temple'),
      speech: () => {
        if (failures-- > 0) throw new GeminiError('Gemini 429: slow down', 429);
        return tone(1);
      },
    });
    await withServer({ gemini }, async (api) => {
      await api(null, 'GET', '/jagdish-temple?audience=couple');
      const { status } = await api(asha, 'POST', '/jagdish-temple/narration', { lang: 'en', audience: 'couple' });
      expect(status).toBe(200);
      expect(gemini.calls.speech).toHaveLength(5);
    });
  });

  test('says so plainly when the voice is unavailable', async () => {
    await withServer({ gemini: fakeGemini({ enabled: false }) }, async (api) => {
      const off = await api(asha, 'POST', '/gangaur-ghat/narration', { lang: 'en' });
      expect(off.status).toBe(503);
      expect(off.data.error.code).toBe('NARRATION_UNAVAILABLE');
    });
    const broken = fakeGemini({ speech: () => { throw new GeminiError('Gemini 400: bad request', 400); } });
    await withServer({ gemini: broken }, async (api) => {
      const { status, data } = await api(asha, 'POST', '/gangaur-ghat/narration', { lang: 'en' });
      expect(status).toBe(503);
      expect(data.error.code).toBe('NARRATION_UNAVAILABLE');
    });
  });
});

describe('the Heritage Passport', () => {
  const rightAnswers = (siteId: string, lang: 'en' | 'hi' = 'en') => CURATED.get(siteId)![lang].quiz.map(q => q.answerIndex);

  test('stamping needs a signed-in reader and sensible answers', async () => {
    await withServer({}, async (api) => {
      expect((await api(null, 'POST', '/city-palace/stamp', { answers: [0, 0, 0] })).status).toBe(401);
      expect((await api(asha, 'POST', '/city-palace/stamp', {})).status).toBe(400);
      expect((await api(asha, 'POST', '/city-palace/stamp', { answers: [] })).status).toBe(400);
      expect((await api(asha, 'POST', '/city-palace/stamp', { answers: ['a', 'b', 'c'] })).status).toBe(400);
      expect((await api(asha, 'POST', '/city-palace/stamp', { answers: [0, 1, 2], withUserIds: 'everyone' })).status).toBe(400);
      expect((await api(asha, 'POST', '/atlantis/stamp', { answers: [0, 1, 2] })).status).toBe(404);
    });
  });

  test('the server scores the quiz, saves the stamp and keeps the best round', async () => {
    await withServer({}, async (api, { db }) => {
      const first = await api(asha, 'POST', '/city-palace/stamp', { lang: 'en', answers: [(rightAnswers('city-palace')[0] + 1) % 3, ...rightAnswers('city-palace').slice(1)] });
      expect(first.status).toBe(200);
      expect(first.data.score).toBe(2);
      expect(first.data.total).toBe(3);
      expect(first.data.grade).toBe('silver');
      expect(first.data.results.map((r: { correct: boolean }) => r.correct)).toEqual([false, true, true]);
      expect(first.data.firstTime).toBe(true);
      expect(first.data.passport).toEqual({ stamped: 1, totalSites: SITES.length });
      expect(first.data.squad).toBe(undefined);

      const better = await api(asha, 'POST', '/city-palace/stamp', { lang: 'en', answers: rightAnswers('city-palace') });
      expect(better.data.grade).toBe('gold');
      expect(better.data.firstTime).toBe(false);
      expect(better.data.best.score).toBe(3);

      // A worse round never lowers the stamp
      const worse = await api(asha, 'POST', '/city-palace/stamp', { lang: 'en', answers: [null, null, null] });
      expect(worse.data.score).toBe(0);
      expect(worse.data.best).toEqual({ score: 3, total: 3, grade: 'gold' });
      expect(db.stamps.get('usr_1|city-palace')!.score).toBe(3);
    });
  });

  test('scores the Hindi quiz against the Hindi telling', async () => {
    await withServer({}, async (api) => {
      const { data } = await api(asha, 'POST', '/bagore-ki-haveli/stamp', { lang: 'hi', answers: rightAnswers('bagore-ki-haveli', 'hi') });
      expect(data.score).toBe(3);
    });
  });

  test('scores a retold story against the quiz the reader saw', async () => {
    const gemini = fakeGemini({ json: () => retelling('sajjangarh') });
    await withServer({ gemini }, async (api) => {
      const story = await api(asha, 'GET', '/sajjangarh?audience=friends');
      const answers = story.data.quiz.map((q: { answerIndex: number }) => q.answerIndex);
      const { data } = await api(asha, 'POST', '/sajjangarh/stamp', { lang: 'en', audience: 'friends', answers });
      expect(data.score).toBe(3);
      // Scoring never asks Gemini for a different quiz
      expect(gemini.calls.json).toHaveLength(1);
    });
  });

  test('one phone reading to the squad stamps everyone who listened, and only people on the trip', async () => {
    await withServer({}, async (api, { db }) => {
      const { status, data } = await api(asha, 'POST', '/bagore-ki-haveli/stamp', {
        lang: 'hi', tripId: TRIP, answers: rightAnswers('bagore-ki-haveli', 'hi'), withUserIds: [ravi.id, meera.id, outsider.id, asha.id],
      });
      expect(status).toBe(200);
      expect(data.stampedWith).toBe(2);
      expect(db.stamps.has('usr_2|bagore-ki-haveli')).toBe(true);
      expect(db.stamps.has('usr_3|bagore-ki-haveli')).toBe(true);
      expect(db.stamps.has('usr_9|bagore-ki-haveli')).toBe(false);
      expect(data.squad.total).toBe(3);
      expect(data.squad.stamped).toBe(3);
      expect(data.squad.members.map((m: { memberId: string }) => m.memberId)).toEqual(['m1', 'm2', 'm3']);

      // A later stamp for someone else on a different site shows who is still missing
      const next = await api(asha, 'POST', '/city-palace/stamp', { tripId: TRIP, answers: rightAnswers('city-palace'), withUserIds: [ravi.id] });
      expect(next.data.squad.stamped).toBe(2);
      expect(next.data.squad.members.map((m: { stamped: boolean }) => m.stamped)).toEqual([true, true, false]);
    });
  });

  test('a trip you are not on is ignored when stamping', async () => {
    await withServer({}, async (api, { db }) => {
      const { status, data } = await api(outsider, 'POST', '/city-palace/stamp', { tripId: TRIP, answers: rightAnswers('city-palace'), withUserIds: [asha.id] });
      expect(status).toBe(200);
      expect(data.squad).toBe(undefined);
      expect(data.stampedWith).toBe(0);
      expect(db.stamps.has('usr_1|city-palace')).toBe(false);
      expect(db.stamps.has('usr_9|city-palace')).toBe(true);
    });
  });

  test('your passport shows every site, stamped or not yet', async () => {
    await withServer({}, async (api) => {
      expect((await api(null, 'GET', '/passport')).status).toBe(401);
      const empty = await api(asha, 'GET', '/passport');
      expect(empty.data.stamped).toBe(0);
      expect(empty.data.totalSites).toBe(SITES.length);
      expect(empty.data.sites).toHaveLength(SITES.length);

      await api(asha, 'POST', '/jagdish-temple/stamp', { answers: rightAnswers('jagdish-temple') });
      await api(asha, 'POST', '/sajjangarh/stamp', { answers: [0, 0, 0] });
      const passport = await api(asha, 'GET', '/passport');
      expect(passport.data.stamped).toBe(2);
      expect(passport.data.stamps.map((s: { siteId: string }) => s.siteId)).toEqual(['jagdish-temple', 'sajjangarh']);
      const jagdish = passport.data.sites.find((s: { siteId: string }) => s.siteId === 'jagdish-temple');
      expect(jagdish.stamp.grade).toBe('gold');
      expect(passport.data.sites.find((s: { siteId: string }) => s.siteId === 'city-palace').stamp).toBe(null);
      expect(passport.data.sites.find((s: { siteId: string }) => s.siteId === 'sajjangarh').stamp.grade).toBe('bronze');
    });
  });

  test('the squad’s passports show who has which stamp, with a leaderboard', async () => {
    await withServer({}, async (api) => {
      await api(asha, 'POST', '/city-palace/stamp', { tripId: TRIP, answers: rightAnswers('city-palace'), withUserIds: [ravi.id] });
      await api(asha, 'POST', '/jagdish-temple/stamp', { tripId: TRIP, answers: rightAnswers('jagdish-temple') });
      await api(ravi, 'POST', '/sajjangarh/stamp', { tripId: TRIP, answers: rightAnswers('sajjangarh') });

      const { status, data } = await api(meera, 'GET', `/passport/trip/${TRIP}`);
      expect(status).toBe(200);
      expect(data.squadSize).toBe(3);
      expect(data.totalSites).toBe(SITES.length);
      expect(data.leaderboard.map((l: { name: string; stamped: number; rank: number }) => [l.rank, l.name, l.stamped])).toEqual([[1, 'Asha', 2], [2, 'Ravi', 2], [3, 'Meera', 0]]);
      expect(data.bySite['city-palace']).toEqual(['m1', 'm2']);
      expect(data.bySite['jagdish-temple']).toEqual(['m1']);
      expect(data.bySite['sajjangarh']).toEqual(['m2']);
      expect(data.members.find((m: { name: string }) => m.name === 'Meera').stamps).toEqual([]);

      expect((await api(outsider, 'GET', `/passport/trip/${TRIP}`)).status).toBe(404);
      expect((await api(asha, 'GET', `/passport/trip/${OTHER_TRIP}`)).status).toBe(404);
      expect((await api(asha, 'GET', '/passport/trip/not-a-trip')).status).toBe(404);
      expect((await api(null, 'GET', `/passport/trip/${TRIP}`)).status).toBe(401);
    });
  });

  test('when the database is down the passport says so and stories keep working', async () => {
    const db = fakeDb();
    await withServer({ db }, async (api) => {
      db.state.down = true;
      const stamp = await api(asha, 'POST', '/city-palace/stamp', { answers: rightAnswers('city-palace') });
      expect(stamp.status).toBe(503);
      expect(stamp.data.error.code).toBe('PASSPORT_UNAVAILABLE');
      expect((await api(asha, 'GET', '/passport')).status).toBe(503);
      expect((await api(asha, 'GET', `/passport/trip/${TRIP}`)).status).toBe(503);
      expect((await api(null, 'GET', '/city-palace')).status).toBe(200);
    });
  });
});

describe('serving recordings from the local media route', () => {
  test('audio gets its type and byte ranges, which iPhones need to play and seek', async () => {
    const storage = createMediaStorage('test-secret-'.repeat(4), {});
    const folder = `stories-test-${crypto.randomUUID()}`;
    const key = `${folder}/narration.wav`;
    const data = tone(1);
    await storage.put(key, data, 'audio/wav');
    const server = await serve(mount('/api/media', createMediaRouter(storage)));
    try {
      const url = await storage.readUrl(key);
      const full = await server.request(url);
      expect(full.status).toBe(200);
      expect(full.headers.get('content-type')).toBe('audio/wav');
      expect(full.headers.get('accept-ranges')).toBe('bytes');
      expect(Buffer.from(await full.arrayBuffer()).equals(data)).toBe(true);

      const part = await server.request(url, { headers: { range: 'bytes=0-99' } });
      expect(part.status).toBe(206);
      expect(part.headers.get('content-range')).toBe(`bytes 0-99/${data.length}`);
      expect(Buffer.from(await part.arrayBuffer()).equals(data.subarray(0, 100))).toBe(true);

      const tail = await server.request(url, { headers: { range: 'bytes=-50' } });
      expect(tail.status).toBe(206);
      expect(Buffer.from(await tail.arrayBuffer()).equals(data.subarray(data.length - 50))).toBe(true);

      const open = await server.request(url, { headers: { range: `bytes=${data.length - 10}-` } });
      expect(open.headers.get('content-range')).toBe(`bytes ${data.length - 10}-${data.length - 1}/${data.length}`);
      await open.arrayBuffer();

      expect((await server.request(url, { headers: { range: `bytes=${data.length + 5}-` } })).status).toBe(416);
    } finally {
      await server.close();
      await rm(resolve(import.meta.dirname, '../../uploads', folder), { recursive: true, force: true });
    }
  });
});
