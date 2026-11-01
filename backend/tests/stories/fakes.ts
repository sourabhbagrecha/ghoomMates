import type { User } from '../../src/auth/types.ts';
import { GeminiError, wavFromPcm, type Gemini, type JsonRequest, type SpeechRequest } from '../../src/gemini.ts';
import type { MediaStorage } from '../../src/storage.ts';
import { CURATED } from '../../src/stories/curated/index.ts';
import type { StoriesDb } from '../../src/stories/service.ts';

// In-memory stand-ins for the database, media bucket and Gemini, shared by the stories API tests.
// asha, ravi and meera are on TRIP; nobody is on OTHER_TRIP.

export const TRIP = '11111111-1111-4111-8111-111111111111';
export const OTHER_TRIP = '22222222-2222-4222-8222-222222222222';
const user = (id: string, name: string) => ({ id, username: name.toLowerCase(), email: `${name.toLowerCase()}@test.local`, name }) as User;
export const asha = user('usr_1', 'Asha');
export const ravi = user('usr_2', 'Ravi');
export const meera = user('usr_3', 'Meera');
export const outsider = user('usr_9', 'Outsider');
export const USERS = [asha, ravi, meera, outsider];

const vibe = (scores: Record<string, number>) => ({ adventure: 0.3, food: 0.3, nightlife: 0.3, culture: 0.3, chill: 0.3, shops: 0.3, ...scores });
export const MEMBERS = [
  { user: asha, memberId: 'm1', preferences: { vibe: vibe({ culture: 0.9, food: 0.8 }) } },
  { user: ravi, memberId: 'm2', preferences: { vibe: vibe({ culture: 0.8, food: 0.7 }) } },
  { user: meera, memberId: 'm3', preferences: {} },
];

type StampRow = { user_id: string; site_id: string; score: number; total: number; lang: string; trip_id: string | null; stamped_at: Date };

/** In-memory stand-in for the queries the stories routes run. asha, ravi and meera are on TRIP; nobody is on OTHER_TRIP. */
export function fakeDb() {
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

export function fakeStorage() {
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

export const tone = (seconds: number) => {
  const pcm = Buffer.alloc(Math.round(seconds * 24_000) * 2);
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(8000 * Math.sin(i / 10)), i * 2);
  return wavFromPcm(pcm, 24_000);
};

export type Fake = Gemini & { calls: { json: JsonRequest[]; speech: SpeechRequest[] } };

export function fakeGemini({ enabled = true, json, speech }: { enabled?: boolean; json?: (request: JsonRequest) => unknown | Promise<unknown>; speech?: (request: SpeechRequest) => Buffer | Promise<Buffer> } = {}): Fake {
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
export function retelling(siteId: string, lang: 'en' | 'hi' = 'en') {
  const body = CURATED.get(siteId)![lang];
  return {
    title: `${body.title} (retold)`,
    panels: body.panels.map(p => ({ heading: p.heading, text: p.text, lookFor: p.lookFor })),
    quiz: body.quiz.map(q => ({ question: q.question, options: [...q.options], answerIndex: q.answerIndex, fact: q.fact })),
    careNote: body.careNote,
  };
}
