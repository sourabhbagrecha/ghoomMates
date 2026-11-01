import { randomUUID } from 'node:crypto';
import { ApiError, object, requireThat } from '../expenses/domain.ts';
import { sniffImageType } from '../artworks/images.ts';
import { claudeReadsImage, type Claude } from '../claude.ts';
import type { Gemini, GeminiPart } from '../gemini.ts';
import { logger } from '../logger.ts';
import type { MediaStorage } from '../storage.ts';
import {
  CLAUDE_REEL_SCHEMA,
  MAX_PROMPT_LENGTH,
  REEL_SCHEMA,
  REEL_SYSTEM,
  candidateLabel,
  normalizePlan,
  planSeconds,
  reelPrompt,
  spread,
  templatePlan,
  upgradeScene,
  type ReelCandidate,
  type ReelFact,
  type ReelPlan,
  type ReelScene,
} from './plan.ts';

/** Only the pool's query is used, so tests can pass a fake `{ pool: { query } }`. */
export type ReelsDb = {
  pool: { query(text: string, values?: unknown[]): Promise<{ rowCount: number | null; rows: any[] }> };
};

export type ReelOptions = {
  // Photos Gemini looks at for one reel
  maxCandidates?: number;
  // Total photo bytes sent to Gemini for one reel (uploads are 2048px JPEGs, a few hundred KB each)
  maxPhotoBytes?: number;
  // Gemini's share of the deadline; Claude gets whatever is left of planBudgetMs
  timeoutMs?: number;
  // Everything the writers may take for one reel, Gemini and the Claude fallback together
  planBudgetMs?: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CANDIDATES = 24;
const MAX_PHOTO_BYTES = 14 * 1024 * 1024;
// One photo larger than this is skipped rather than eating the whole budget
const MAX_ONE_PHOTO_BYTES = 4 * 1024 * 1024;
const PLAN_TIMEOUT_MS = 50_000;
const PLAN_BUDGET_MS = 105_000;
// Claude isn't started with less than this left
const MIN_CLAUDE_MS = 20_000;
const LIST_SIZE = 20;

type PhotoRow = { id: string; object_key: string; size_bytes: number | string | null; caption: string | null; uploader: string | null; created_at: Date };
type ReelRow = { id: string; prompt: string; plan: ReelPlan; source: string; created_by: string; creator: string | null; created_at: Date };

// Who wrote the cut: Gemini, Claude when Gemini failed, or the hand-written template when both did
export type ReelSource = 'gemini' | 'claude' | 'template';

// A scene with fresh read URLs for its photos, in place of their ids
export type PresentedScene = Omit<ReelScene, 'photoIds'> & { photos: { id: string; url: string }[] };

export type Reel = {
  id: string;
  prompt: string;
  plan: Omit<ReelPlan, 'scenes'> & { scenes: PresentedScene[] };
  seconds: number;
  source: ReelSource;
  createdAt: string;
  createdBy: { userId: string; name: string };
};

/** Cuts reels from a trip's photos: Gemini picks, orders and captions them; the app plays the plan with Remotion. */
export class ReelService {
  private db: ReelsDb;
  private storage: MediaStorage;
  private gemini: Gemini;
  private claude: Claude | undefined;
  private maxCandidates: number;
  private maxPhotoBytes: number;
  private timeoutMs: number;
  private planBudgetMs: number;

  constructor(db: ReelsDb, storage: MediaStorage, gemini: Gemini, claude?: Claude, options: ReelOptions = {}) {
    this.db = db;
    this.storage = storage;
    this.gemini = gemini;
    this.claude = claude?.enabled ? claude : undefined;
    this.maxCandidates = options.maxCandidates ?? MAX_CANDIDATES;
    this.maxPhotoBytes = options.maxPhotoBytes ?? MAX_PHOTO_BYTES;
    this.timeoutMs = options.timeoutMs ?? PLAN_TIMEOUT_MS;
    this.planBudgetMs = options.planBudgetMs ?? PLAN_BUDGET_MS;
  }

  // Non-members get 404 so trip ids don't leak.
  async assertMember(tripId: string, userId: string) {
    if (!UUID.test(tripId)) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
    const { rowCount } = await this.db.pool.query('SELECT 1 FROM trip_members WHERE trip_id = $1 AND user_id = $2', [tripId, userId]);
    if (!rowCount) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
  }

  /** The squad's reels, newest first. */
  async list(tripId: string) {
    const { rows } = await this.db.pool.query(
      `SELECT r.id, r.prompt, r.plan, r.source, r.created_by, u.name AS creator, r.created_at
       FROM trip_reels r LEFT JOIN users u ON u.id = r.created_by
       WHERE r.trip_id = $1 ORDER BY r.created_at DESC, r.id LIMIT $2`,
      [tripId, LIST_SIZE],
    );
    return { items: await Promise.all((rows as ReelRow[]).map((row) => this.present(tripId, row))) };
  }

  /** Cuts a reel from { prompt, photoIds? }. photoIds narrows it to the photos someone picked in the viewer. */
  async create(user: { id: string; name: string }, tripId: string, input: unknown): Promise<Reel> {
    const body = object(input);
    const prompt = typeof body.prompt === 'string' ? body.prompt.replace(/\s+/g, ' ').trim() : '';
    requireThat(prompt.length >= 3 && prompt.length <= MAX_PROMPT_LENGTH, `Describe the reel in 3 to ${MAX_PROMPT_LENGTH} characters`);
    const picked = body.photoIds === undefined ? [] : body.photoIds;
    requireThat(Array.isArray(picked) && picked.length <= 100 && picked.every((id) => typeof id === 'string' && UUID.test(id)), 'photoIds must be ids of this trip’s photos');

    const { rows: [trip] } = await this.db.pool.query(
      `SELECT t.name, t.destination, t.start_date, t.end_date,
         (SELECT count(*) FROM trip_members m WHERE m.trip_id = t.id) AS mates,
         (SELECT count(*) FROM trip_photos p WHERE p.trip_id = t.id) AS photos
       FROM trips t WHERE t.id = $1`,
      [tripId],
    );
    const { rows } = await this.db.pool.query(
      `SELECT p.id, p.object_key, p.size_bytes, p.caption, u.name AS uploader, p.created_at
       FROM trip_photos p LEFT JOIN users u ON u.id = p.uploaded_by
       WHERE p.trip_id = $1 ${picked.length ? 'AND p.id = ANY($2::uuid[])' : ''}
       ORDER BY p.created_at, p.id`,
      picked.length ? [tripId, picked] : [tripId],
    );
    const photos = rows as PhotoRow[];
    if (photos.length < 2) {
      throw new ApiError(422, 'NOT_ENOUGH_PHOTOS', picked.length ? 'Pick at least 2 photos for the reel' : 'Add a few more photos to cut a reel');
    }

    const tripName = trip?.name ?? '';
    const started = Date.now();
    const { plan, source } = await this.writePlan(prompt, { name: tripName, destination: trip?.destination ?? '' }, photos, tripFacts(trip));

    const id = randomUUID();
    const { rows: [saved] } = await this.db.pool.query(
      `INSERT INTO trip_reels (id, trip_id, created_by, prompt, plan, source, model)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7) RETURNING created_at`,
      [id, tripId, user.id, prompt, JSON.stringify(plan), source, { gemini: this.gemini.models.smart, claude: this.claude?.model ?? '', template: '' }[source]],
    );
    logger.info('Reels', `${user.name} cut a ${plan.scenes.length}-scene ${plan.style} reel for trip ${tripId} in ${Date.now() - started} ms (${source})`);
    return this.present(tripId, { id, prompt, plan, source, created_by: user.id, creator: user.name, created_at: saved.created_at });
  }

  // Gemini's cut when it can see the photos and answers sensibly, then Claude's from the same photos and prompt, and the
  // template cut when neither can, so a reel always comes out.
  private async writePlan(prompt: string, trip: { name: string; destination: string }, photos: PhotoRow[], facts: ReelFact[] = []): Promise<{ plan: ReelPlan; source: ReelSource }> {
    const all = photos.map(toCandidate);
    const template = () => ({ plan: templatePlan(prompt, all, trip.name, facts), source: 'template' as const });
    if (!this.gemini.enabled && !this.claude) return template();
    const deadline = Date.now() + this.planBudgetMs;
    const fallbackTitle = trip.name ? `${trip.name} reel` : 'Our trip reel';
    const loaded = await this.loadPhotos(spread(photos, this.maxCandidates));

    if (this.gemini.enabled) {
      try {
        const { candidates, parts } = photoParts(loaded);
        if (candidates.length < 2) throw new Error('Could not read enough photos');
        const raw = await this.gemini.json<unknown>({
          system: REEL_SYSTEM,
          prompt: [{ text: reelPrompt(prompt, trip, candidates, facts) }, ...parts],
          schema: REEL_SCHEMA,
          model: this.gemini.models.smart,
          temperature: 0.9,
          timeoutMs: Math.min(this.timeoutMs, deadline - Date.now()),
          label: 'Reels',
        });
        const plan = normalizePlan(raw, candidates, fallbackTitle, facts);
        if (plan) return { plan, source: 'gemini' };
        logger.warn('Reels', 'Gemini’s plan had too few usable scenes');
      } catch (err) {
        logger.warn('Reels', `Gemini could not plan the reel: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const left = deadline - Date.now();
    if (this.claude && left >= MIN_CLAUDE_MS) {
      try {
        // Claude reads JPEG, PNG, WebP and GIF; a HEIC photo is simply left out
        const { candidates, parts } = photoParts(loaded.filter((item) => claudeReadsImage(item.mimeType)));
        if (candidates.length < 2) throw new Error('Could not read enough photos');
        const raw = await this.claude.json<unknown>({
          system: REEL_SYSTEM,
          prompt: [{ text: reelPrompt(prompt, trip, candidates, facts) }, ...parts],
          schema: CLAUDE_REEL_SCHEMA,
          timeoutMs: left,
          label: 'Reels',
        });
        const plan = normalizePlan(raw, candidates, fallbackTitle, facts);
        if (plan) return { plan, source: 'claude' };
        logger.warn('Reels', 'Claude’s plan had too few usable scenes');
      } catch (err) {
        logger.warn('Reels', `Claude could not plan the reel: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    logger.warn('Reels', 'Using the template cut');
    return template();
  }

  // The photos the writers may see, in order. Ones that are missing, too big or not images are skipped, and the rest
  // stop at the byte budget.
  private async loadPhotos(photos: PhotoRow[]): Promise<LoadedPhoto[]> {
    const loaded = await Promise.all(photos.map(async (photo) => {
      if (photo.size_bytes !== null && Number(photo.size_bytes) > MAX_ONE_PHOTO_BYTES) return null;
      const bytes = await this.storage.read(photo.object_key).catch(() => null);
      const mimeType = bytes && bytes.length <= MAX_ONE_PHOTO_BYTES ? sniffImageType(bytes) : null;
      return bytes && mimeType ? { photo, bytes, mimeType } : null;
    }));
    const kept: LoadedPhoto[] = [];
    let budget = this.maxPhotoBytes;
    for (const item of loaded) {
      if (!item || item.bytes.length > budget) continue;
      budget -= item.bytes.length;
      kept.push(item);
    }
    return kept;
  }

  private async present(tripId: string, row: ReelRow): Promise<Reel> {
    const stored = row.plan.scenes.map(upgradeScene);
    const ids = [...new Set(stored.flatMap((scene) => scene.photoIds))];
    const { rows } = ids.length
      ? await this.db.pool.query('SELECT id, object_key FROM trip_photos WHERE trip_id = $1 AND id = ANY($2::uuid[])', [tripId, ids])
      : { rows: [] };
    const urls = new Map(await Promise.all((rows as { id: string; object_key: string }[]).map(async (r) => [r.id, await this.storage.readUrl(r.object_key)] as const)));
    // A photo deleted since the reel was cut simply drops out of it, and so does a photo scene left without one
    const scenes = stored.flatMap(({ photoIds, ...scene }): PresentedScene[] => {
      const photos = photoIds.filter((id) => urls.has(id)).map((id) => ({ id, url: urls.get(id)! }));
      if ((scene.kind === 'photo' || scene.kind === 'collage') && !photos.length) return [];
      return [{ ...scene, kind: scene.kind === 'collage' && photos.length === 1 ? 'photo' : scene.kind, photos }];
    });
    const plan = { ...row.plan, scenes };
    return {
      id: row.id,
      prompt: row.prompt,
      plan,
      seconds: Math.round(planSeconds(plan)),
      source: row.source === 'gemini' || row.source === 'claude' ? row.source : 'template',
      createdAt: new Date(row.created_at).toISOString(),
      createdBy: { userId: row.created_by, name: row.creator ?? 'A mate' },
    };
  }
}

type LoadedPhoto = { photo: PhotoRow; bytes: Buffer; mimeType: string };

// Each photo after a numbered label, numbered from 1 in the order given
function photoParts(loaded: LoadedPhoto[]) {
  const candidates: ReelCandidate[] = [];
  const parts: GeminiPart[] = [];
  for (const item of loaded) {
    const candidate = toCandidate(item.photo);
    candidates.push(candidate);
    parts.push({ text: candidateLabel(candidate, candidates.length) }, { inlineData: { mimeType: item.mimeType, data: item.bytes.toString('base64') } });
  }
  return { candidates, parts };
}

type TripRow = { start_date: Date | string | null; end_date: Date | string | null; mates: number | string; photos: number | string } | undefined;

/** True numbers about the trip for the stats scene: mates, days and photos, where there is something to count. */
export function tripFacts(trip: TripRow): ReelFact[] {
  if (!trip) return [];
  const facts: ReelFact[] = [];
  const mates = Number(trip.mates);
  if (mates >= 2) facts.push({ value: mates, label: 'mates' });
  if (trip.start_date && trip.end_date) {
    const days = Math.round((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86_400_000) + 1;
    if (days >= 1 && days <= 365) facts.push({ value: days, label: days === 1 ? 'day' : 'days' });
  }
  const photos = Number(trip.photos);
  if (photos >= 1) facts.push({ value: photos, label: photos === 1 ? 'photo' : 'photos' });
  return facts.length >= 2 ? facts : [];
}

function toCandidate(photo: PhotoRow): ReelCandidate {
  return {
    id: photo.id,
    uploader: photo.uploader ?? 'a mate',
    caption: photo.caption,
    takenOn: new Date(photo.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
  };
}
