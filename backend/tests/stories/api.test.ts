import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import type { User } from '../../src/auth/types.ts';
import { SITES } from '../../src/heritage/sites.ts';
import { ApiError } from '../../src/http.ts';
import { createMediaRouter, createMediaStorage } from '../../src/storage.ts';
import { createStoriesApp } from '../../src/stories/app.ts';
import { CURATED } from '../../src/stories/curated/index.ts';
import { mount, serve } from '../helpers.ts';
import { OTHER_TRIP, TRIP, USERS, asha, fakeDb, fakeStorage, meera, outsider, ravi, taleDoc } from './fakes.ts';

type Options = { db?: Awaited<ReturnType<typeof fakeDb>>; storage?: ReturnType<typeof fakeStorage> };

async function withServer(options: Options, run: (api: Api, ctx: { db: Awaited<ReturnType<typeof fakeDb>>; storage: ReturnType<typeof fakeStorage> }) => Promise<void>) {
  const db = options.db ?? await fakeDb();
  const storage = options.storage ?? fakeStorage();
  const authenticate = async (token: string) => {
    const found = USERS.find(u => u.username === token);
    if (!found) throw new ApiError(401, 'UNAUTHORIZED', 'Bad token');
    return found;
  };
  const router = createStoriesApp({ db: db.db, storage: storage.storage, lookupMs: 500, authenticate });
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
  test('lists every heritage site, full tellings first, with their painted cover', async () => {
    await withServer({}, async (api) => {
      const { status, data } = await api(null, 'GET', '/');
      expect(status).toBe(200);
      expect(data.items).toHaveLength(SITES.length);
      const curated = data.items.filter((i: { curated: boolean }) => i.curated);
      expect(curated.length >= 6).toBe(true);
      expect(data.items.slice(0, curated.length).every((i: { curated: boolean }) => i.curated)).toBe(true);
      const bagore = data.items.find((i: { siteId: string }) => i.siteId === 'bagore-ki-haveli');
      expect(bagore.city).toBe('Udaipur');
      expect(bagore.art).toBe('/stories/bagore-ki-haveli/1.jpg');
      expect(bagore.narrated).toEqual({ en: true, hi: true });
      expect(data.items.find((i: { siteId: string }) => i.siteId === 'gangaur-ghat').art).toBe(null);
    });
  });

  test('prepared classic tales take over a site’s title, cover and narration', async () => {
    const db = await fakeDb();
    await db.prepare(taleDoc('gangaur-ghat'), taleDoc('city-palace', 'en', 'classic', { title: 'The Prepared Palace', narration: null }));
    await withServer({ db }, async (api) => {
      const { data } = await api(null, 'GET', '/');
      const gangaur = data.items.find((i: { siteId: string }) => i.siteId === 'gangaur-ghat');
      expect(gangaur.curated).toBe(true);
      expect(gangaur.art).toBe('https://media.test/tales/udaipur/gangaur-ghat/en-classic/1.jpg');
      expect(gangaur.narrated).toEqual({ en: true, hi: false });
      const palace = data.items.find((i: { siteId: string }) => i.siteId === 'city-palace');
      expect(palace.title).toBe('The Prepared Palace');
      expect(palace.narrated.en).toBe(false);
    });
  });
});

