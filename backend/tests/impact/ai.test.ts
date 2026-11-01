import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '../expect.ts';
import { ImpactAi, keepsFacts } from '../../src/impact/ai.ts';
import { noCache, type ImpactCache } from '../../src/impact/cache.ts';
import { createRouteLookup, routeKey } from '../../src/impact/maps.ts';
import type { Swap } from '../../src/impact/swaps.ts';
import { fakeGemini } from './fixtures.ts';

function memoryCache(): ImpactCache & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    store,
    get: async keys => new Map(keys.filter(k => store.has(k)).map(k => [k, store.get(k)])),
    put: async entries => { for (const [k, v] of entries) store.set(k, v); },
  };
}

const swap = (text: string, id = 'walk:a:b'): Swap => ({
  id, kind: 'walk', text, savesKg: 0.4, savesCrowdHours: 0,
  action: { type: 'mode', fromStopId: 'a', toStopId: 'b', mode: 'walk' }, actionLabel: 'Walk it',
});

describe('sorting expenses with Gemini', () => {
  test('answers are validated, mapped and cached; the second time Gemini isn’t asked', async () => {
    const gemini = fakeGemini(() => ({
      items: [
        { i: 1, class: 'local-artisan' },
        { i: 2, class: 'other-transport' },
        { i: 3, class: 'local-transport' },
        { i: 4, class: 'spaceship' },
        { i: 9, class: 'guide' },
      ],
    }));
    const cache = memoryCache();
    const ai = new ImpactAi(gemini, cache);
    const first = await ai.classify(['souvenirs', 'ixigo bus', 'auto for the day', 'mystery']);
    expect(first.get('souvenirs')).toEqual({ class: 'local-artisan', local: true });
    expect(first.get('ixigo bus')).toEqual({ class: 'transport', local: false });
    expect(first.get('auto for the day')).toEqual({ class: 'transport', local: true });
    // A label that isn't one of ours, and an index that doesn't exist, are dropped
    expect(first.has('mystery')).toBe(false);
    expect(first.size).toBe(3);
    expect(gemini.calls).toHaveLength(1);
    assert.match(String(gemini.calls[0].prompt), /1\. souvenirs\n2\. ixigo bus/);

    // Cached: no second call, even when the network is allowed
    const again = await ai.classify(['souvenirs', 'ixigo bus']);
    expect(again.size).toBe(2);
    expect(gemini.calls).toHaveLength(1);
  });

  test('network: false answers from the cache alone', async () => {
    const gemini = fakeGemini(() => ({ items: [{ i: 1, class: 'guide' }] }));
    const ai = new ImpactAi(gemini, memoryCache());
    expect((await ai.classify(['walk with a storyteller'], { network: false })).size).toBe(0);
    expect(gemini.calls).toHaveLength(0);
  });

  test('without Gemini, nothing is asked and nothing breaks', async () => {
    const off = fakeGemini(() => { throw new Error('should not be called'); }, false);
    expect((await new ImpactAi(off, memoryCache()).classify(['misc'])).size).toBe(0);
    expect((await new ImpactAi(undefined, noCache).classify(['misc'])).size).toBe(0);
    expect(off.calls).toHaveLength(0);
  });

  test('a failure falls back quietly and Gemini is left alone for a minute', async () => {
    let clock = 1_000_000;
    const gemini = fakeGemini(() => { throw new Error('quota'); });
    const ai = new ImpactAi(gemini, memoryCache(), () => clock);
    expect((await ai.classify(['misc'])).size).toBe(0);
    expect((await ai.classify(['other'])).size).toBe(0);
    expect(gemini.calls).toHaveLength(1);
    clock += 61_000;
    await ai.classify(['another']);
    expect(gemini.calls).toHaveLength(2);
  });

  test('a broken cache doesn’t stop the answer', async () => {
    const gemini = fakeGemini(() => ({ items: [{ i: 1, class: 'guide' }] }));
    const broken: ImpactCache = { get: async () => { throw new Error('db down'); }, put: async () => { throw new Error('db down'); } };
    const answers = await new ImpactAi(gemini, broken).classify(['guided walk']);
    expect(answers.get('guided walk')).toEqual({ class: 'guide', local: true });
  });
});

