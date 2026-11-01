import { randomUUID } from 'node:crypto';
import { ApiError, object, requireThat } from '../expenses/domain.ts';
import { GeminiError, type Gemini, type InlineData } from '../gemini.ts';
import { logger } from '../logger.ts';
import { IMAGE_TYPES, type MediaStorage } from '../storage.ts';
import { countPeople, describeCast, type Cast } from './cast.ts';
import { sniffImageType } from './images.ts';
import { ARTWORK_STYLE_IDS, artworkPrompt, artworkStyle, type ArtworkStyle } from './styles.ts';

/** Only the pool's query is used, so tests can pass a fake `{ pool: { query } }`. */
export type ArtworksDb = {
  pool: { query(text: string, values?: unknown[]): Promise<{ rowCount: number | null; rows: any[] }> };
};

export type ArtworkOptions = {
  // Paintings per trip in any rolling 24 hours (ARTWORKS_PER_TRIP_PER_DAY)
  dailyLimit?: number;
  // Everything the painter does for one request, cast list included
  timeoutMs?: number;
  maxPhotoBytes?: number;
  // Waits before each retry when Vertex answers "resource exhausted" (shared quota hiccups are usually short)
  retryDelaysMs?: number[];
};

export const DEFAULT_DAILY_LIMIT = 10;
export const PAINT_TIMEOUT_MS = 90_000;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
// A second painting only starts when at least this much of the deadline is left
const CHECK_BUDGET_MS = 30_000;
const GALLERY_SIZE = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PhotoRow = { id: string; object_key: string; size_bytes: number | string | null };
type ArtworkRow = { id: string; photo_id: string | null; style: string; object_key: string; created_by: string; creator: string | null; created_at: Date };

export type Artwork = {
  id: string;
  style: string;
  styleName: string;
  url: string;
  createdAt: string;
  photoId: string | null;
  createdBy: { userId: string; name: string };
};

export type ArtworkLimit = { perDay: number; used: number; remaining: number };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const inline = (data: Buffer): InlineData => ({ mimeType: sniffImageType(data) ?? 'image/png', data: data.toString('base64') });

// A hard stop for an image call that ignores its own timeout.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new GeminiError(`Gemini timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// What went wrong while painting, in words the app can show and with a code it can react to (it falls back to a
// framed copy of the original photo for all of these).
function paintError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const status = err instanceof GeminiError ? err.status : undefined;
  if (/timed out/i.test(message)) return new ApiError(504, 'ARTWORK_TIMEOUT', 'The painter is taking too long. Try again in a moment.');
  if (status === 429 || status === 401 || status === 403 || status === 404 || /GEMINI_API_KEY|credentials/i.test(message)) {
    return new ApiError(503, 'ARTWORK_UNAVAILABLE', 'The painters are busy right now. Try again in a minute.');
  }
  if (/safety|prohibited|blocked|recitation/i.test(message)) {
    return new ApiError(422, 'ARTWORK_BLOCKED', 'The painter couldn’t work from that photo. Try another one.');
  }
  return new ApiError(502, 'ARTWORK_FAILED', 'The painter couldn’t finish this one. Try again, or pick another photo.');
}

/** Paints trip photos in Udaipur's painting traditions with Gemini and keeps the results as the squad's gallery. */
export class ArtworkService {
  private db: ArtworksDb;
  private storage: MediaStorage;
  private gemini: Gemini;
  private dailyLimit: number;
  private timeoutMs: number;
  private maxPhotoBytes: number;
  private retryDelaysMs: number[];
  // Paintings being made right now per trip, so a burst of requests can't slip past the daily limit
  private inflight = new Map<string, number>();
  // Who is in each photo, so painting it in a second style skips the look at the photo
  private casts = new Map<string, Cast>();

  constructor(db: ArtworksDb, storage: MediaStorage, gemini: Gemini, options: ArtworkOptions = {}) {
    this.db = db;
    this.storage = storage;
    this.gemini = gemini;
    this.dailyLimit = options.dailyLimit ?? DEFAULT_DAILY_LIMIT;
    this.timeoutMs = options.timeoutMs ?? PAINT_TIMEOUT_MS;
    this.maxPhotoBytes = options.maxPhotoBytes ?? MAX_PHOTO_BYTES;
    this.retryDelaysMs = options.retryDelaysMs ?? [3_000, 6_000];
  }

  // Non-members get 404 so trip ids don't leak.
  async assertMember(tripId: string, userId: string) {
    if (!UUID.test(tripId)) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
    const { rowCount } = await this.db.pool.query('SELECT 1 FROM trip_members WHERE trip_id = $1 AND user_id = $2', [tripId, userId]);
    if (!rowCount) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
  }

