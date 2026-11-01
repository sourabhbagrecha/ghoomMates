import { describe, test } from 'node:test';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Router } from 'express';
import { expect } from '../expect.ts';
import { createServer } from '../../src/app.ts';
import { createArtworksApp } from '../../src/artworks/app.ts';
import { describeCast, parseCast } from '../../src/artworks/cast.ts';
import { sniffImageType } from '../../src/artworks/images.ts';
import type { ArtworkOptions, ArtworksDb } from '../../src/artworks/service.ts';
import { ARTWORK_STYLES, ARTWORK_STYLE_IDS, artworkPrompt, artworkStyle } from '../../src/artworks/styles.ts';
import type { User } from '../../src/auth/types.ts';
import { GeminiError, type Gemini, type ImageRequest } from '../../src/gemini.ts';
import { ApiError } from '../../src/http.ts';
import { createMediaStorage, type MediaStorage } from '../../src/storage.ts';
import { mount, serve } from '../helpers.ts';

const TRIP = '11111111-1111-4111-8111-111111111111';
const OTHER_TRIP = '22222222-2222-4222-8222-222222222222';
const PHOTO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_PHOTO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GIF_PHOTO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MISSING_PHOTO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const asha = { id: 'usr_1', username: 'asha', email: 'asha@test.local', name: 'Asha' } as User;
const ravi = { id: 'usr_2', username: 'ravi', email: 'ravi@test.local', name: 'Ravi' } as User;
const mira = { id: 'usr_3', username: 'mira', email: 'mira@test.local', name: 'Mira' } as User;

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF-photo-bytes')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('painted-bytes')]);
const GIF = Buffer.from('GIF89a-not-accepted-by-the-painter');

/* Pure pieces */

describe('image sniffing', () => {
  test('recognises the types the painter accepts from their first bytes', () => {
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')]))).toBe('image/webp');
    expect(sniffImageType(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(8)]))).toBe('image/heic');
    expect(sniffImageType(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypmif1'), Buffer.alloc(8)]))).toBe('image/heif');
  });

  test('rejects GIFs, documents and truncated files', () => {
    expect(sniffImageType(GIF)).toBe(null);
    expect(sniffImageType(Buffer.from('%PDF-1.7 and some more text'))).toBe(null);
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff]))).toBe(null);
    expect(sniffImageType(Buffer.alloc(0))).toBe(null);
  });
});

describe('styles and prompts', () => {
  test('there are four styles, each findable by id', () => {
    expect(ARTWORK_STYLE_IDS).toEqual(['mewar-miniature', 'royal-procession', 'jharokha-portrait', 'phad-scroll']);
    expect(ARTWORK_STYLES.map((s) => s.name)).toEqual(['Mewar miniature', 'Royal procession', 'Jharokha portrait', 'Phad scroll']);
    expect(artworkStyle('phad-scroll')?.name).toBe('Phad scroll');
    expect(artworkStyle('graffiti')).toBe(undefined);
    expect(artworkStyle(42)).toBe(undefined);
  });

  test('every prompt keeps the people, forbids text, deities and weapons, and asks for a border', () => {
    for (const style of ARTWORK_STYLES) {
      const prompt = artworkPrompt(style);
      expect(prompt.includes(style.name)).toBe(true);
      expect(prompt.includes('exactly the same number of people')).toBe(true);
      expect(prompt.includes('recognisable')).toBe(true);
      expect(prompt.includes('No text of any kind')).toBe(true);
      expect(prompt.includes('No gods, goddesses, idols')).toBe(true);
      expect(prompt.includes('No weapons')).toBe(true);
      expect(prompt.includes('modestly')).toBe(true);
      expect(prompt.includes(style.border)).toBe(true);
      expect(prompt.includes(style.scene)).toBe(true);
    }
  });

  test('the scenes themselves never mention weapons, deities or inscriptions', () => {
    const banned = /\b(sword|dagger|spear|arrow|bow|gun|shield|soldier|warrior|deity|god|goddess|krishna|shiva|ganesh|hanuman|pabuji|devnarayan|temple|inscription|caption|text)\b/i;
    for (const style of ARTWORK_STYLES) {
      expect(banned.test(`${style.scene} ${style.technique} ${style.border}`)).toBe(false);
    }
  });

  test('each style paints a Udaipur setting the squad can recognise', () => {
    expect(artworkStyle('mewar-miniature')?.scene.includes('Lake Pichola')).toBe(true);
    expect(artworkStyle('royal-procession')?.scene.includes('City Palace')).toBe(true);
    expect(artworkStyle('jharokha-portrait')?.scene.includes('jharokha')).toBe(true);
    expect(artworkStyle('phad-scroll')?.technique.includes('Shahpura and Bhilwara')).toBe(true);
  });

  test('a cast list pins down the head count and each person', () => {
    const cast = { people: 2, members: [{ place: 'left', look: 'adult man, bald' }, { place: 'right', look: 'adult woman, long curls' }] };
    const prompt = artworkPrompt(ARTWORK_STYLES[0], cast);
    expect(prompt.includes('exactly 2 people')).toBe(true);
    expect(prompt.includes('1. left: adult man, bald')).toBe(true);
    expect(prompt.includes('2. right: adult woman, long curls')).toBe(true);
    expect(prompt.includes('Paint exactly those 2')).toBe(true);
  });
});

