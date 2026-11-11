import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import type { User } from '../../src/auth/types.ts';
import { ClaudeError, type Claude, type ClaudeJsonRequest } from '../../src/claude.ts';
import { GeminiError, type Gemini, type JsonRequest } from '../../src/gemini.ts';
import { ApiError } from '../../src/http.ts';
import { CLAUDE_REEL_SCHEMA, REEL_SCHEMA, normalizePlan, spread, styleFromPrompt, templatePlan, upgradeScene, type ReelCandidate } from '../../src/reels/plan.ts';
import { tripFacts } from '../../src/reels/service.ts';
import { createReelsApp } from '../../src/reels/app.ts';
import { sniffImageType } from '../../src/reels/images.ts';
import type { MediaStorage } from '../../src/storage.ts';
import { mount, serve } from '../helpers.ts';
import { testDatabase } from '../mongo.ts';

const TRIP = '11111111-1111-4111-8111-111111111111';
const photoId = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF-photo-bytes')]);

const asha = { id: 'usr_1', username: 'asha', email: 'asha@test.local', name: 'Asha' } as User;
const ravi = { id: 'usr_2', username: 'ravi', email: 'ravi@test.local', name: 'Ravi' } as User;

const candidates = (count: number): ReelCandidate[] =>
  Array.from({ length: count }, (_, i) => ({ id: photoId(i + 1), uploader: 'Asha', caption: null, takenOn: '3 Nov' }));

describe('image sniffing', () => {
  test('recognises the types Gemini accepts from their first bytes', () => {
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('png-bytes')]))).toBe('image/png');
    expect(sniffImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')]))).toBe('image/webp');
    expect(sniffImageType(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(8)]))).toBe('image/heic');
    expect(sniffImageType(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypmif1'), Buffer.alloc(8)]))).toBe('image/heif');
  });

  test('rejects GIFs, documents and truncated files', () => {
    expect(sniffImageType(Buffer.from('GIF89a-not-accepted'))).toBe(null);
    expect(sniffImageType(Buffer.from('%PDF-1.7 and some more text'))).toBe(null);
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff]))).toBe(null);
    expect(sniffImageType(Buffer.alloc(0))).toBe(null);
  });
});