  async limit(tripId: string): Promise<ArtworkLimit> {
    const { rows: [row] } = await this.db.pool.query(
      `SELECT count(*) AS n FROM trip_artworks WHERE trip_id = $1 AND created_at > now() - interval '24 hours'`,
      [tripId],
    );
    const used = Number(row?.n ?? 0);
    return { perDay: this.dailyLimit, used, remaining: Math.max(0, this.dailyLimit - used - (this.inflight.get(tripId) ?? 0)) };
  }

  /** The squad's paintings, newest first, with fresh read URLs. */
  async list(tripId: string) {
    const { rows } = await this.db.pool.query(
      `SELECT a.id, a.photo_id, a.style, a.object_key, a.created_by, u.name AS creator, a.created_at
       FROM trip_artworks a LEFT JOIN users u ON u.id = a.created_by
       WHERE a.trip_id = $1 ORDER BY a.created_at DESC, a.id LIMIT $2`,
      [tripId, GALLERY_SIZE],
    );
    // One missing object must not empty the whole gallery
    const items = (await Promise.all((rows as ArtworkRow[]).map((row) => this.present(row).catch(() => null)))).filter((item) => item !== null);
    return { items, limit: await this.limit(tripId) };
  }

  /** Paints one of the trip's photos in a style: { id, style, url, createdAt, … }. */
  async create(user: { id: string; name: string }, tripId: string, input: unknown) {
    const body = object(input);
    const style = artworkStyle(body.style);
    requireThat(style, `style must be one of ${ARTWORK_STYLE_IDS.join(', ')}`);
    const photoId = body.photoId;
    requireThat(typeof photoId === 'string' && UUID.test(photoId), 'photoId must be the id of one of this trip’s photos');
    if (!this.gemini.imageEnabled) throw new ApiError(503, 'ARTWORK_UNAVAILABLE', 'Painting isn’t switched on for this server yet.');

    const { rows: photos } = await this.db.pool.query('SELECT id, object_key, size_bytes FROM trip_photos WHERE id = $1 AND trip_id = $2', [photoId, tripId]);
    const photo = photos[0] as PhotoRow | undefined;
    if (!photo) throw new ApiError(404, 'PHOTO_NOT_FOUND', 'That photo is not in this trip');

    const release = await this.reserve(tripId);
    let artwork: Artwork;
    try {
      artwork = await this.makeArtwork(user, tripId, photo, style);
    } finally {
      release();
    }
    return { ...artwork, limit: await this.limit(tripId) };
  }

  private async makeArtwork(user: { id: string; name: string }, tripId: string, photo: PhotoRow, style: ArtworkStyle): Promise<Artwork> {
    const image = await this.loadPhoto(photo);
    const started = Date.now();
    const deadline = started + this.timeoutMs;
    const cast = await this.castOf(photo.id, image);
    let painted = await this.paint(style, image, cast, deadline);
    // The painter sometimes loses a friend (or adds one), so a group painting is counted once and redone once if the count is off
    if (cast && style.checkCount && cast.people >= 3 && deadline - Date.now() > CHECK_BUDGET_MS) {
      const seen = await countPeople(this.gemini, inline(painted.data), 15_000);
      if (seen !== null && seen !== cast.people) {
        logger.info('Artworks', `The ${style.name} shows ${seen} people for a photo of ${cast.people}; painting it once more`);
        const again = await this.paint(style, image, cast, deadline).catch(() => null);
        if (again) {
          const seenAgain = await countPeople(this.gemini, inline(again.data), 15_000);
          if (seenAgain !== null && Math.abs(seenAgain - cast.people) < Math.abs(seen - cast.people)) painted = again;
        }
      }
    }
    const type = sniffImageType(painted.data);
    if (!type) throw new ApiError(502, 'ARTWORK_FAILED', 'The painter returned something that isn’t a picture. Try again.');

    const id = randomUUID();
    const key = `trips/${tripId}/artworks/${id}.${IMAGE_TYPES[type] ?? 'png'}`;
    await this.storage.put(key, painted.data, type);
    const { rows: [saved] } = await this.db.pool.query(
      `INSERT INTO trip_artworks (id, trip_id, photo_id, created_by, style, object_key, content_type, size_bytes, model)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING created_at`,
      [id, tripId, photo.id, user.id, style.id, key, type, painted.data.length, this.gemini.models.image],
    );
    logger.info('Artworks', `${user.name} painted a ${style.name} for trip ${tripId} in ${Date.now() - started} ms (${cast ? `${cast.people} people` : 'no cast list'})`);
    return this.present({ id, photo_id: photo.id, style: style.id, object_key: key, created_by: user.id, creator: user.name, created_at: saved.created_at });
  }

