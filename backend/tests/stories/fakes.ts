import type { User } from '../../src/auth/types.ts';
import type { MediaStorage } from '../../src/storage.ts';
import { CURATED } from '../../src/stories/curated/index.ts';
import type { StoriesDb } from '../../src/stories/service.ts';
import type { TaleDoc } from '../../src/stories/tales.ts';
import type { Audience, Lang } from '../../src/stories/types.ts';
import { testDatabase } from '../mongo.ts';

// Stand-ins for the database (a seeded test database) and media bucket, shared by the stories API tests.
// asha, ravi and meera are on TRIP; nobody is on OTHER_TRIP.

export const TRIP = '11111111-1111-4111-8111-111111111111';
export const OTHER_TRIP = '22222222-2222-4222-8222-222222222222';
const user = (id: string, name: string) => ({ id, username: name.toLowerCase(), email: `${name.toLowerCase()}@test.local`, name }) as User;
export const asha = user('usr_1', 'Asha');
export const ravi = user('usr_2', 'Ravi');
export const meera = user('usr_3', 'Meera');
export const outsider = user('usr_9', 'Outsider');
export const USERS = [asha, ravi, meera, outsider];

export const MEMBERS = [
  { user: asha, memberId: 'm1' },
  { user: ravi, memberId: 'm2' },
  { user: meera, memberId: 'm3' },
];

/**
 * A real test database seeded with the trip: asha, ravi and meera are on TRIP; nobody is on OTHER_TRIP. `db` is what the
 * stories service gets; it counts each collection the service opens and throws while `state.down` is set.
 */
export async function fakeDb() {
  const database = await testDatabase();
  await database.db.collection<any>('users').insertMany(USERS.map(u => ({
    _id: u.id, google_id: `g-${u.id}`, username: u.username, email: u.email, name: u.name, picture: null,
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
  const prepare = (...tales: TaleDoc[]) => database.db.collection('heritage_tales').insertMany(tales.map(t => ({ ...t })));
  return { db, state, count, stamp, prepare };
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

/**
 * A heritage_tales document as the city batch would write it: the bundled telling of a curated site (or a short made-up one)
 * with art and narration keys in the bucket. `overrides` replaces any field.
 */
export function taleDoc(siteId: string, lang: Lang = 'en', audience: Audience = 'classic', overrides: Partial<TaleDoc> = {}): TaleDoc {
  const body = CURATED.get(siteId)?.[lang];
  const panels = body?.panels ?? [1, 2, 3].map(n => ({ heading: `Part ${n}`, text: `The ${audience} telling, part ${n}.`, lookFor: `Spot ${n}` }));
  const quiz = body?.quiz ?? [1, 2, 3].map(n => ({ question: `Question ${n}?`, options: ['a', 'b', 'c'], answerIndex: n % 3, fact: `Fact ${n}` }));
  const folder = `tales/udaipur/${siteId}/${lang}-${audience}`;
  return {
    city: 'Udaipur',
    site_id: siteId,
    lang,
    audience,
    title: `${body?.title ?? siteId} (${audience})`,
    panels: panels.map((p, i) => ({ heading: p.heading, text: p.text, look_for: p.lookFor, art_key: `${folder}/${i + 1}.jpg` })),
    quiz: quiz.map(q => ({ question: q.question, options: [...q.options], answer_index: q.answerIndex, fact: q.fact })),
    care_note: body?.careNote ?? 'Go gently.',
    narration: { audio_key: `${folder}/narration.m4a`, duration_sec: 12 * panels.length, marks: panels.map((_, i) => i * 12) },
    updated_at: new Date('2026-11-14T00:00:00Z'),
    ...overrides,
  };
}