describe('reel plans', () => {
  test('keeps known photos once each, in Gemini’s order, with lengths and names in range', () => {
    const plan = normalizePlan({
      title: '  “Goa, unfiltered”  ',
      tagline: 'Same squad, next trip',
      style: 'energetic',
      scenes: [
        { photo: 3, caption: 'Sunset at Vagator', seconds: 9, motion: 'zoom-out', transition: 'slide' },
        { photo: 3, caption: 'again', seconds: 2, motion: 'zoom-in', transition: 'fade' },
        { photo: 42, caption: 'not a photo', seconds: 2, motion: 'zoom-in', transition: 'fade' },
        { photo: 1, caption: '', seconds: 0.2, motion: 'spin', transition: 'explode' },
        { photo: 2, caption: 'Night market', seconds: 2, motion: 'pan-left', transition: 'cut' },
      ],
    }, candidates(4), 'Goa reel');
    expect(plan?.title).toBe('Goa, unfiltered');
    expect(plan?.style).toBe('energetic');
    expect(plan?.scenes.map((s) => s.photoIds)).toEqual([[photoId(3)], [photoId(1)], [photoId(2)]]);
    expect(plan?.scenes.every((s) => s.kind === 'photo' && s.effect === 'none' && s.stickers.length === 0)).toBe(true);
    expect(plan?.scenes.map((s) => s.seconds)).toEqual([5, 1, 2]);
    expect(plan?.scenes[1].motion).toBe('zoom-in');
    expect(plan?.scenes[1].transition).toBe('fade');
  });

  test('gives up when too few usable scenes are left, and fills in a missing title and style', () => {
    expect(normalizePlan({ scenes: [{ photo: 1, seconds: 2 }] }, candidates(5), 'x')).toBe(null);
    expect(normalizePlan('nonsense', candidates(5), 'x')).toBe(null);
    const plan = normalizePlan({ style: 'vaporwave', scenes: [1, 2, 3].map((photo) => ({ photo, seconds: 2 })) }, candidates(5), 'Goa reel');
    expect(plan?.title).toBe('Goa reel');
    expect(plan?.style).toBe('cinematic');
  });

  test('stops adding scenes once the reel is long enough', () => {
    const scenes = Array.from({ length: 30 }, (_, i) => ({ photo: i + 1, seconds: 5 }));
    const plan = normalizePlan({ scenes }, candidates(30), 'x');
    expect(plan?.scenes.length).toBe(11);
  });

  test('maps, collages, stats, text cards, stickers and effects are kept only when they make sense', () => {
    const facts = [{ value: 6, label: 'mates' }, { value: 4, label: 'days' }];
    const raw = {
      title: 'Udaipur', tagline: 'Again', style: 'playful',
      scenes: [
        { kind: 'map', photos: [], caption: 'Udaipur', seconds: 1, places: [
          { name: 'City Palace', lat: 24.5764, lng: 73.6835 },
          { name: 'Lake Pichola', lat: 24.572, lng: 73.679 },
          { name: 'Somewhere wrong', lat: 51.5, lng: -0.12 },
          { name: '', lat: 1, lng: 1 },
        ] },
        { kind: 'map', photos: [], caption: 'again', seconds: 3, places: [{ name: 'Jag Mandir', lat: 24.567, lng: 73.68 }] },
        { kind: 'collage', photos: [1, 2, 2, 99], caption: 'Squad', seconds: 3, layout: 'stack', effect: 'confetti', stickers: ['🌅', 'hello', '😂', '✨', '🎉'] },
        { kind: 'collage', photos: [3], caption: 'one photo', seconds: 2 },
        { kind: 'photo', photos: [1], caption: 'Lake', seconds: 2, transition: 'clock-wipe', effect: 'disco' },
        { kind: 'text', photos: [], caption: '', seconds: 2 },
        { kind: 'text', photos: [], caption: 'Day 2', seconds: 2, transition: 'iris' },
        { kind: 'stats', photos: [], caption: 'By the numbers', seconds: 3 },
        { kind: 'stats', photos: [], caption: 'again', seconds: 3 },
      ],
    };
    const plan = normalizePlan(raw, candidates(4), 'x', facts)!;
    expect(plan.scenes.map((s) => s.kind)).toEqual(['map', 'collage', 'photo', 'photo', 'text', 'stats']);
    const [map, collage, single, again, text] = plan.scenes;
    expect(map.places?.map((p) => p.name)).toEqual(['City Palace', 'Lake Pichola']);
    expect(map.seconds).toBe(2.5);
    expect(collage.photoIds).toEqual([photoId(1), photoId(2)]);
    expect(collage.layout).toBe('stack');
    expect(collage.stickers).toEqual(['🌅', '😂', '✨']);
    expect(collage.effect).toBe('confetti');
    expect(single.photoIds).toEqual([photoId(3)]);
    expect(again.photoIds).toEqual([photoId(1)]);
    expect(again.transition).toBe('clock-wipe');
    expect(again.effect).toBe('none');
    expect(text.caption).toBe('Day 2');
    expect(plan.facts).toEqual(facts);
    // No facts, no stats scene
    expect(normalizePlan(raw, candidates(4), 'x')!.scenes.some((s) => s.kind === 'stats')).toBe(false);
  });

  test('both models get the same schema, in each one’s dialect', () => {
    const gemini = REEL_SCHEMA as any;
    expect(gemini.type).toBe('OBJECT');
    expect(gemini.properties.scenes.items.properties.places.items.properties.lat.type).toBe('NUMBER');
    expect(JSON.stringify(gemini).includes('additionalProperties')).toBe(false);
    expect(CLAUDE_REEL_SCHEMA.properties.scenes.items.required.length).toBe(Object.keys(CLAUDE_REEL_SCHEMA.properties.scenes.items.properties).length);
  });

  test('reels saved before scene kinds still play, and trip facts count only what is there', () => {
    expect(upgradeScene({ photoId: photoId(1), caption: 'Hi', seconds: 2, motion: 'pan-up', transition: 'wipe' } as any)).toEqual({
      kind: 'photo', photoIds: [photoId(1)], caption: 'Hi', seconds: 2, motion: 'pan-up', transition: 'wipe', stickers: [], effect: 'none',
    });
    expect(tripFacts({ start_date: '2026-11-20', end_date: '2026-11-23', mates: '6', photos: '24' })).toEqual([
      { value: 6, label: 'mates' }, { value: 4, label: 'days' }, { value: 24, label: 'photos' },
    ]);
    expect(tripFacts({ start_date: null, end_date: null, mates: '1', photos: '3' })).toEqual([]);
    expect(tripFacts(undefined)).toEqual([]);
  });

  test('the template cut reads the look from the prompt and spreads photos over the trip', () => {
    expect(styleFromPrompt('fast hype edit with a bollywood beat')).toBe('energetic');
    expect(styleFromPrompt('chill sunset vibes')).toBe('dreamy');
    expect(styleFromPrompt('vintage film look')).toBe('retro');
    expect(styleFromPrompt('our goofy candid moments')).toBe('playful');
    expect(styleFromPrompt('the trip')).toBe('cinematic');
    expect(spread([1, 2, 3, 4, 5, 6, 7, 8, 9], 3)).toEqual([1, 5, 9]);
    const plan = templatePlan('chill sunset vibes', candidates(40), 'Goa Trip');
    expect(plan.style).toBe('dreamy');
    const photos = plan.scenes.filter((s) => s.kind === 'photo');
    expect(photos.length).toBe(10);
    expect(photos[0].photoIds).toEqual([photoId(1)]);
    expect(photos[9].photoIds).toEqual([photoId(40)]);
    expect(plan.scenes.filter((s) => s.kind === 'collage').length).toBe(1);
    expect(plan.scenes[0].effect).toBe('light-leak');
    expect(plan.scenes.some((s) => s.kind === 'stats')).toBe(false);
    const withFacts = templatePlan('our trip', candidates(4), 'Goa Trip', [{ value: 5, label: 'mates' }, { value: 3, label: 'days' }]);
    expect(withFacts.scenes.at(-1)?.kind).toBe('stats');
    expect(withFacts.facts?.length).toBe(2);
    expect(withFacts.scenes.some((s) => s.kind === 'collage')).toBe(false);
  });
});