  private async castOf(photoId: string, image: InlineData): Promise<Cast | null> {
    const known = this.casts.get(photoId);
    if (known) return known;
    const cast = await describeCast(this.gemini, image, Math.round(this.timeoutMs / 4));
    if (cast) {
      this.casts.set(photoId, cast);
      if (this.casts.size > 100) this.casts.delete(this.casts.keys().next().value as string);
    }
    return cast;
  }

  private async present(row: ArtworkRow): Promise<Artwork> {
    return {
      id: row.id,
      style: row.style,
      styleName: artworkStyle(row.style)?.name ?? row.style,
      url: await this.storage.readUrl(row.object_key),
      createdAt: new Date(row.created_at).toISOString(),
      photoId: row.photo_id,
      createdBy: { userId: row.created_by, name: row.creator ?? 'A mate' },
    };
  }

  // Counts this painting against the trip's day before anything expensive happens; the returned function gives the slot back.
  private async reserve(tripId: string) {
    const others = this.inflight.get(tripId) ?? 0;
    this.inflight.set(tripId, others + 1);
    const release = () => {
      const left = (this.inflight.get(tripId) ?? 1) - 1;
      if (left > 0) this.inflight.set(tripId, left);
      else this.inflight.delete(tripId);
    };
    try {
      const { used } = await this.limit(tripId);
      if (used + others >= this.dailyLimit) {
        throw new ApiError(429, 'ARTWORK_LIMIT', `Your squad has painted ${this.dailyLimit} miniatures in the last day. The painters are resting; come back tomorrow.`);
      }
    } catch (err) {
      release();
      throw err;
    }
    return release;
  }

  private async loadPhoto(photo: PhotoRow): Promise<InlineData> {
    const tooLarge = () => new ApiError(413, 'PHOTO_TOO_LARGE', `That photo is over ${Math.round(this.maxPhotoBytes / 1024 / 1024)} MB. Pick a smaller one.`);
    const stored = photo.size_bytes === null ? await this.storage.size(photo.object_key) : Number(photo.size_bytes);
    if (stored !== null && stored > this.maxPhotoBytes) throw tooLarge();
    let bytes: Buffer | null;
    try {
      bytes = await this.storage.read(photo.object_key);
    } catch (err) {
      logger.warn('Artworks', `Could not read photo ${photo.id}: ${err instanceof Error ? err.message : String(err)}`);
      throw new ApiError(502, 'ARTWORK_FAILED', 'We couldn’t open that photo. Try again in a moment.');
    }
    if (!bytes) throw new ApiError(404, 'PHOTO_NOT_FOUND', 'That photo is no longer in the album');
    if (bytes.length > this.maxPhotoBytes) throw tooLarge();
    const mimeType = sniffImageType(bytes);
    if (!mimeType) throw new ApiError(415, 'UNSUPPORTED_PHOTO', 'The painter works from JPEG, PNG, WebP or HEIC photos. Pick another one.');
    return { mimeType, data: bytes.toString('base64') };
  }

  // One image call, with the whole request's deadline and a couple of quick retries when the shared quota is full.
  private async paint(style: ArtworkStyle, image: InlineData, cast: Cast | null, deadline: number) {
    const prompt = artworkPrompt(style, cast);
    for (let attempt = 0; ; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw paintError(new GeminiError('Gemini timed out'));
      try {
        return await withTimeout(
          this.gemini.image({ prompt, images: [image], aspectRatio: style.aspectRatio, timeoutMs: remaining, label: 'Artworks' }),
          remaining,
        );
      } catch (err) {
        // Two hiccups are worth another go: the shared quota being full, and the model answering in words only
        const quota = err instanceof GeminiError && err.status === 429;
        const wordsOnly = err instanceof GeminiError && /returned no image/i.test(err.message);
        logger.warn('Artworks', `Painting a ${style.name} failed (attempt ${attempt + 1}): ${err instanceof Error ? err.message.replace(/\s+/g, ' ').slice(0, 200) : String(err)}`);
        if (!(quota || wordsOnly) || attempt >= this.retryDelaysMs.length) throw paintError(err);
        await sleep(wordsOnly ? 0 : this.retryDelaysMs[attempt]);
      }
    }
  }
}
