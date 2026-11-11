import type { User } from '../../src/auth/types.ts';
import { GeminiError, wavFromPcm, type Gemini, type JsonRequest, type SpeechRequest } from '../../src/gemini.ts';
import type { MediaStorage } from '../../src/storage.ts';
import { CURATED } from '../../src/stories/curated/index.ts';
import type { StoriesDb } from '../../src/stories/service.ts';
import { testDatabase } from '../mongo.ts';

// Stand-ins for the database (a seeded test database), media bucket and Gemini, shared by the stories API tests.
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

/**
 * A real test database seeded with the trip: asha, ravi and meera are on TRIP; nobody is on OTHER_TRIP. `db` is what the
 * stories service gets; it counts each collection the service opens and throws while `state.down` is set.
 */
export async function fakeDb() {
  const database = await testDatabase();
  await database.db.collection<any>('users').insertMany(USERS.map(u => ({
    _id: u.id, google_id: `g-${u.id}`, username: u.username, email: u.email, name: u.name, picture: null,
    preferences: MEMBERS.find(m => m.user.id === u.id)?.preferences ?? {},
  })));
  await database.db.collection('trip_members').insertMany(MEMBERS.map((m, i) => ({
    trip_id: TRIP, user_id: m.user.id, ledger_member_id: m.memberId, role: i ? 'mate' : 'organiser', joined_at: new Date(Date.UTC(2026, 10, 1, 9, i)),
  })));
  const state = { down: false, queries: 0 };
  const db: StoriesDb = {
    get db() {
      if (state.down) throw new Error('connection refused');
      state.queries++;
      return database.db;
    },
  };
  const count = (collection: string) => database.db.collection(collection).countDocuments();
  const stamp = (userId: string, siteId: string) => database.db.collection('heritage_stamps').findOne({ user_id: userId, site_id: siteId });
  return { db, state, count, stamp };
}

export function fakeStorage() {
  const objects = new Map<string, { data: Buffer; type: string }>();
  const storage = {
    kind: 'local', description: 'test',
    createUpload: async () => { throw new Error('unused'); },
    readUrl: async (key: string) => `https://media.test/${key}`,
    size: async (key: string) => objects.get(key)?.data.length ?? null,
    read: async (key: string) => objects.get(key)?.data ?? null,
    put: async (key: string, data: Buffer, type: string) => { objects.set(key, { data, type }); },
    remove: async (key: string) => { objects.delete(key); },
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
