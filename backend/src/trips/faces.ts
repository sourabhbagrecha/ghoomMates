import type { Db } from '../db.ts';
import { ApiError } from '../http.ts';
import { logger } from '../logger.ts';

// Find-me: Atlas Vector Search over the trip's indexed faces (the `faces` collection the face-indexer in cloud/
// writes), queried with the user's selfie vector (selfie_faces, also written by the face-indexer). No ML runs here.
// cloud/faces/store.py has the same search (nearest_faces, matches_for_selfie, group_by_photo), tested against Atlas
// local; keep the two in step.

export type FaceBox = { x: number; y: number; w: number; h: number; distance: number };
export type FaceMatch = { object_name: string; width: number | null; height: number | null; distance: number; faces: FaceBox[] };
export type FaceSearchResult = { matches: FaceMatch[]; threshold: number; truncated: boolean };
// The embedding space a vector belongs to. Only faces embedded by the same model and detector are comparable.
export type FaceSpace = { modelName: string; detector: string };

export type FaceSearch = {
  search(tripId: string, embedding: number[], space: FaceSpace): Promise<FaceSearchResult>;
};

export type FaceHit = {
  faceId: string; photoId: string; x: number; y: number; w: number; h: number; distance: number;
  objectName: string; width: number | null; height: number | null;
};
export type NearestFaces = (tripId: string, embedding: number[], space: FaceSpace, k: number) => Promise<FaceHit[]>;

// Defaults of the face-indexer (cloud/faces/config.py); selfie_faces documents carry their own model and detector.
export const DEFAULT_SPACE: FaceSpace = { modelName: 'Facenet512', detector: 'retinaface' };
export const EMBEDDING_DIM = 512;
// Cosine distance below which a face counts as the selfie's person. Measured: same person 0.16 to 0.34, closest
// stranger 0.80. Same value as MATCH_THRESHOLD in cloud/faces/config.py.
const DEFAULT_THRESHOLD = 0.40;
const INITIAL_K = 500;
// Atlas Vector Search caps limit and numCandidates at 10000.
const VECTOR_SEARCH_MAX = 10_000;
const VECTOR_INDEX = 'faces_embedding';

export function matchThreshold(env = process.env) {
  const value = Number(env.FACE_MATCH_THRESHOLD);
  return Number.isFinite(value) && value > 0 && value < 2 ? value : DEFAULT_THRESHOLD;
}

// The k nearest faces of one trip. The trip/model filter runs inside the index scan, so k results come back
// whenever the trip has k faces, however many other trips there are.
export function atlasNearestFaces(db: Db): NearestFaces {
  return async (tripId, embedding, space, k) => {
    const docs = await db.collection('faces').aggregate([
      {
        $vectorSearch: {
          index: VECTOR_INDEX,
          path: 'embedding',
          queryVector: embedding,
          numCandidates: Math.min(Math.max(10 * k, 100), VECTOR_SEARCH_MAX),
          limit: k,
          filter: { $and: [{ trip_id: { $eq: tripId } }, { model_name: { $eq: space.modelName } }, { detector: { $eq: space.detector } }] },
        },
      },
      { $project: { photo_id: 1, x: 1, y: 1, w: 1, h: 1, object_name: 1, width: 1, height: 1, score: { $meta: 'vectorSearchScore' } } },
    ]).toArray();
    return docs
      // Atlas cosine score is (1 + cos) / 2; distance = 1 - cos = 2 * (1 - score).
      .map(d => ({
        faceId: String(d._id), photoId: String(d.photo_id), x: d.x, y: d.y, w: d.w, h: d.h, distance: 2 * (1 - d.score),
        objectName: d.object_name, width: d.width ?? null, height: d.height ?? null,
      }))
      .sort((a, b) => a.distance - b.distance);
  };
}

// Every face in the trip closer than the threshold. If all k nearest faces match there may be more beyond k, so k
// doubles and the query runs again; only the Atlas cap stops it, and then truncated is true (never a silent drop).
export async function matchesForSelfie(nearest: NearestFaces, tripId: string, embedding: number[], space: FaceSpace, threshold: number, initialK = INITIAL_K, maxK = VECTOR_SEARCH_MAX) {
  let k = Math.min(initialK, maxK);
  for (;;) {
    const hits = await nearest(tripId, embedding, space, k);
    const matched = hits.filter(h => h.distance < threshold);
    if (hits.length < k || matched.length < hits.length) return { hits: matched, truncated: false };
    if (k >= maxK) return { hits: matched, truncated: true };
    k = Math.min(k * 2, maxK);
  }
}

// One entry per photo, its distance that of its closest face; faces and photos sorted by distance.
export function groupByPhoto(hits: FaceHit[]): FaceMatch[] {
  const photos = new Map<string, FaceMatch>();
  for (const h of hits) {
    let p = photos.get(h.photoId);
    if (!p) photos.set(h.photoId, p = { object_name: h.objectName, width: h.width, height: h.height, distance: h.distance, faces: [] });
    p.faces.push({ x: h.x, y: h.y, w: h.w, h: h.h, distance: h.distance });
    p.distance = Math.min(p.distance, h.distance);
  }
  for (const p of photos.values()) p.faces.sort((a, b) => a.distance - b.distance);
  return [...photos.values()].sort((a, b) => a.distance - b.distance || a.object_name.localeCompare(b.object_name));
}

export function createFaceSearch(nearest: NearestFaces, threshold = matchThreshold()): FaceSearch {
  return {
    async search(tripId, embedding, space) {
      const started = Date.now();
      let result: Awaited<ReturnType<typeof matchesForSelfie>>;
      try {
        result = await matchesForSelfie(nearest, tripId, embedding, space, threshold);
      } catch (err: any) {
        // No vector index (a local MongoDB without Atlas Search, or migrate.py not run) or Atlas unreachable
        logger.warn('Faces', `vector search failed after ${Date.now() - started} ms: ${err?.name ?? 'Error'} ${err?.message ?? ''}`);
        throw new ApiError(503, 'FACE_SEARCH_UNAVAILABLE', 'Face search is temporarily unavailable. Try again shortly.');
      }
      const matches = groupByPhoto(result.hits);
      if (result.truncated) logger.warn('Faces', `find-me in trip ${tripId} hit the ${VECTOR_SEARCH_MAX}-face cap; results are truncated`);
      return { matches, threshold, truncated: result.truncated };
    },
  };
}

// Joins matches to registered album photos; matches without a trip_photos row are dropped.
export function mapMatches(matches: FaceMatch[], idByKey: Map<string, string>) {
  return matches
    .filter(m => idByKey.has(m.object_name))
    .map(m => ({
      photoId: idByKey.get(m.object_name)!,
      distance: m.distance,
      width: m.width,
      height: m.height,
      faces: m.faces.map(f => ({ x: f.x, y: f.y, w: f.w, h: f.h, distance: f.distance })),
    }))
    .sort((a, b) => a.distance - b.distance);
}