/* Routes, with a real test database and fake storage and Gemini */

async function fakes(gemini: Partial<Gemini> & { enabled: boolean }, photoCount = 6, claude?: Claude, carto?: { apiKey: string; fetchImpl: typeof fetch }) {
  const database = await testDatabase();
  const { db } = database;
  await db.collection<any>('users').insertMany([asha, ravi].map(({ id, ...u }) => ({ _id: id, google_id: `g-${id}`, ...u })));
  await db.collection<any>('trips').insertOne({ _id: TRIP, name: 'Goa Trip', destination: 'Goa', start_date: null, end_date: null });
  await db.collection('trip_members').insertOne({ trip_id: TRIP, user_id: asha.id, role: 'organiser' });
  if (photoCount) {
    await db.collection<any>('trip_photos').insertMany(Array.from({ length: photoCount }, (_, i) => ({
      _id: photoId(i + 1), trip_id: TRIP, uploaded_by: asha.id, object_key: `key-${photoId(i + 1)}`, content_type: 'image/jpeg', size_bytes: JPEG.length, caption: '', created_at: new Date('2026-11-03'),
    })));
  }
  const reels = () => db.collection('trip_reels').find().sort({ created_at: -1 }).toArray();
  const storage = { read: async () => JPEG, readUrl: async (key: string) => `https://media.test/${key}` } as unknown as MediaStorage;
  const authenticate = async (token: string) => {
    if (token === 'asha') return asha;
    if (token === 'ravi') return ravi;
    throw new ApiError(401, 'UNAUTHORIZED', 'Bad token');
  };
  const fullGemini = { models: { lite: 'lite', smart: 'smart', image: 'image', tts: 'tts' }, imageEnabled: false, ...gemini } as Gemini;
  return { app: mount('/api/reels', createReelsApp({ db: database, storage, gemini: fullGemini, claude, cartoApiKey: carto?.apiKey, fetchImpl: carto?.fetchImpl, authenticate })), reels };
}

const post = (body: unknown, token = 'asha') => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});

