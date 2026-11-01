import { createHash } from 'node:crypto';
import { GoogleAuth, type IdTokenClient } from 'google-auth-library';
import { ApiError } from '../http.ts';
import { logger } from '../logger.ts';
import { decodeCredentials } from '../storage.ts';

// Cold starts load TensorFlow in the face-search container, which takes 30 to 60 s.
const TIMEOUT_MS = 90_000;
const MAX_SELFIES = 3;
const DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export type FaceBox = { x: number; y: number; w: number; h: number; distance: number };
export type FaceMatch = { object_name: string; width: number | null; height: number | null; distance: number; faces: FaceBox[] };
// embeddings: one 512-float vector per selfie, only present when the selfies were sent (not when searched by vector)
export type FaceSearchResult = { matches: FaceMatch[]; threshold: number; truncated: boolean; embeddings?: number[][] };

export type FaceSearch = {
  search(tripId: string, selfies: string[]): Promise<FaceSearchResult>;
  // Skips face detection and embedding: for vectors returned by an earlier search()
  searchByEmbeddings(tripId: string, embeddings: number[][]): Promise<FaceSearchResult>;
};

// Identifies a selfie's pixels (not its data-URL wrapper), so an unchanged profile selfie finds its cached embedding
export function selfieHash(selfie: string) {
  return createHash('sha256').update(selfie.slice(selfie.indexOf(',') + 1)).digest('hex');
}

export function parseSelfies(body: unknown): string[] {
  const selfies = (body as { selfies?: unknown } | null)?.selfies;
  if (!Array.isArray(selfies) || selfies.length < 1 || selfies.length > MAX_SELFIES) {
    throw new ApiError(400, 'VALIDATION_ERROR', `selfies must be a list of 1 to ${MAX_SELFIES} images`);
  }
  selfies.forEach((s, i) => {
    if (typeof s !== 'string' || !(DATA_URL.test(s) || BASE64.test(s))) {
      throw new ApiError(400, 'VALIDATION_ERROR', `selfies[${i}] must be a JPEG, PNG or WebP data URL or base64 string`);
    }
  });
  return selfies as string[];
}

type Deps = {
  url: string | null;
  fetch?: typeof fetch;
  // Returns Authorization headers for the service; defaults to a Google ID token for the URL.
  authHeaders?: (url: string) => Promise<Record<string, string>>;
  timeoutMs?: number;
};

function isLocal(url: string) {
  return url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
}

function googleAuthHeaders(env = process.env) {
  let client: Promise<IdTokenClient> | undefined;
  return async (url: string) => {
    // The ID token audience must be the service URL; the client caches and refreshes the token.
    client ??= (async () => {
      const credentials = decodeCredentials(env);
      if (!credentials) throw new Error('GCS_CREDENTIALS_BASE64 is required to call face-search');
      return new GoogleAuth({ credentials }).getIdTokenClient(url);
    })();
    const headers = new Headers((await client.then(c => c.getRequestHeaders(url))) as HeadersInit);
    const out: Record<string, string> = {};
    headers.forEach((value, key) => { out[key] = value; });
    return out;
  };
}

const unavailable = () => new ApiError(503, 'FACE_SEARCH_UNAVAILABLE', 'Face search is temporarily unavailable. Try again shortly.');

// Client for the private face-search service. The selfies are forwarded in memory and never logged or stored.
export function createFaceSearch({ url, fetch: fetchImpl = fetch, authHeaders, timeoutMs = TIMEOUT_MS }: Deps): FaceSearch {
  const headersFor = authHeaders ?? googleAuthHeaders();
  async function call(payload: Record<string, unknown>, count: number, kind: string): Promise<FaceSearchResult> {
    if (!url) throw new ApiError(503, 'FACE_SEARCH_DISABLED', 'Face matching is not configured on this server');
    const started = Date.now();
    let res: Response;
    try {
      const auth = isLocal(url) ? {} : await headersFor(url);
      res = await fetchImpl(`${url}/search`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err: any) {
      logger.warn('Faces', `face-search request failed after ${Date.now() - started} ms: ${err?.name ?? 'Error'} ${err?.message ?? ''}`);
      throw unavailable();
    }
    const body: any = await res.json().catch(() => null);
    const ms = Date.now() - started;
    if (!res.ok) {
      const code = typeof body?.error?.code === 'string' ? body.error.code : undefined;
      const message = typeof body?.error?.message === 'string' ? body.error.message : undefined;
      logger.warn('Faces', `face-search ${res.status} [${code ?? 'none'}] after ${ms} ms`);
      if (res.status === 422) throw new ApiError(422, code ?? 'INVALID_IMAGE', message ?? 'No usable face found in the selfie');
      if (res.status === 413) throw new ApiError(413, 'SELFIE_TOO_LARGE', message ?? 'Selfie is too large');
      if (res.status === 400) throw new ApiError(400, code ?? 'VALIDATION_ERROR', message ?? 'Invalid face search request');
      throw unavailable();
    }
    if (!Array.isArray(body?.matches)) {
      logger.warn('Faces', `face-search returned an unexpected body after ${ms} ms`);
      throw unavailable();
    }
    logger.info('Faces', `face-search ok in ${ms} ms: ${body.matches.length} match(es), ${count} ${kind}`);
    const embeddings = Array.isArray(body.selfies) && body.selfies.length > 0 && body.selfies.every((x: any) => Array.isArray(x?.embedding))
      ? body.selfies.map((x: any) => x.embedding as number[])
      : undefined;
    return { matches: body.matches, threshold: Number(body.threshold), truncated: Boolean(body.truncated), embeddings };
  }
  return {
    search: (tripId, selfies) => call({ trip_id: tripId, selfies }, selfies.length, 'selfie(s)'),
    searchByEmbeddings: (tripId, embeddings) => call({ trip_id: tripId, embeddings }, embeddings.length, 'cached embedding(s)'),
  };
}

// Joins face-search matches to registered album photos; matches without a trip_photos row are dropped.
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
