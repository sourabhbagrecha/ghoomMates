import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { ApiError } from '../../src/http.ts';
import { createFaceSearch, mapMatches, parseSelfies } from '../../src/trips/faces.ts';

const TRIP = '7d444840-9dc0-4f4a-9e0e-3a0e5b1c2f10';
const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
const client = (fetchImpl: typeof fetch, url: string | null = 'http://localhost:8081') =>
  createFaceSearch({ url, fetch: fetchImpl, authHeaders: async () => ({ Authorization: 'Bearer test' }), timeoutMs: 200 });
const failure = async (p: Promise<unknown>) => p.then(() => { throw new Error('expected rejection'); }, (e: ApiError) => e);

describe('parseSelfies', () => {
  test('accepts 1 to 3 data URLs or base64 strings', () => {
    expect(parseSelfies({ selfies: ['data:image/jpeg;base64,AAAA'] })).toEqual(['data:image/jpeg;base64,AAAA']);
    expect(parseSelfies({ selfies: ['AAAA', 'BBBB', 'CCCC'] }).length).toBe(3);
  });
  test('rejects bad counts and non-image values', async () => {
    for (const body of [{}, null, { selfies: [] }, { selfies: ['AA', 'AA', 'AA', 'AA'] }, { selfies: [1] }, { selfies: ['data:text/html;base64,AAAA'] }, { selfies: ['not base64!'] }]) {
      try { parseSelfies(body); throw new Error('expected rejection'); } catch (e: any) {
        expect(e.status).toBe(400);
        expect(e.code).toBe('VALIDATION_ERROR');
      }
    }
  });
});

describe('mapMatches', () => {
  test('drops unregistered photos, sorts by distance and passes boxes through', () => {
    const faces = [{ x: 1, y: 2, w: 3, h: 4, distance: 0.2 }];
    const out = mapMatches([
      { object_name: 'b', width: 10, height: 20, distance: 0.3, faces },
      { object_name: 'gone', width: 10, height: 20, distance: 0.1, faces },
      { object_name: 'a', width: 30, height: 40, distance: 0.2, faces },
    ], new Map([['a', 'id-a'], ['b', 'id-b']]));
    expect(out.map(m => m.photoId)).toEqual(['id-a', 'id-b']);
    expect(out[0]).toEqual({ photoId: 'id-a', distance: 0.2, width: 30, height: 40, faces });
  });
});

describe('face-search client', () => {
  test('returns matches, threshold and truncated, and posts trip_id and selfies', async () => {
    let seen: any;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, body: JSON.parse(String(init.body)), headers: init.headers };
      return new Response(JSON.stringify({ matches: [{ object_name: 'a', distance: 0.1, faces: [] }], threshold: 0.4, truncated: true }));
    }) as unknown as typeof fetch;
    const result = await client(fetchImpl).search(TRIP, ['AAAA']);
    expect(result.matches.length).toBe(1);
    expect(result.threshold).toBe(0.4);
    expect(result.truncated).toBe(true);
    expect(seen.url).toBe('http://localhost:8081/search');
    expect(seen.body).toEqual({ trip_id: TRIP, selfies: ['AAAA'] });
    expect(seen.headers.Authorization).toBe(undefined); // localhost is called without auth
  });
  test('non-local URLs send the ID token', async () => {
    let headers: any;
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      headers = init.headers;
      return new Response(JSON.stringify({ matches: [], threshold: 0.4, truncated: false }));
    }) as unknown as typeof fetch;
    await client(fetchImpl, 'https://face-search.run.app').search(TRIP, ['AAAA']);
    expect(headers.Authorization).toBe('Bearer test');
  });
  test('maps face-search errors', async () => {
    const cases: [number, unknown, number, string][] = [
      [422, { error: { code: 'NO_FACE', message: 'No face found in selfies[0]' } }, 422, 'NO_FACE'],
      [422, { error: { code: 'INVALID_IMAGE', message: 'bad' } }, 422, 'INVALID_IMAGE'],
      [413, { error: { code: 'SELFIE_TOO_LARGE', message: 'big' } }, 413, 'SELFIE_TOO_LARGE'],
      [413, { error: { code: 'BODY_TOO_LARGE', message: 'big' } }, 413, 'SELFIE_TOO_LARGE'],
      [400, { error: { code: 'VALIDATION_ERROR', message: 'nope' } }, 400, 'VALIDATION_ERROR'],
      [503, { error: { code: 'SEARCH_UNAVAILABLE', message: 'down' } }, 503, 'FACE_SEARCH_UNAVAILABLE'],
      [500, 'oops', 503, 'FACE_SEARCH_UNAVAILABLE'],
    ];
    for (const [status, body, expectedStatus, code] of cases) {
      const err = await failure(client(reply(status, body)).search(TRIP, ['AAAA']));
      expect(err.status).toBe(expectedStatus);
      expect(err.code).toBe(code);
    }
    expect((await failure(client(reply(422, { error: { code: 'NO_FACE', message: 'No face found in selfies[0]' } })).search(TRIP, ['A']))).message).toBe('No face found in selfies[0]');
  });
  test('network errors and timeouts are unavailable', async () => {
    const refused = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
    const hang = ((_u: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))) as unknown as typeof fetch;
    for (const f of [refused, hang]) {
      const err = await failure(client(f).search(TRIP, ['AAAA']));
      expect(err.status).toBe(503);
      expect(err.code).toBe('FACE_SEARCH_UNAVAILABLE');
    }
  });
  test('unset URL is disabled', async () => {
    const err = await failure(client(reply(200, {}), null).search(TRIP, ['AAAA']));
    expect(err.status).toBe(503);
    expect(err.code).toBe('FACE_SEARCH_DISABLED');
  });
});