describe('reel routes', () => {
  test('Gemini sees every photo after its number and its cut is saved with fresh photo links', async () => {
    let request: JsonRequest | undefined;
    const gemini = {
      enabled: true,
      async json<T>(req: JsonRequest) {
        request = req;
        return { title: 'Goa nights', tagline: 'Again soon', style: 'dreamy', scenes: [4, 2, 6].map((photo) => ({ photo, caption: '', seconds: 3, motion: 'zoom-in', transition: 'fade' })) } as T;
      },
    };
    const { app } = await fakes(gemini);
    const server = await serve(app);
    try {
      const res = await server.request(`/api/reels/trips/${TRIP}`, post({ prompt: 'A dreamy reel of our nights' }));
      expect(res.status).toBe(201);
      const reel = await res.json();
      expect(reel.source).toBe('gemini');
      expect(reel.seconds).toBe(9);
      expect(reel.plan.title).toBe('Goa nights');
      expect(reel.plan.scenes.map((s: { photos: { id: string }[] }) => s.photos[0].id)).toEqual([photoId(4), photoId(2), photoId(6)]);
      expect(reel.plan.scenes[0].photos[0].url).toBe(`https://media.test/key-${photoId(4)}`);
      const parts = request!.prompt as { text?: string; inlineData?: unknown }[];
      expect(parts.filter((p) => p.inlineData).length).toBe(6);
      expect(parts[0].text?.includes('A dreamy reel of our nights')).toBe(true);
      expect(parts[1].text?.startsWith('Photo 1 (added by Asha')).toBe(true);

      const list = await (await server.request(`/api/reels/trips/${TRIP}`, { headers: { Authorization: 'Bearer asha' } })).json();
      expect(list.items.length).toBe(1);
      expect(list.items[0].prompt).toBe('A dreamy reel of our nights');
    } finally {
      await server.close();
    }
  });

  test('falls back to the template cut when Gemini fails, and uses only picked photos', async () => {
    const { app } = await fakes({ enabled: true, json: async () => { throw new GeminiError('Gemini 429: busy', 429); } });
    const server = await serve(app);
    try {
      const res = await server.request(`/api/reels/trips/${TRIP}`, post({ prompt: 'fast hype edit', photoIds: [photoId(1), photoId(3), photoId(5)] }));
      expect(res.status).toBe(201);
      const reel = await res.json();
      expect(reel.source).toBe('template');
      expect(reel.plan.style).toBe('energetic');
      expect(reel.plan.scenes.map((s: { photos: { id: string }[] }) => s.photos[0].id)).toEqual([photoId(1), photoId(3), photoId(5)]);
    } finally {
      await server.close();
    }
  });

  test('Claude writes the cut from the same photos when Gemini fails', async () => {
    let request: ClaudeJsonRequest | undefined;
    const claude: Claude = {
      enabled: true,
      model: 'claude-opus-5-5',
      async json<T>(req: ClaudeJsonRequest) {
        request = req;
        return { title: 'Lake nights', tagline: 'Soon', style: 'cinematic', scenes: [5, 1, 3].map((photo) => ({ photo, caption: 'x', seconds: 2, motion: 'pan-up', transition: 'wipe' })) } as T;
      },
    };
    const { app, reels } = await fakes({ enabled: true, json: async () => { throw new GeminiError('Gemini 503: overloaded', 503); } }, 6, claude);
    const server = await serve(app);
    try {
      const res = await server.request(`/api/reels/trips/${TRIP}`, post({ prompt: 'A moody reel of the lake' }));
      expect(res.status).toBe(201);
      const reel = await res.json();
      expect(reel.source).toBe('claude');
      expect(reel.plan.title).toBe('Lake nights');
      expect(reel.plan.scenes.map((s: { photos: { id: string }[] }) => s.photos[0].id)).toEqual([photoId(5), photoId(1), photoId(3)]);
      expect((await reels())[0].model).toBe('claude-opus-5-5');
      const parts = request!.prompt as { text?: string; inlineData?: unknown }[];
      expect(parts.filter((p) => p.inlineData).length).toBe(6);
      expect(parts[0].text?.includes('A moody reel of the lake')).toBe(true);
      expect((request!.schema as { additionalProperties?: boolean }).additionalProperties).toBe(false);
    } finally {
      await server.close();
    }
  });

  test('Claude alone is enough when Gemini is off, and the template cut follows when Claude fails too', async () => {
    const answers: Claude = { enabled: true, model: 'claude-opus-5-5', json: async <T,>() => ({ title: 'Ok', tagline: 'Ok', style: 'retro', scenes: [1, 2, 3].map((photo) => ({ photo, caption: '', seconds: 2, motion: 'zoom-in', transition: 'fade' })) }) as T };
    const declines: Claude = { enabled: true, model: 'claude-opus-5-5', json: async () => { throw new ClaudeError('Claude declined (cyber)'); } };
    for (const [claude, source] of [[answers, 'claude'], [declines, 'template']] as const) {
      const { app } = await fakes({ enabled: false }, 6, claude);
      const server = await serve(app);
      try {
        const reel = await (await server.request(`/api/reels/trips/${TRIP}`, post({ prompt: 'our trip' }))).json();
        expect(reel.source).toBe(source);
      } finally {
        await server.close();
      }
    }
  });

  test('checks the prompt, the photos and membership', async () => {
    const { app } = await fakes({ enabled: false }, 1);
    const server = await serve(app);
    try {
      expect((await server.request(`/api/reels/trips/${TRIP}`, post({ prompt: '' }))).status).toBe(400);
      expect((await server.request(`/api/reels/trips/${TRIP}`, post({ prompt: 'ok go', photoIds: ['nope'] }))).status).toBe(400);
      const few = await server.request(`/api/reels/trips/${TRIP}`, post({ prompt: 'our trip' }));
      expect(few.status).toBe(422);
      expect((await few.json()).error.code).toBe('NOT_ENOUGH_PHOTOS');
      expect((await server.request(`/api/reels/trips/${TRIP}`, post({ prompt: 'our trip' }, 'ravi'))).status).toBe(404);
      expect((await server.request(`/api/reels/trips/${TRIP}`, { method: 'GET' })).status).toBe(401);
    } finally {
      await server.close();
    }
  });
});

