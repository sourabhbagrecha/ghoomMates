import { randomUUID } from 'node:crypto';
import { ApiError, integer, object, requireThat, text } from '../expenses/domain.ts';
import type { Database, Pool } from '../db.ts';
import type { MediaStorage } from '../storage.ts';
import type { TripAccess } from './service.ts';

export const REEL_VIBES = ['bollywood', 'chill', 'party', 'cinematic', 'retro'] as const;
export type ReelVibe = (typeof REEL_VIBES)[number];

export const REEL_MUSIC: Record<ReelVibe, string> = {
  bollywood: 'Bollywood beat',
  chill: 'Lo-fi chill',
  party: 'Party anthem',
  cinematic: 'Cinematic swell',
  retro: 'Retro Hindi',
};

// The render pipeline the cloud function will run. Until it exists, each stage takes a fixed slice of time
// after the reel is created, so the app and GhoomMate can show real progress end to end.
export const REEL_STAGES = [
  { id: 'pick', label: 'Picking the best shots', ms: 2500 },
  { id: 'faces', label: 'Spotting the squad', ms: 2500 },
  { id: 'beat', label: 'Syncing to the beat', ms: 2500 },
  { id: 'render', label: 'Rendering your reel', ms: 3500 },
] as const;
export type ReelStageId = (typeof REEL_STAGES)[number]['id'];
export const REEL_RENDER_MS = REEL_STAGES.reduce((sum, s) => sum + s.ms, 0);

const SECONDS_PER_CLIP = 2.5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReelProgress = {
  status: 'rendering' | 'ready';
  stage: ReelStageId | null;
  progress: number;
  stages: { id: ReelStageId; label: string; status: 'done' | 'current' | 'pending' }[];
};

/** Where a reel created `elapsedMs` ago is in the (stubbed) render. */
export function reelProgress(elapsedMs: number): ReelProgress {
  const elapsed = Math.max(0, elapsedMs);
  let start = 0;
  let stage: ReelStageId | null = null;
  const stages = REEL_STAGES.map(({ id, label, ms }) => {
    const end = start + ms;
    const status = elapsed >= end ? 'done' : elapsed >= start ? 'current' : 'pending';
    if (status === 'current') stage = id;
    start = end;
    return { id, label, status } as const;
  });
  const progress = Math.min(1, Math.round((elapsed / REEL_RENDER_MS) * 100) / 100);
  return { status: stage ? 'rendering' : 'ready', stage, progress, stages };
}

/** `count` items spread evenly across `items`, keeping their order. */
export function spread<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, i) => items[Math.floor((i * items.length) / count)]);
}

type ReelRow = {
  id: string; title: string; prompt: string; vibe: ReelVibe; duration_sec: number; photo_ids: string[];
  featuring: string[]; created_by: string; creator: string; created_at: Date;
};

const SELECT_REEL = `SELECT r.id, r.title, r.prompt, r.vibe, r.duration_sec, r.photo_ids, r.featuring, r.created_by, r.created_at,
    u.name AS creator
  FROM trip_reels r JOIN users u ON u.id = r.created_by`;

export class ReelService {
  private pool: Pool;
  private storage: MediaStorage;

  constructor(database: Database, storage: MediaStorage) {
    this.pool = database.pool;
    this.storage = storage;
  }