describe('cast list', () => {
  test('parseCast keeps short plain lines in order and counts them', () => {
    const cast = parseCast({ people: 9, cast: [{ place: 'far left', look: 'adult man,\n bald' }, { place: '', look: 'child, curly hair' }, { place: 'x', look: '   ' }] });
    expect(cast).toEqual({ people: 2, members: [{ place: 'far left', look: 'adult man, bald' }, { place: '', look: 'child, curly hair' }] });
  });

  test('parseCast strips control characters, caps lengths and rejects junk', () => {
    const cast = parseCast({ cast: [{ place: 'p'.repeat(200), look: `ok\u0000‮${'y'.repeat(500)}` }] });
    expect(cast?.members[0].place.length).toBe(60);
    expect(cast?.members[0].look.length).toBe(200);
    expect(cast?.members[0].look.startsWith('ok')).toBe(true);
    expect(cast?.members[0].look.includes('\u0000')).toBe(false);
    expect(parseCast(null)).toBe(null);
    expect(parseCast({ cast: 'nope' })).toBe(null);
    expect(parseCast({ cast: [] })).toBe(null);
    expect(parseCast({ cast: Array.from({ length: 40 }, () => ({ place: 'a', look: 'b' })) })?.people).toBe(20);
  });

  test('describeCast is quiet when Gemini is off or fails', async () => {
    const image = { mimeType: 'image/jpeg', data: 'AAAA' };
    expect(await describeCast(fakeGemini({ enabled: false }), image)).toBe(null);
    expect(await describeCast(fakeGemini({ json: async () => { throw new GeminiError('Gemini 500: boom', 500); } }), image)).toBe(null);
    expect((await describeCast(fakeGemini(), image))?.people).toBe(2);
  });
});

describe('storage read', () => {
  test('local storage reads back what was put, and null for a missing object', async () => {
    const storage = createMediaStorage('test-secret-'.repeat(4), {});
    const folder = `read-test-${crypto.randomUUID()}`;
    try {
      await storage.put(`trips/${folder}/a.png`, PNG, 'image/png');
      expect((await storage.read(`trips/${folder}/a.png`))?.equals(PNG)).toBe(true);
      expect(await storage.read(`trips/${folder}/missing.png`)).toBe(null);
      let rejected = false;
      await storage.read('../outside.png').catch(() => { rejected = true; });
      expect(rejected).toBe(true);
    } finally {
      await rm(resolve(import.meta.dirname, '../../uploads/trips', folder), { recursive: true, force: true });
    }
  });
});

/* Routes, with a fake database, fake storage and fake Gemini */

type Row = { id: string; trip_id: string; photo_id: string | null; created_by: string; style: string; object_key: string; content_type: string; size_bytes: number; model: string; created_at: Date };