describe('map tiles', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  function fakeCarto(delayMs = 0) {
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      calls.push(String(url));
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });
    }) as typeof fetch;
    return { calls, fetchImpl };
  }

  test('without a key the app is told to use Esri and there is no tile route', async () => {
    const { app } = await fakes({ enabled: false });
    const server = await serve(app);
    try {
      const list = await (await server.request(`/api/reels/trips/${TRIP}`, { headers: { Authorization: 'Bearer asha' } })).json();
      expect(list.mapTiles).toBe('esri');
      expect((await server.request('/api/reels/tiles/carto/voyager/3/1/2.png')).status).toBe(401);
    } finally {
      await server.close();
    }
  });

  test('with a key, retina CARTO tiles come through this server with the key added, cached, and without signing in', async () => {
    const carto = fakeCarto(30);
    const { app } = await fakes({ enabled: false }, 6, undefined, { apiKey: 'secret key', fetchImpl: carto.fetchImpl });
    const server = await serve(app);
    try {
      const list = await (await server.request(`/api/reels/trips/${TRIP}`, { headers: { Authorization: 'Bearer asha' } })).json();
      expect(list.mapTiles).toBe('carto');
      // Two at once and one after: one call to CARTO
      const [a, b] = await Promise.all([server.request('/api/reels/tiles/carto/voyager/14/11545/7056.png'), server.request('/api/reels/tiles/carto/voyager/14/11545/7056.png')]);
      const c = await server.request('/api/reels/tiles/carto/voyager/14/11545/7056.png');
      for (const res of [a, b, c]) {
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('image/png');
        expect(res.headers.get('cache-control')?.includes('max-age=604800')).toBe(true);
        expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
      }
      expect(carto.calls).toEqual(['https://basemaps.cartocdn.com/rastertiles/voyager/14/11545/7056@2x.png?key=secret%20key']);
    } finally {
      await server.close();
    }
  });

  test('only CARTO styles and real tile numbers are proxied', async () => {
    const carto = fakeCarto();
    const { app } = await fakes({ enabled: false }, 6, undefined, { apiKey: 'k', fetchImpl: carto.fetchImpl });
    const server = await serve(app);
    try {
      for (const path of ['evil/3/1/1.png', 'voyager/19/1/1.png', 'voyager/3/8/1.png', 'voyager/3/1/8.png', 'voyager/3/-1/1.png', 'voyager/x/1/1.png']) {
        expect((await server.request(`/api/reels/tiles/carto/${path}`)).status).toBe(404);
      }
      expect(carto.calls.length).toBe(0);
    } finally {
      await server.close();
    }
  });

  test('a CARTO failure is a 502, not a broken image cached for later', async () => {
    let fail = true;
    const fetchImpl = (async () => (fail ? new Response('nope', { status: 403 }) : new Response(PNG, { status: 200 }))) as typeof fetch;
    const { app } = await fakes({ enabled: false }, 6, undefined, { apiKey: 'k', fetchImpl });
    const server = await serve(app);
    try {
      expect((await server.request('/api/reels/tiles/carto/dark_all/2/1/1.png')).status).toBe(502);
      fail = false;
      expect((await server.request('/api/reels/tiles/carto/dark_all/2/1/1.png')).status).toBe(200);
    } finally {
      await server.close();
    }
  });
});