  /** Picks photos from the album and starts a render. A repeated idempotency key returns the first reel. */
  async create(access: TripAccess, userId: string, idempotencyKey: string, input: unknown) {
    const body = object(input);
    const title = text(body.title, 'title', 80);
    const prompt = body.prompt === undefined || body.prompt === '' ? '' : text(body.prompt, 'prompt', 500);
    const vibe = (body.vibe ?? 'bollywood') as ReelVibe;
    requireThat(REEL_VIBES.includes(vibe), `vibe must be one of ${REEL_VIBES.join(', ')}`);
    const durationSec = integer(body.durationSec ?? 30, 'durationSec', 10, 90);
    const featuring = body.featuring ?? [];
    requireThat(Array.isArray(featuring) && featuring.every(id => typeof id === 'string' && UUID.test(id)), 'featuring must be a list of member ids');

    if (idempotencyKey) {
      const existing = await this.find(access, 'r.idempotency_key = $2', idempotencyKey);
      if (existing) return existing;
    }

    const { rows: members } = await this.pool.query<{ ledger_member_id: string; user_id: string }>(
      'SELECT ledger_member_id, user_id FROM trip_members WHERE trip_id = $1', [access.trip.id]);
    const uploaders = members.filter(m => featuring.includes(m.ledger_member_id)).map(m => m.user_id);
    requireThat(uploaders.length === featuring.length, 'featuring has someone who is not in this trip');

    const { rows: photos } = await this.pool.query<{ id: string; uploaded_by: string }>(
      'SELECT id, uploaded_by FROM trip_photos WHERE trip_id = $1 ORDER BY created_at, id', [access.trip.id]);
    if (photos.length === 0) throw new ApiError(409, 'NO_PHOTOS', 'Upload some trip photos first, then GhoomMate can cut a reel');
    // Face matching isn't live yet, so "featuring" prefers photos those mates uploaded when there are enough
    const theirs = photos.filter(p => uploaders.includes(p.uploaded_by));
    const pool = theirs.length >= 3 ? theirs : photos;
    const picked = spread(pool, Math.max(1, Math.round(durationSec / SECONDS_PER_CLIP))).map(p => p.id);

    const id = randomUUID();
    // created_at comes from this clock, which also times the render, so DB clock skew cannot stall it
    const { rowCount } = await this.pool.query(
      `INSERT INTO trip_reels (id, trip_id, created_by, title, prompt, vibe, duration_sec, photo_ids, featuring, idempotency_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (trip_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
      [id, access.trip.id, userId, title, prompt, vibe, durationSec, picked, featuring, idempotencyKey || null, new Date()],
    );
    if (!rowCount) return (await this.find(access, 'r.idempotency_key = $2', idempotencyKey))!;
    return this.get(access, id);
  }

  async get(access: TripAccess, reelId: string) {
    requireThat(UUID.test(reelId), 'reelId must be a uuid');
    const reel = await this.find(access, 'r.id = $2', reelId);
    if (!reel) throw new ApiError(404, 'NOT_FOUND', 'Reel not found');
    return reel;
  }

  async list(access: TripAccess, limit = 20) {
    const { rows } = await this.pool.query<ReelRow>(
      `${SELECT_REEL} WHERE r.trip_id = $1 ORDER BY r.created_at DESC, r.id LIMIT $2`, [access.trip.id, limit]);
    return Promise.all(rows.map(r => this.serialise(r)));
  }

  private async find(access: TripAccess, where: string, value: string) {
    const { rows: [row] } = await this.pool.query<ReelRow>(`${SELECT_REEL} WHERE r.trip_id = $1 AND ${where}`, [access.trip.id, value]);
    return row ? this.serialise(row) : null;
  }

  private async serialise(r: ReelRow) {
    const { rows } = await this.pool.query<{ id: string; object_key: string }>(
      'SELECT id, object_key FROM trip_photos WHERE id = ANY($1)', [r.photo_ids]);
    const keys = new Map(rows.map(p => [p.id, p.object_key]));
    const photos = await Promise.all(r.photo_ids.filter(id => keys.has(id)).map(async id => ({ id, url: await this.storage.readUrl(keys.get(id)!) })));
    return {
      id: r.id,
      title: r.title,
      prompt: r.prompt,
      vibe: r.vibe,
      music: REEL_MUSIC[r.vibe] ?? REEL_MUSIC.bollywood,
      durationSec: r.duration_sec,
      featuring: r.featuring,
      clips: photos.length,
      photos,
      coverUrl: photos[0]?.url ?? null,
      createdBy: { userId: r.created_by, name: r.creator },
      createdAt: r.created_at.toISOString(),
      ...reelProgress(Date.now() - r.created_at.getTime()),
    };
  }
}

export type Reel = Awaited<ReturnType<ReelService['get']>>;
