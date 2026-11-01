import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Router } from 'express';
import { Storage } from '@google-cloud/storage';
import { ApiError } from './http.ts';
import { logger } from './logger.ts';

export type UploadTarget = { url: string; method: 'PUT'; headers: Record<string, string> };

// Where browser uploads go. Objects are private: clients write and read them through short-lived signed URLs.
export interface MediaStorage {
  readonly kind: 'gcs' | 'local';
  readonly description: string;
  createUpload(key: string, contentType: string): Promise<UploadTarget>;
  readUrl(key: string): Promise<string>;
  // Size in bytes, or null when the object does not exist.
  size(key: string): Promise<number | null>;
  // Writes a small object server-side (e.g. a selfie already held in memory).
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  // The object's bytes, or null when it does not exist (e.g. a photo handed to Gemini). Check size() first for big files.
  read(key: string): Promise<Buffer | null>;
}

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const UPLOAD_TTL_MS = 15 * 60 * 1000;
const READ_TTL_MS = 12 * 60 * 60 * 1000;
// Read URLs are reused for a while so browsers can cache the images.
const READ_REUSE_MS = 6 * 60 * 60 * 1000;
const KEY = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,300}$/;

export const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

// Narration recordings are served from the same bucket (Kaavad Tales)
const AUDIO_TYPES: Record<string, string> = { wav: 'audio/wav', m4a: 'audio/mp4', mp3: 'audio/mpeg' };

function assertKey(key: string) {
  if (!KEY.test(key) || key.includes('..')) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid object key');
}

class GcsStorage implements MediaStorage {
  readonly kind = 'gcs';
  readonly description: string;
  private bucket;
  private readCache = new Map<string, { url: string; until: number }>();

  constructor(bucketName: string, credentials: { client_email: string; private_key: string; project_id?: string }) {
    const storage = new Storage({ projectId: credentials.project_id, credentials: { client_email: credentials.client_email, private_key: credentials.private_key } });
    this.bucket = storage.bucket(bucketName);
    this.description = `GCS (gs://${bucketName})`;
  }

  async createUpload(key: string, contentType: string): Promise<UploadTarget> {
    assertKey(key);
    const [url] = await this.bucket.file(key).getSignedUrl({ version: 'v4', action: 'write', expires: Date.now() + UPLOAD_TTL_MS, contentType });
    return { url, method: 'PUT', headers: { 'Content-Type': contentType } };
  }

  async readUrl(key: string) {
    assertKey(key);
    const cached = this.readCache.get(key);
    if (cached && cached.until > Date.now()) return cached.url;
    const [url] = await this.bucket.file(key).getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + READ_TTL_MS });
    this.readCache.set(key, { url, until: Date.now() + READ_REUSE_MS });
    return url;
  }

  async size(key: string) {
    assertKey(key);
    try {
      const [metadata] = await this.bucket.file(key).getMetadata();
      return Number(metadata.size ?? 0);
    } catch (err: any) {
      if (err?.code === 404) return null;
      throw err;
    }
  }

  async put(key: string, data: Buffer, contentType: string) {
    assertKey(key);
    await this.bucket.file(key).save(data, { contentType, resumable: false });
  }

  async read(key: string) {
    assertKey(key);
    try {
      const [data] = await this.bucket.file(key).download();
      return data;
    } catch (err: any) {
      if (err?.code === 404) return null;
      throw err;
    }
  }
}

// Fallback when GCS is not configured: files live in backend/uploads and are served by /api/media
// with HMAC-signed, expiring URLs, so the client upload flow is identical.
class LocalStorage implements MediaStorage {
  readonly kind = 'local';
  readonly description: string;
  readonly root: string;
  private secret: string;

  constructor(root: string, secret: string) {
    this.root = root;
    this.secret = secret;
    this.description = `Local disk (${root})`;
  }

  sign(method: string, key: string, expires: number) {
    return createHmac('sha256', this.secret).update(`${method}\n${key}\n${expires}`).digest('base64url');
  }

  verify(method: string, key: string, expires: unknown, sig: unknown) {
    const exp = Number(expires);
    if (!Number.isSafeInteger(exp) || exp < Date.now() || typeof sig !== 'string') return false;
    const expected = Buffer.from(this.sign(method, key, exp));
    const supplied = Buffer.from(sig);
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  }

  private url(method: string, key: string, ttl: number) {
    const expires = Date.now() + ttl;
    return `/api/media/${key}?expires=${expires}&sig=${this.sign(method, key, expires)}`;
  }

  path(key: string) {
    assertKey(key);
    return resolve(this.root, key);
  }

