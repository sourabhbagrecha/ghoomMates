import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { ApiError } from '../../src/http.ts';
import {
  createFaceSearch, DEFAULT_SPACE, groupByPhoto, mapMatches, matchesForSelfie, matchThreshold, type FaceHit, type NearestFaces,
} from '../../src/trips/faces.ts';

// $vectorSearch needs Atlas, so these tests drive the search logic with a fake nearest-faces query. The query itself
// is the same as cloud/faces/store.py's nearest_faces, which cloud/tests/test_search_db.py runs against Atlas local.

const TRIP = '7d444840-9dc0-4f4a-9e0e-3a0e5b1c2f10';
const VECTOR = Array.from({ length: 512 }, (_, i) => (i === 0 ? 1 : 0));
let n = 0;
const hit = (distance: number, photo = `p${n}`, extra: Partial<FaceHit> = {}): FaceHit => ({
  faceId: `f${n++}`, photoId: photo, x: 1, y: 2, w: 3, h: 4, distance, objectName: `trips/t/photos/${photo}.jpg`, width: 100, height: 80, ...extra,
});
// A trip whose faces are these distances from the selfie; returns the k nearest, as $vectorSearch would
const trip = (distances: number[]) => {
  const all = distances.map(d => hit(d)).sort((a, b) => a.distance - b.distance);
  const ks: number[] = [];
  const nearest: NearestFaces = async (_t, _e, _s, k) => { ks.push(k); return all.slice(0, k); };
  return { nearest, ks };
};

describe('matchesForSelfie', () => {
  test('one query when a non-match shows up within k', async () => {
    const { nearest, ks } = trip([0.1, 0.2, 0.9]);
    const { hits, truncated } = await matchesForSelfie(nearest, TRIP, VECTOR, DEFAULT_SPACE, 0.4, 4);
    expect(hits.map(h => h.distance)).toEqual([0.1, 0.2]);
    expect([ks, truncated]).toEqual([[4], false]);
  });
  test('doubles k while every nearest face is a match, so no match is dropped', async () => {
    const { nearest, ks } = trip([...Array(9).fill(0.1), 0.9]);
    const { hits, truncated } = await matchesForSelfie(nearest, TRIP, VECTOR, DEFAULT_SPACE, 0.4, 2);
    expect(hits.length).toBe(9);
    expect([ks, truncated]).toEqual([[2, 4, 8, 16], false]);
  });
  test('stops at the cap and says truncated', async () => {
    const { nearest, ks } = trip(Array(10).fill(0.1));
    const { hits, truncated } = await matchesForSelfie(nearest, TRIP, VECTOR, DEFAULT_SPACE, 0.4, 2, 6);
    expect([hits.length, ks, truncated]).toEqual([6, [2, 4, 6], true]);
  });
  test('a trip with fewer faces than k is complete', async () => {
    const { nearest, ks } = trip([0.1, 0.2]);
    expect((await matchesForSelfie(nearest, TRIP, VECTOR, DEFAULT_SPACE, 0.4, 4)).truncated).toBe(false);
    expect(ks).toEqual([4]);
  });
});

describe('groupByPhoto', () => {
  test('one entry per photo at its closest face, faces and photos sorted by distance', () => {
    const out = groupByPhoto([hit(0.3, 'a'), hit(0.2, 'b'), hit(0.1, 'a', { x: 9 })]);
    expect(out.map(p => [p.object_name, p.distance])).toEqual([['trips/t/photos/a.jpg', 0.1], ['trips/t/photos/b.jpg', 0.2]]);
    expect(out[0].faces).toEqual([{ x: 9, y: 2, w: 3, h: 4, distance: 0.1 }, { x: 1, y: 2, w: 3, h: 4, distance: 0.3 }]);
    expect([out[0].width, out[0].height]).toEqual([100, 80]);
  });
});

describe('createFaceSearch', () => {
  test('passes the trip, vector and embedding space to the query and returns grouped matches', async () => {
    let seen: unknown[] = [];
    const nearest: NearestFaces = async (...args) => { seen = args; return [hit(0.2, 'x'), hit(0.8, 'y')]; };
    const space = { modelName: 'ArcFace', detector: 'mtcnn' };
    const result = await createFaceSearch(nearest, 0.4).search(TRIP, VECTOR, space);
    expect(seen.slice(0, 3)).toEqual([TRIP, VECTOR, space]);
    expect(result.matches.map(m => m.object_name)).toEqual(['trips/t/photos/x.jpg']);
    expect([result.threshold, result.truncated]).toEqual([0.4, false]);
  });
  test('a failing vector search is unavailable', async () => {
    const nearest: NearestFaces = async () => { throw new Error('PlanExecutor error: index faces_embedding not found'); };
    const err = await createFaceSearch(nearest).search(TRIP, VECTOR, DEFAULT_SPACE).then(() => null, (e: ApiError) => e);
    expect([err?.status, err?.code]).toEqual([503, 'FACE_SEARCH_UNAVAILABLE']);
  });
  test('FACE_MATCH_THRESHOLD overrides the threshold; nonsense falls back to 0.40', () => {
    expect(matchThreshold({ FACE_MATCH_THRESHOLD: '0.35' })).toBe(0.35);
    expect(matchThreshold({ FACE_MATCH_THRESHOLD: 'abc' })).toBe(0.4);
    expect(matchThreshold({})).toBe(0.4);
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