describe('reading a story', () => {
  test('with nothing prepared, a key site opens its bundled telling and recording', async () => {
    await withServer({}, async (api) => {
      const en = await api(null, 'GET', '/city-palace');
      expect(en.status).toBe(200);
      expect(en.data.lang).toBe('en');
      expect(en.data.audience).toBe('classic');
      expect(en.data.source).toBe('bundled');
      expect(en.data.panels).toHaveLength(4);
      expect(en.data.panels[0].art).toBe('/stories/city-palace/1.jpg');
      expect(en.data.quiz).toHaveLength(3);
      expect(en.data.narration.source).toBe('static');
      expect(en.data.narration.marks).toHaveLength(4);

      const hi = await api(null, 'GET', '/bagore-ki-haveli?lang=hi&audience=classic');
      expect(hi.data.lang).toBe('hi');
      expect(hi.data.title).toBe('घाट किनारे प्रधानमंत्री की हवेली');
      expect(hi.data.narration.url).toBe('/stories/bagore-ki-haveli/hi.m4a');
    });
  });

  test('a site with nothing prepared or bundled opens with a story built from its notes, in English', async () => {
    await withServer({}, async (api) => {
      const { status, data } = await api(null, 'GET', '/gangaur-ghat?lang=hi');
      expect(status).toBe(200);
      expect(data.lang).toBe('en');
      expect(data.source).toBe('basic');
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

  test('a prepared tale is served with signed links to its art and narration', async () => {
    const db = await fakeDb();
    await db.prepare(taleDoc('city-palace', 'en', 'family'));
    await withServer({ db }, async (api) => {
      const { data } = await api(null, 'GET', '/city-palace?audience=family');
      expect(data.source).toBe('prepared');
      expect(data.audience).toBe('family');
      expect(data.title).toBe('The Palace Four Centuries in the Making (family)');
      expect(data.panels[0].art).toBe('https://media.test/tales/udaipur/city-palace/en-family/1.jpg');
      expect(data.narration).toEqual({ url: 'https://media.test/tales/udaipur/city-palace/en-family/narration.m4a', durationSec: 48, marks: [0, 12, 24, 36], source: 'prepared' });
    });
  });

  test('a prepared classic replaces the bundled one; panels without art borrow the bundled paintings', async () => {
    const db = await fakeDb();
    const doc = taleDoc('jagdish-temple');
    await db.prepare({ ...doc, panels: doc.panels.map(p => ({ ...p, art_key: null })), narration: null });
    await withServer({ db }, async (api) => {
      const { data } = await api(null, 'GET', '/jagdish-temple');
      expect(data.source).toBe('prepared');
      expect(data.panels.map((p: { art: string }) => p.art)).toEqual([1, 2, 3, 4].map(n => `/stories/jagdish-temple/${n}.jpg`));
      expect(data.narration).toBe(null);
    });
  });

  test('an audience with nothing prepared gets the classic telling, which says so', async () => {
    const db = await fakeDb();
    await db.prepare(taleDoc('gangaur-ghat'));
    await withServer({ db }, async (api) => {
      const bundled = await api(null, 'GET', '/sajjangarh?audience=couple');
      expect(bundled.data.audience).toBe('classic');
      expect(bundled.data.source).toBe('bundled');
      const prepared = await api(null, 'GET', '/gangaur-ghat?audience=history');
      expect(prepared.data.audience).toBe('classic');
      expect(prepared.data.source).toBe('prepared');
    });
  });

  test('a language with nothing prepared falls back to the bundled telling, then to a prepared English one', async () => {
    const db = await fakeDb();
    await db.prepare(taleDoc('city-palace', 'en', 'friends'), taleDoc('gangaur-ghat'));
    await withServer({ db }, async (api) => {
      const palace = await api(null, 'GET', '/city-palace?lang=hi&audience=friends');
      expect([palace.data.lang, palace.data.audience, palace.data.source]).toEqual(['hi', 'classic', 'bundled']);
      const ghat = await api(null, 'GET', '/gangaur-ghat?lang=hi');
      expect([ghat.data.lang, ghat.data.source]).toEqual(['en', 'prepared']);
    });
  });

  test('a malformed prepared tale is skipped', async () => {
    const db = await fakeDb();
    await db.prepare(taleDoc('city-palace', 'en', 'classic', { quiz: [] }));
    await withServer({ db }, async (api) => {
      expect((await api(null, 'GET', '/city-palace')).data.source).toBe('bundled');
    });
  });

  test('the story still opens when the database is down', async () => {
    const db = await fakeDb();
    db.state.down = true;
    await withServer({ db }, async (api) => {
      const { status, data } = await api(null, 'GET', '/city-palace?audience=family');
      expect(status).toBe(200);
      expect(data.source).toBe('bundled');
    });
  });

  test('nothing is generated on request: there is no narration route', async () => {
    await withServer({}, async (api) => {
      expect((await api(asha, 'POST', '/city-palace/narration', { lang: 'en' })).status).toBe(404);
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
      expect((await db.stamp('usr_1', 'city-palace'))!.score).toBe(3);
    });
  });

  test('scores the Hindi quiz against the Hindi telling', async () => {
    await withServer({}, async (api) => {
      const { data } = await api(asha, 'POST', '/bagore-ki-haveli/stamp', { lang: 'hi', answers: rightAnswers('bagore-ki-haveli', 'hi') });
      expect(data.score).toBe(3);
    });
  });

  test('scores a prepared telling against the quiz the reader saw', async () => {
    const db = await fakeDb();
    await db.prepare(taleDoc('gangaur-ghat', 'en', 'friends'));
    await withServer({ db }, async (api) => {
      const story = await api(asha, 'GET', '/gangaur-ghat?audience=friends');
      const answers = story.data.quiz.map((q: { answerIndex: number }) => q.answerIndex);
      expect(answers).toEqual([1, 2, 0]);
      const { data } = await api(asha, 'POST', '/gangaur-ghat/stamp', { lang: 'en', audience: 'friends', answers });
      expect(data.score).toBe(3);
    });
  });

  test('one phone reading to the squad stamps everyone who listened, and only people on the trip', async () => {
    await withServer({}, async (api, { db }) => {
      const { status, data } = await api(asha, 'POST', '/bagore-ki-haveli/stamp', {
        lang: 'hi', tripId: TRIP, answers: rightAnswers('bagore-ki-haveli', 'hi'), withUserIds: [ravi.id, meera.id, outsider.id, asha.id],
      });
      expect(status).toBe(200);
      expect(data.stampedWith).toBe(2);
      expect(!!await db.stamp('usr_2', 'bagore-ki-haveli')).toBe(true);
      expect(!!await db.stamp('usr_3', 'bagore-ki-haveli')).toBe(true);
      expect(!!await db.stamp('usr_9', 'bagore-ki-haveli')).toBe(false);
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
      expect(!!await db.stamp('usr_1', 'city-palace')).toBe(false);
      expect(!!await db.stamp('usr_9', 'city-palace')).toBe(true);
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
    const db = await fakeDb();
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

  test('with no database configured, bundled stories and their narration still work', async () => {
    const authenticate = async () => asha;
    const router = createStoriesApp({ db: undefined, storage: fakeStorage().storage, authenticate });
    const server = await serve(mount('/api/stories', router));
    const call = (method: string, path: string, body?: unknown) => server.request(`/api/stories${path}`, {
      method, headers: { authorization: 'Bearer asha', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    try {
      expect((await call('GET', '/city-palace')).status).toBe(200);
      expect((await call('GET', '/city-palace?audience=family')).status).toBe(200);
      const bagore = await (await call('GET', '/bagore-ki-haveli')).json();
      expect(bagore.narration.url).toBe('/stories/bagore-ki-haveli/en.m4a');
      const stamp = await call('POST', '/city-palace/stamp', { answers: rightAnswers('city-palace') });
      expect(stamp.status).toBe(503);
      expect((await stamp.json()).error.code).toBe('PASSPORT_UNAVAILABLE');
      expect((await call('GET', '/passport')).status).toBe(503);
    } finally {
      await server.close();
    }
  });
});

describe('serving recordings from the local media route', () => {
  test('audio gets its type and byte ranges, which iPhones need to play and seek', async () => {
    const storage = createMediaStorage('test-secret-'.repeat(4), {});
    const folder = `stories-test-${crypto.randomUUID()}`;
    const key = `${folder}/narration.wav`;
    const data = Buffer.from(Array.from({ length: 4000 }, (_, i) => i % 251));
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