  async createUpload(key: string, contentType: string): Promise<UploadTarget> {
    assertKey(key);
    return { url: this.url('PUT', key, UPLOAD_TTL_MS), method: 'PUT', headers: { 'Content-Type': contentType } };
  }

  async readUrl(key: string) {
    assertKey(key);
    // Rounded expiry keeps the URL stable for a while, so browsers can cache it
    const expires = Math.ceil((Date.now() + READ_TTL_MS) / READ_REUSE_MS) * READ_REUSE_MS;
    return `/api/media/${key}?expires=${expires}&sig=${this.sign('GET', key, expires)}`;
  }

  async size(key: string) {
    try {
      return (await stat(this.path(key))).size;
    } catch {
      return null;
    }
  }

  async put(key: string, data: Buffer) {
    const target = this.path(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
  }

  async read(key: string) {
    try {
      return await readFile(this.path(key));
    } catch (err: any) {
      if (err?.code === 'ENOENT') return null;
      throw err;
    }
  }
}

export function decodeCredentials(env: NodeJS.ProcessEnv) {
  if (!env.GCS_CREDENTIALS_BASE64) return null;
  const json = JSON.parse(Buffer.from(env.GCS_CREDENTIALS_BASE64, 'base64').toString('utf8'));
  if (!json.client_email || !json.private_key) throw new Error('GCS_CREDENTIALS_BASE64 must be a base64 service account JSON key');
  return json as { client_email: string; private_key: string; project_id?: string };
}

// GCS when GCS_BUCKET and GCS_CREDENTIALS_BASE64 are set (no gcloud or ADC needed); local disk otherwise.
export function createMediaStorage(secret: string, env = process.env): MediaStorage {
  if (env.GCS_BUCKET) {
    try {
      const credentials = decodeCredentials(env);
      if (credentials) return new GcsStorage(env.GCS_BUCKET, credentials);
      logger.warn('Storage', 'GCS_BUCKET is set without GCS_CREDENTIALS_BASE64. Using local disk for uploads.');
    } catch (err: any) {
      logger.warn('Storage', `Invalid GCS credentials (${err.message}). Using local disk for uploads.`);
    }
  }
  return new LocalStorage(resolve(import.meta.dirname, '../uploads'), secret);
}

// Upload and download routes for the local fallback. Mount under /api/media.
export function createMediaRouter(storage: MediaStorage) {
  const router = Router();
  if (!(storage instanceof LocalStorage)) return router;
  const keyOf = (path: string) => decodeURIComponent(path.replace(/^\//, ''));

  router.put(/.*/, async (req, res) => {
    const key = keyOf(req.path);
    if (!storage.verify('PUT', key, req.query.expires, req.query.sig)) throw new ApiError(403, 'FORBIDDEN', 'Upload URL is invalid or expired');
    if (Number(req.headers['content-length'] ?? 0) > MAX_UPLOAD_BYTES) throw new ApiError(413, 'BODY_TOO_LARGE', 'File exceeds 15 MiB');
    const target = storage.path(key);
    await mkdir(dirname(target), { recursive: true });
    const partial = `${target}.part`;
    let bytes = 0;
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_UPLOAD_BYTES) req.destroy(new Error('File exceeds 15 MiB'));
    });
    await pipeline(req, createWriteStream(partial));
    await rename(partial, target);
    res.status(200).end();
  });

  router.get(/.*/, async (req, res) => {
    const key = keyOf(req.path);
    if (!storage.verify('GET', key, req.query.expires, req.query.sig)) throw new ApiError(403, 'FORBIDDEN', 'Media URL is invalid or expired');
    const size = await storage.size(key);
    if (size === null) throw new ApiError(404, 'NOT_FOUND', 'Media not found');
    const ext = key.split('.').pop() ?? '';
    const type = Object.entries(IMAGE_TYPES).find(([, e]) => e === ext)?.[0] ?? AUDIO_TYPES[ext] ?? 'application/octet-stream';
    // Audio needs byte ranges: iPhones refuse to play (or seek in) a recording that can't be fetched in pieces
    const range = AUDIO_TYPES[ext] ? /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '') : null;
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size) {
        res.status(416).set('Content-Range', `bytes */${size}`).end();
        return;
      }
      res.status(206).set({ 'Content-Type': type, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=21600' });
      await pipeline(createReadStream(storage.path(key), { start, end }), res);
      return;
    }
    res.set({ 'Content-Type': type, 'Content-Length': String(size), 'Cache-Control': 'private, max-age=21600', ...(AUDIO_TYPES[ext] ? { 'Accept-Ranges': 'bytes' } : {}) });
    await pipeline(createReadStream(storage.path(key)), res);
  });

  return router;
}