// Stands in for the handful of queries the module runs. Asha and Ravi are in TRIP; nobody is in OTHER_TRIP.
function fakeDb(options: { now?: () => number; rows?: Row[] } = {}) {
  const rows: Row[] = options.rows ?? [];
  const names: Record<string, string> = { usr_1: 'Asha', usr_2: 'Ravi' };
  let tick = 0;
  const photos = new Map([
    [PHOTO, { id: PHOTO, trip_id: TRIP, object_key: `trips/${TRIP}/photos/squad.jpg`, size_bytes: JPEG.length }],
    [GIF_PHOTO, { id: GIF_PHOTO, trip_id: TRIP, object_key: `trips/${TRIP}/photos/animated.gif`, size_bytes: GIF.length }],
    [MISSING_PHOTO, { id: MISSING_PHOTO, trip_id: TRIP, object_key: `trips/${TRIP}/photos/gone.jpg`, size_bytes: null }],
    [OTHER_PHOTO, { id: OTHER_PHOTO, trip_id: OTHER_TRIP, object_key: `trips/${OTHER_TRIP}/photos/other.jpg`, size_bytes: JPEG.length }],
  ]);
  const queries: string[] = [];
  const db: ArtworksDb = {
    pool: {
      query: async (sql, values = []) => {
        queries.push(sql.replace(/\s+/g, ' ').trim());
        if (sql.includes('FROM trip_members')) {
          const member = values[0] === TRIP && (values[1] === asha.id || values[1] === ravi.id);
          return { rowCount: member ? 1 : 0, rows: member ? [{}] : [] };
        }
        if (sql.includes('FROM trip_photos')) {
          const photo = photos.get(values[0] as string);
          const found = photo && photo.trip_id === values[1] ? [photo] : [];
          return { rowCount: found.length, rows: found };
        }
        if (sql.includes('count(*)')) {
          const since = (options.now?.() ?? Date.now()) - 24 * 60 * 60 * 1000;
          const n = rows.filter((r) => r.trip_id === values[0] && r.created_at.getTime() > since).length;
          return { rowCount: 1, rows: [{ n: String(n) }] };
        }
        if (sql.includes('INSERT INTO trip_artworks')) {
          const [id, trip_id, photo_id, created_by, style, object_key, content_type, size_bytes, model] = values as [string, string, string, string, string, string, string, number, string];
          const row = { id, trip_id, photo_id, created_by, style, object_key, content_type, size_bytes, model, created_at: new Date((options.now?.() ?? Date.now()) + ++tick * 1000) };
          rows.push(row);
          return { rowCount: 1, rows: [{ created_at: row.created_at }] };
        }
        if (sql.includes('FROM trip_artworks a')) {
          const mine = rows.filter((r) => r.trip_id === values[0]).sort((a, b) => b.created_at.getTime() - a.created_at.getTime()).slice(0, values[1] as number);
          return { rowCount: mine.length, rows: mine.map((r) => ({ ...r, creator: names[r.created_by] ?? null })) };
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
    },
  };
  return { db, rows, queries };
}

function fakeStorage() {
  const objects = new Map<string, { data: Buffer; contentType: string }>();
  const reads: string[] = [];
  objects.set(`trips/${TRIP}/photos/squad.jpg`, { data: JPEG, contentType: 'image/jpeg' });
  objects.set(`trips/${TRIP}/photos/animated.gif`, { data: GIF, contentType: 'image/gif' });
  let urls = 0;
  const storage: MediaStorage = {
    kind: 'local',
    description: 'fake',
    createUpload: async () => { throw new Error('unused'); },
    readUrl: async (key) => `https://media.test/${key}?fresh=${++urls}`,
    size: async (key) => objects.get(key)?.data.length ?? null,
    put: async (key, data, contentType) => { objects.set(key, { data, contentType }); },
    read: async (key) => { reads.push(key); return objects.get(key)?.data ?? null; },
  };
  return { storage, objects, reads };
}

const TWO = [{ place: 'left', look: 'adult woman, long black hair' }, { place: 'right', look: 'adult man, beard and glasses' }];
const THREE = [...TWO, { place: 'centre', look: 'adult man, bald' }];

// Answers the two kinds of look at a picture: the cast list of a photo and the head count of a painting
function castAndCounts(cast = TWO, counts: number[] = [], calls: { cast: number; count: number } = { cast: 0, count: 0 }): Gemini['json'] {
  return (async (request: { schema: { properties: Record<string, unknown> } }) => {
    if ('cast' in request.schema.properties) {
      calls.cast++;
      return { people: cast.length, cast };
    }
    calls.count++;
    return { people: counts.shift() ?? cast.length };
  }) as Gemini['json'];
}

function fakeGemini(overrides: Partial<Gemini> = {}, requests: ImageRequest[] = []): Gemini {
  return {
    enabled: true,
    imageEnabled: true,
    models: { lite: 'fake-lite', smart: 'fake-smart', image: 'fake-image', tts: 'fake-tts' },
    json: castAndCounts(),
    image: async (request) => {
      requests.push(request);
      return { mimeType: 'image/png', data: PNG, text: 'Here is your painting' };
    },
    speech: async () => { throw new Error('unused'); },
    ...overrides,
  } as Gemini;
}

type Harness = Awaited<ReturnType<typeof harness>>;

async function harness(setup: { gemini?: Partial<Gemini>; options?: ArtworkOptions; env?: Record<string, string | undefined>; now?: () => number; rows?: Row[] } = {}) {
  const database = fakeDb({ now: setup.now, rows: setup.rows });
  const { storage, objects, reads } = fakeStorage();
  const requests: ImageRequest[] = [];
  const gemini = fakeGemini(setup.gemini, requests);
  const authenticate = async (token: string) => {
    const user = [asha, ravi, mira].find((u) => u.username === token);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Bad token');
    return user;
  };
  const app = createArtworksApp({ db: database.db, storage, gemini, authenticate, env: setup.env ?? {}, retryDelaysMs: [0], ...setup.options });
  const server = await serve(mount('/api/artworks', app));
  const call = (user: User | null, method: string, path: string, body?: unknown) => server.request(`/api/artworks${path}`, {
    method,
    headers: { ...(user ? { authorization: `Bearer ${user.username}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const paint = (user: User, body: unknown = { photoId: PHOTO, style: 'mewar-miniature' }, trip = TRIP) => call(user, 'POST', `/trips/${trip}`, body);
  return { ...database, objects, reads, requests, call, paint, close: server.close };
}

async function withHarness(setup: Parameters<typeof harness>[0], run: (h: Harness) => Promise<void>) {
  const h = await harness(setup);
  try {
    await run(h);
  } finally {
    await h.close();
  }
}

const errorCode = async (res: Response) => (await res.json()).error.code as string;

describe('access', () => {
  test('needs a bearer token', async () => {
    await withHarness({}, async (h) => {
      const res = await h.call(null, 'GET', `/trips/${TRIP}`);
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe('UNAUTHORIZED');
    });
  });

  test('non-members get 404, so trip ids do not leak', async () => {
    await withHarness({}, async (h) => {
      expect((await h.call(mira, 'GET', `/trips/${TRIP}`)).status).toBe(404);
      expect((await h.paint(mira)).status).toBe(404);
      expect((await h.call(asha, 'GET', `/trips/${OTHER_TRIP}`)).status).toBe(404);
      expect((await h.call(asha, 'GET', '/trips/not-a-uuid')).status).toBe(404);
      expect(h.requests).toHaveLength(0);
    });
  });

  test('unknown routes are a 404 in the usual envelope', async () => {
    await withHarness({}, async (h) => {
      const res = await h.call(asha, 'GET', '/nope');
      expect(res.status).toBe(404);
      expect(await errorCode(res)).toBe('NOT_FOUND');
    });
  });

  test('without a database the module answers 503', async () => {
    const stub = Router().use((_req, res) => { res.json({ handledBy: 'auth' }); });
    const server = await serve(createServer({ auth: stub }));
    try {
      const res = await server.request(`/api/artworks/trips/${TRIP}`);
      expect(res.status).toBe(503);
      expect(await errorCode(res)).toBe('SERVICE_UNAVAILABLE');
    } finally {
      await server.close();
    }
  });
});

describe('painting a photo', () => {
  test('paints the photo, stores the result under the trip and returns the artwork', async () => {
    await withHarness({}, async (h) => {
      const res = await h.paint(asha);
      expect(res.status).toBe(201);
      const artwork = await res.json();
      expect(Object.keys(artwork).sort()).toEqual(['createdAt', 'createdBy', 'id', 'limit', 'photoId', 'style', 'styleName', 'url']);
      expect(artwork.style).toBe('mewar-miniature');
      expect(artwork.styleName).toBe('Mewar miniature');
      expect(artwork.photoId).toBe(PHOTO);
      expect(artwork.createdBy).toEqual({ userId: 'usr_1', name: 'Asha' });
      expect(Number.isNaN(Date.parse(artwork.createdAt))).toBe(false);
      expect(artwork.limit).toEqual({ perDay: 10, used: 1, remaining: 9 });

      const key = `trips/${TRIP}/artworks/${artwork.id}.png`;
      expect(artwork.url.startsWith(`https://media.test/${key}`)).toBe(true);
      expect(h.objects.get(key)?.data.equals(PNG)).toBe(true);
      expect(h.objects.get(key)?.contentType).toBe('image/png');
      expect(h.rows).toHaveLength(1);
      expect(h.rows[0].object_key).toBe(key);
      expect(h.rows[0].created_by).toBe('usr_1');
      expect(h.rows[0].model).toBe('fake-image');
    });
  });

  test('the photo goes to the image model as the reference, with the style prompt and the cast list', async () => {
    await withHarness({}, async (h) => {
      expect((await h.paint(ravi, { photoId: PHOTO, style: 'jharokha-portrait' })).status).toBe(201);
      expect(h.requests).toHaveLength(1);
      const request = h.requests[0];
      expect(request.images).toEqual([{ mimeType: 'image/jpeg', data: JPEG.toString('base64') }]);
      expect(request.aspectRatio).toBe('4:3');
      expect(request.timeoutMs !== undefined && request.timeoutMs <= 90_000).toBe(true);
      expect(request.prompt.includes('Jharokha portrait')).toBe(true);
      expect(request.prompt.includes('exactly 2 people')).toBe(true);
      expect(request.prompt.includes('adult man, beard and glasses')).toBe(true);
      expect(request.prompt.includes('No weapons')).toBe(true);
    });
  });

  test('every style paints', async () => {
    await withHarness({ options: { dailyLimit: 20 } }, async (h) => {
      for (const id of ARTWORK_STYLE_IDS) {
        const res = await h.paint(asha, { photoId: PHOTO, style: id });
        expect(res.status).toBe(201);
        expect((await res.json()).style).toBe(id);
      }
      expect(h.requests.map((r) => r.prompt.match(/"([^"]+)" artwork/)?.[1])).toEqual(['Mewar miniature', 'Royal procession', 'Jharokha portrait', 'Phad scroll']);
    });
  });

  test('still paints, with a general instruction, when the cast list cannot be made', async () => {
    await withHarness({ gemini: { json: async () => { throw new GeminiError('Gemini timed out after 20000ms'); } } }, async (h) => {
      expect((await h.paint(asha)).status).toBe(201);
      expect(h.requests[0].prompt.includes('Paint every person in the photograph')).toBe(true);
      expect(h.requests[0].prompt.includes('exactly 2 people')).toBe(false);
    });
  });

  test('a group painting with the wrong head count is painted once more, keeping the better one', async () => {
    const calls = { cast: 0, count: 0 };
    let painted = 0;
    await withHarness({
      gemini: {
        json: castAndCounts(THREE, [2, 3], calls),
        image: async () => ({ mimeType: 'image/png', data: Buffer.concat([PNG, Buffer.from(`painting-${++painted}`)]), text: '' }),
      },
    }, async (h) => {
      const res = await h.paint(asha);
      expect(res.status).toBe(201);
      expect(painted).toBe(2);
      expect(calls.count).toBe(2);
      const artwork = await res.json();
      expect(h.objects.get(`trips/${TRIP}/artworks/${artwork.id}.png`)?.data.toString('latin1').endsWith('painting-2')).toBe(true);
    });
  });

  test('the first painting stays when the second is no closer to the right head count', async () => {
    let painted = 0;
    await withHarness({
      gemini: {
        json: castAndCounts(THREE, [2, 1]),
        image: async () => ({ mimeType: 'image/png', data: Buffer.concat([PNG, Buffer.from(`painting-${++painted}`)]), text: '' }),
      },
    }, async (h) => {
      const artwork = await (await h.paint(asha)).json();
      expect(painted).toBe(2);
      expect(h.objects.get(`trips/${TRIP}/artworks/${artwork.id}.png`)?.data.toString('latin1').endsWith('painting-1')).toBe(true);
    });
  });

  test('a right head count, a small group, a busy scene or a count that fails mean one painting', async () => {
    const painter = (counter: { n: number }) => async () => { counter.n++; return { mimeType: 'image/png', data: PNG, text: '' }; };
    const right = { n: 0 };
    await withHarness({ gemini: { json: castAndCounts(THREE, [3]), image: painter(right) } }, async (h) => {
      expect((await h.paint(asha)).status).toBe(201);
    });
    expect(right.n).toBe(1);

    const small = { n: 0 };
    await withHarness({ gemini: { json: castAndCounts(TWO, [1]), image: painter(small) } }, async (h) => {
      expect((await h.paint(asha)).status).toBe(201);
    });
    expect(small.n).toBe(1);

    const busy = { n: 0 };
    await withHarness({ gemini: { json: castAndCounts(THREE, [1]), image: painter(busy) } }, async (h) => {
      expect((await h.paint(asha, { photoId: PHOTO, style: 'royal-procession' })).status).toBe(201);
      expect((await h.paint(asha, { photoId: PHOTO, style: 'phad-scroll' })).status).toBe(201);
    });
    expect(busy.n).toBe(2);

    const failing = { n: 0 };
    const json = castAndCounts(THREE);
    await withHarness({
      gemini: { json: (async (request: { schema: { properties: Record<string, unknown> } }) => { if ('cast' in request.schema.properties) return json(request as never); throw new GeminiError('Gemini timed out'); }) as Gemini['json'], image: painter(failing) },
    }, async (h) => {
      expect((await h.paint(asha)).status).toBe(201);
    });
    expect(failing.n).toBe(1);
  });

  test('the cast list of a photo is remembered, so a second style does not look at the photo again', async () => {
    const calls = { cast: 0, count: 0 };
    await withHarness({ gemini: { json: castAndCounts(TWO, [], calls) } }, async (h) => {
      expect((await h.paint(asha, { photoId: PHOTO, style: 'mewar-miniature' })).status).toBe(201);
      expect((await h.paint(ravi, { photoId: PHOTO, style: 'phad-scroll' })).status).toBe(201);
      expect(calls.cast).toBe(1);
      expect(h.requests[1].prompt.includes('exactly 2 people')).toBe(true);
    });
  });

  test('rejects an unknown style or a malformed photo id', async () => {
    await withHarness({}, async (h) => {
      const style = await h.paint(asha, { photoId: PHOTO, style: 'graffiti' });
      expect(style.status).toBe(400);
      const body = await style.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message.includes('mewar-miniature')).toBe(true);
      expect((await h.paint(asha, { photoId: PHOTO })).status).toBe(400);
      expect((await h.paint(asha, { style: 'mewar-miniature' })).status).toBe(400);
      expect((await h.paint(asha, { photoId: 'not-a-uuid', style: 'mewar-miniature' })).status).toBe(400);
      expect((await h.paint(asha, { photoId: 7, style: 'mewar-miniature' })).status).toBe(400);
      expect((await h.paint(asha, ['mewar-miniature'])).status).toBe(400);
      expect(h.requests).toHaveLength(0);
    });
  });

  test('a photo from another trip, or one that is gone, is a 404 and nothing is painted', async () => {
    await withHarness({}, async (h) => {
      const other = await h.paint(asha, { photoId: OTHER_PHOTO, style: 'mewar-miniature' });
      expect(other.status).toBe(404);
      expect(await errorCode(other)).toBe('PHOTO_NOT_FOUND');
      const unknown = await h.paint(asha, { photoId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', style: 'mewar-miniature' });
      expect(await errorCode(unknown)).toBe('PHOTO_NOT_FOUND');
      const gone = await h.paint(asha, { photoId: MISSING_PHOTO, style: 'mewar-miniature' });
      expect(gone.status).toBe(404);
      expect(h.requests).toHaveLength(0);
      expect(h.rows).toHaveLength(0);
    });
  });

  test('only JPEG, PNG, WebP and HEIC photos are accepted, judged by the bytes', async () => {
    await withHarness({}, async (h) => {
      const res = await h.paint(asha, { photoId: GIF_PHOTO, style: 'mewar-miniature' });
      expect(res.status).toBe(415);
      expect(await errorCode(res)).toBe('UNSUPPORTED_PHOTO');
      expect(h.requests).toHaveLength(0);
    });
  });

  test('photos over the size cap are refused before they are downloaded', async () => {
    await withHarness({ options: { maxPhotoBytes: 10 } }, async (h) => {
      const res = await h.paint(asha);
      expect(res.status).toBe(413);
      expect(await errorCode(res)).toBe('PHOTO_TOO_LARGE');
      expect(h.reads).toHaveLength(0);
      expect(h.requests).toHaveLength(0);
    });
  });
});

describe('daily limit', () => {
  test('a trip can paint ten a day by default, then the painters rest', async () => {
    await withHarness({}, async (h) => {
      for (let i = 0; i < 10; i++) expect((await h.paint(i % 2 ? ravi : asha)).status).toBe(201);
      const res = await h.paint(asha);
      expect(res.status).toBe(429);
      expect(await errorCode(res)).toBe('ARTWORK_LIMIT');
      expect(h.requests).toHaveLength(10);
      expect((await (await h.call(asha, 'GET', `/trips/${TRIP}`)).json()).limit).toEqual({ perDay: 10, used: 10, remaining: 0 });
    });
  });

  test('the limit can be changed with ARTWORKS_PER_TRIP_PER_DAY, and bad values fall back to ten', async () => {
    await withHarness({ env: { ARTWORKS_PER_TRIP_PER_DAY: '2' } }, async (h) => {
      expect((await h.paint(asha)).status).toBe(201);
      expect((await h.paint(asha)).status).toBe(201);
      expect((await h.paint(asha)).status).toBe(429);
    });
    await withHarness({ env: { ARTWORKS_PER_TRIP_PER_DAY: 'lots' } }, async (h) => {
      expect((await (await h.call(asha, 'GET', `/trips/${TRIP}`)).json()).limit.perDay).toBe(10);
    });
  });

  test('paintings older than a day no longer count', async () => {
    const now = Date.now();
    const old = (n: number): Row => ({ id: `old-${n}`, trip_id: TRIP, photo_id: PHOTO, created_by: 'usr_1', style: 'mewar-miniature', object_key: `trips/${TRIP}/artworks/old-${n}.png`, content_type: 'image/png', size_bytes: 1, model: 'x', created_at: new Date(now - 25 * 60 * 60 * 1000 - n) });
    await withHarness({ options: { dailyLimit: 2 }, rows: [old(1), old(2), old(3)] }, async (h) => {
      expect((await h.paint(asha)).status).toBe(201);
      expect((await h.paint(asha)).status).toBe(201);
      expect((await h.paint(asha)).status).toBe(429);
    });
  });

  test('requests that arrive together cannot slip past the limit', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await withHarness({
      options: { dailyLimit: 1 },
      gemini: { image: async () => { await gate; return { mimeType: 'image/png', data: PNG, text: '' }; } },
    }, async (h) => {
      const first = h.paint(asha);
      const second = h.paint(ravi);
      await new Promise((resolve) => setTimeout(resolve, 50));
      release();
      const statuses = [(await first).status, (await second).status].sort();
      expect(statuses).toEqual([201, 429]);
      expect(h.rows).toHaveLength(1);
    });
  });
});

describe('when painting is unavailable the app can fall back to a framed photo', () => {
  test('image generation switched off: 503 ARTWORK_UNAVAILABLE and nothing is read, painted or saved', async () => {
    await withHarness({ gemini: { imageEnabled: false } }, async (h) => {
      const res = await h.paint(asha);
      expect(res.status).toBe(503);
      expect(await errorCode(res)).toBe('ARTWORK_UNAVAILABLE');
      expect(h.requests).toHaveLength(0);
      expect(h.rows).toHaveLength(0);
      expect(h.queries.some((q) => q.includes('FROM trip_photos'))).toBe(false);
      // The gallery still opens
      expect((await h.call(asha, 'GET', `/trips/${TRIP}`)).status).toBe(200);
    });
  });

  test('a failed painting is a 502 ARTWORK_FAILED, stores nothing and does not use up the day', async () => {
    let fail = true;
    await withHarness({
      options: { dailyLimit: 1 },
      gemini: { image: async () => { if (fail) throw new GeminiError('Gemini 500: boom', 500); return { mimeType: 'image/png', data: PNG, text: '' }; } },
    }, async (h) => {
      const res = await h.paint(asha);
      expect(res.status).toBe(502);
      expect(await errorCode(res)).toBe('ARTWORK_FAILED');
      expect(h.rows).toHaveLength(0);
      expect([...h.objects.keys()].some((key) => key.includes('/artworks/'))).toBe(false);
      fail = false;
      expect((await h.paint(asha)).status).toBe(201);
    });
  });

  test('a safety block is a 422 ARTWORK_BLOCKED so the app can suggest another photo', async () => {
    await withHarness({ gemini: { image: async () => { throw new GeminiError('Gemini returned nothing (IMAGE_SAFETY)'); } } }, async (h) => {
      const res = await h.paint(asha);
      expect(res.status).toBe(422);
      expect(await errorCode(res)).toBe('ARTWORK_BLOCKED');
    });
  });

  test('quota errors are retried once, then reported as 503 ARTWORK_UNAVAILABLE', async () => {
    let calls = 0;
    await withHarness({
      gemini: { image: async () => { calls++; if (calls === 1) throw new GeminiError('Gemini 429: exhausted', 429); return { mimeType: 'image/png', data: PNG, text: '' }; } },
    }, async (h) => {
      expect((await h.paint(asha)).status).toBe(201);
      expect(calls).toBe(2);
    });
    calls = 0;
    await withHarness({ gemini: { image: async () => { calls++; throw new GeminiError('Gemini 429: exhausted', 429); } } }, async (h) => {
      const res = await h.paint(asha);
      expect(res.status).toBe(503);
      expect(await errorCode(res)).toBe('ARTWORK_UNAVAILABLE');
      expect(calls).toBe(2);
      expect(h.rows).toHaveLength(0);
    });
  });

  test('an answer in words only (no picture) is retried straight away, and reported if it keeps happening', async () => {
    let calls = 0;
    await withHarness({
      gemini: { image: async () => { calls++; if (calls === 1) throw new GeminiError('Gemini returned no image'); return { mimeType: 'image/png', data: PNG, text: '' }; } },
    }, async (h) => {
      expect((await h.paint(asha)).status).toBe(201);
      expect(calls).toBe(2);
    });
    calls = 0;
    await withHarness({ gemini: { image: async () => { calls++; throw new GeminiError('Gemini returned no image'); } } }, async (h) => {
      const res = await h.paint(asha);
      expect(res.status).toBe(502);
      expect(await errorCode(res)).toBe('ARTWORK_FAILED');
      expect(calls).toBe(2);
    });
  });

  test('credential or permission problems are also ARTWORK_UNAVAILABLE', async () => {
    await withHarness({ gemini: { image: async () => { throw new GeminiError('Gemini 403: permission denied', 403); } } }, async (h) => {
      expect(await errorCode(await h.paint(asha))).toBe('ARTWORK_UNAVAILABLE');
    });
    await withHarness({ gemini: { image: async () => { throw new GeminiError('No Google credentials for Vertex AI (run gcloud auth application-default login)'); } } }, async (h) => {
      expect(await errorCode(await h.paint(asha))).toBe('ARTWORK_UNAVAILABLE');
    });
  });

  test('a painter that takes too long is cut off with 504 ARTWORK_TIMEOUT', async () => {
    await withHarness({
      options: { timeoutMs: 120 },
      gemini: { image: () => new Promise(() => {}) },
    }, async (h) => {
      const started = Date.now();
      const res = await h.paint(asha);
      expect(res.status).toBe(504);
      expect(await errorCode(res)).toBe('ARTWORK_TIMEOUT');
      expect(Date.now() - started < 2_000).toBe(true);
      expect(h.rows).toHaveLength(0);
    });
  });

  test('a timeout reported by the Gemini client is the same 504', async () => {
    await withHarness({ gemini: { image: async () => { throw new GeminiError('Gemini timed out after 90000ms'); } } }, async (h) => {
      expect((await h.paint(asha)).status).toBe(504);
    });
  });

  test('an answer that is not a picture is a 502 and is never stored', async () => {
    await withHarness({ gemini: { image: async () => ({ mimeType: 'image/png', data: Buffer.from('definitely not an image'), text: '' }) } }, async (h) => {
      const res = await h.paint(asha);
      expect(res.status).toBe(502);
      expect(await errorCode(res)).toBe('ARTWORK_FAILED');
      expect(h.rows).toHaveLength(0);
    });
  });
});

describe('the squad gallery', () => {
  test('lists the squad\'s paintings newest first with fresh read URLs, visible to every member', async () => {
    await withHarness({}, async (h) => {
      const first = await (await h.paint(asha, { photoId: PHOTO, style: 'mewar-miniature' })).json();
      const second = await (await h.paint(ravi, { photoId: PHOTO, style: 'phad-scroll' })).json();

      const gallery = await (await h.call(ravi, 'GET', `/trips/${TRIP}`)).json();
      expect(gallery.items.map((i: { id: string }) => i.id)).toEqual([second.id, first.id]);
      expect(gallery.items[0]).toEqual({
        id: second.id,
        style: 'phad-scroll',
        styleName: 'Phad scroll',
        url: gallery.items[0].url,
        createdAt: second.createdAt,
        photoId: PHOTO,
        createdBy: { userId: 'usr_2', name: 'Ravi' },
      });
      expect(gallery.items[1].createdBy.name).toBe('Asha');
      expect(gallery.limit).toEqual({ perDay: 10, used: 2, remaining: 8 });

      const again = await (await h.call(asha, 'GET', `/trips/${TRIP}`)).json();
      expect(again.items[0].url === gallery.items[0].url).toBe(false);
      expect(again.items[0].url.startsWith(`https://media.test/trips/${TRIP}/artworks/${second.id}.png`)).toBe(true);
    });
  });

  test('an empty gallery is an empty list, not an error', async () => {
    await withHarness({}, async (h) => {
      const res = await h.call(asha, 'GET', `/trips/${TRIP}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ items: [], limit: { perDay: 10, used: 0, remaining: 10 } });
    });
  });
});