describe('re-wording the swaps', () => {
  const swaps = [
    swap('Walk City Palace → Jagdish Temple: 460 m through the old city, 6 min. Saves 0.4 kg.', 'walk:1'),
    swap('Take an e-rickshaw instead of a cab for Ahar → Shilpgram: saves 2.4 kg, 71% less on this ride.', 'rick:2'),
  ];

  test('keeps the facts: a re-wording that drops or changes a number is thrown out', () => {
    const original = swaps[0].text;
    expect(keepsFacts(original, 'Stroll from City Palace to Jagdish Temple: 460 m, 6 min, and 0.4 kg off the squad’s footprint!')).toBe(true);
    expect(keepsFacts(original, 'Stroll from City Palace to Jagdish Temple: 500 m, 6 min, saves 0.4 kg for everyone.')).toBe(false);
    expect(keepsFacts(original, 'Walk it!')).toBe(false);
    // The numbers are right but the places have gone: the model drifted
    expect(keepsFacts(original, 'Just stroll over there instead, 460 m and 6 min, which is 0.4 kg lighter.')).toBe(false);
    // Shortening a place name is fine
    expect(keepsFacts(original, 'Stroll over to Jagdish instead: just 460 m, 6 min, and 0.4 kg off our footprint.')).toBe(true);
    expect(keepsFacts(original, 'x'.repeat(200))).toBe(false);
    expect(keepsFacts(original, 42)).toBe(false);
    expect(keepsFacts(original, 'Line one 460 6 0.4\nline two')).toBe(false);
  });

  test('uses Gemini’s wording where it kept the numbers, the rule text where it didn’t, and caches the result', async () => {
    const gemini = fakeGemini(() => ({
      tips: [
        { i: 1, text: 'Stroll from City Palace to Jagdish Temple: 460 m, 6 min, and 0.4 kg off our footprint.' },
        { i: 2, text: 'An e-rickshaw is cleaner for this one, saves 9 kg.' },
      ],
    }));
    const cache = memoryCache();
    const ai = new ImpactAi(gemini, cache);
    const phrased = await ai.phrase(swaps);
    expect(phrased[0].text).toBe('Stroll from City Palace to Jagdish Temple: 460 m, 6 min, and 0.4 kg off our footprint.');
    expect(phrased[1].text).toBe(swaps[1].text);
    // Everything but the text is untouched
    expect(phrased[0].action).toEqual(swaps[0].action);
    expect(phrased.map(s => s.id)).toEqual(['walk:1', 'rick:2']);

    const again = await new ImpactAi(fakeGemini(() => { throw new Error('cached'); }), cache).phrase(swaps, { network: false });
    expect(again[0].text).toBe(phrased[0].text);
    expect(gemini.calls).toHaveLength(1);
  });

  test('no Gemini, a failure, or nothing to phrase: the rule-based swaps come back as they were', async () => {
    expect(await new ImpactAi(undefined, memoryCache()).phrase(swaps)).toEqual(swaps);
    expect(await new ImpactAi(fakeGemini(() => { throw new Error('boom'); }), memoryCache()).phrase(swaps)).toEqual(swaps);
    const idle = fakeGemini(() => ({ tips: [] }));
    expect(await new ImpactAi(idle, memoryCache()).phrase([])).toEqual([]);
    expect(idle.calls).toHaveLength(0);
  });
});

describe('Routes API distances', () => {
  const from = { lat: 24.5764, lng: 73.6835 };
  const to = { lat: 24.5797, lng: 73.684 };
  const ok = (meters: number) => new Response(JSON.stringify({ routes: [{ distanceMeters: meters }] }), { status: 200 });

  test('no API key, no lookup', () => {
    expect(createRouteLookup({ apiKey: undefined, cache: noCache })).toBe(null);
    expect(createRouteLookup({ apiKey: '  ', cache: noCache })).toBe(null);
  });

  test('asks computeRoutes for the distance only, then remembers the answer', async () => {
    const seen: { url: string; headers: Record<string, string>; body: any }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      return ok(1234);
    }) as unknown as typeof fetch;
    const cache = memoryCache();
    const lookup = createRouteLookup({ apiKey: 'test-key', cache, fetchImpl })!;
    expect(await lookup(from, to, 'DRIVE')).toBe(1.234);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(seen[0].headers['X-Goog-Api-Key']).toBe('test-key');
    expect(seen[0].headers['X-Goog-FieldMask']).toBe('routes.distanceMeters');
    expect(seen[0].body.travelMode).toBe('DRIVE');
    expect(seen[0].body.origin.location.latLng).toEqual({ latitude: 24.5764, longitude: 73.6835 });
    expect(cache.store.get(routeKey(from, to, 'DRIVE'))).toEqual({ km: 1.234 });
    // Cached: no second request. A different travel mode is a different question.
    expect(await lookup(from, to, 'DRIVE')).toBe(1.234);
    expect(seen).toHaveLength(1);
    expect(await lookup(from, to, 'WALK')).toBe(1.234);
    expect(seen).toHaveLength(2);
    expect(seen[1].body.travelMode).toBe('WALK');
  });

  test('a refusal or a bad answer means "unknown", and the API is left alone for a few minutes', async () => {
    let clock = 0;
    let calls = 0;
    const fetchImpl = (async () => { calls++; return new Response('{"error":{"status":"PERMISSION_DENIED"}}', { status: 403 }); }) as unknown as typeof fetch;
    const lookup = createRouteLookup({ apiKey: 'k', cache: noCache, fetchImpl, now: () => clock })!;
    expect(await lookup(from, to, 'DRIVE')).toBe(null);
    expect(await lookup(from, { lat: 24.6, lng: 73.7 }, 'DRIVE')).toBe(null);
    expect(calls).toBe(1);
    clock += 6 * 60_000;
    await lookup(from, to, 'DRIVE');
    expect(calls).toBe(2);

    const empty = createRouteLookup({ apiKey: 'k', cache: noCache, fetchImpl: (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch })!;
    expect(await empty(from, to, 'WALK')).toBe(null);
    const down = createRouteLookup({ apiKey: 'k', cache: noCache, fetchImpl: (async () => { throw new Error('offline'); }) as unknown as typeof fetch })!;
    expect(await down(from, to, 'WALK')).toBe(null);
  });
});
