import { GeminiError, type Gemini } from '../gemini.ts';
import { ApiError } from '../http.ts';
import { SITE_BY_ID, SITES, type HeritageSite } from '../heritage/sites.ts';
import { logger } from '../logger.ts';
import type { MediaStorage } from '../storage.ts';
import { vibeBucket } from './audience.ts';
import { basicStory } from './basic.ts';
import { CURATED } from './curated/index.ts';
import { StoryRejected, generateStory } from './generate.ts';
import { NARRATOR_VOICE, staticNarration, synthesizeStory } from './narration.ts';
import { gradeFor, scoreQuiz, type Grade } from './quiz.ts';
import { narrationHash } from './speech.ts';
import { QUIZ_SIZE, type Audience, type Lang, type NarrationInfo, type Story, type StoryBody } from './types.ts';

/** Only the pool's query is used, so tests can pass a fake `{ pool: { query } }`. */
export type StoriesDb = {
  pool: { query(text: string, values?: unknown[]): Promise<{ rowCount: number | null; rows: any[] }> };
};

export type StoriesOptions = {
  db: StoriesDb;
  storage: MediaStorage;
  gemini: Gemini;
  /** Vertex AI client: records the narration (the API key's free tier allows 10 speech requests a day) and gives stories a second chance when the key is out of quota */
  vertex?: Gemini;
  /** How long a reader waits for a retelling before the classic telling is shown; the retelling carries on and is cached */
  slowMs?: number;
  now?: () => number;
  /** Narration retry waits, shortened in tests */
  retryMs?: number;
};

export type StoryRequest = { siteId: string; lang: Lang; audience: Audience; viewerId?: string | null; tripId?: string | null };

export type NarrationResult = NarrationInfo & { cached: boolean };

export type StampView = { siteId: string; score: number; total: number; grade: Grade; stampedAt: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** After Gemini fails (quota, outage), retellings are skipped for this long so readers get the classic telling at once */
const COOLDOWN_MS = 45_000;

const stampView = (row: { site_id: string; score: number; total: number; stamped_at: Date | string }): StampView => ({
  siteId: row.site_id,
  score: row.score,
  total: row.total,
  grade: gradeFor(row.score, row.total),
  stampedAt: new Date(row.stamped_at).toISOString(),
});

function isStoryBody(value: unknown): value is StoryBody {
  const body = value as StoryBody | null;
  return !!body && typeof body.title === 'string' && Array.isArray(body.panels) && body.panels.length >= 3 && Array.isArray(body.quiz) && body.quiz.length === QUIZ_SIZE
    && body.panels.every(p => typeof p?.heading === 'string' && typeof p.text === 'string' && typeof p.lookFor === 'string')
    && body.quiz.every(q => typeof q?.question === 'string' && Array.isArray(q.options) && q.options.length === 3 && Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < 3);
}

export class StoriesService {
  private db: StoriesDb;
  private storage: MediaStorage;
  private gemini: Gemini;
  private vertex?: Gemini;
  private slowMs: number;
  private now: () => number;
  private retryMs: number;
  private coolUntil = 0;
  private retelling = new Map<string, Promise<StoryBody | null>>();
  private recording = new Map<string, Promise<NarrationResult>>();

  constructor({ db, storage, gemini, vertex, slowMs = 18_000, now = Date.now, retryMs = 12_000 }: StoriesOptions) {
    this.db = db;
    this.storage = storage;
    this.gemini = gemini;
    this.vertex = vertex;
    this.slowMs = slowMs;
    this.now = now;
    this.retryMs = retryMs;
  }

  site(siteId: string): HeritageSite {
    const site = SITE_BY_ID.get(siteId);
    if (!site) throw new ApiError(404, 'NOT_FOUND', 'No story for that place yet');
    return site;
  }

  /** Every site with its story: hand-written ones first, with their painted cover */
  catalogue() {
    return SITES.map((site) => {
      const curated = CURATED.get(site.id);
      return {
        siteId: site.id,
        name: site.name,
        kind: site.kind,
        gem: site.gem,
        curated: !!curated,
        title: curated?.en.title ?? site.name,
        titleHi: curated?.hi.title ?? null,
        art: curated?.art[0] ?? null,
        panels: curated?.en.panels.length ?? 3,
        narrated: { en: !!curated && !!staticNarration(site.id, 'en', curated.en.panels), hi: !!curated && !!staticNarration(site.id, 'hi', curated.hi.panels) },
      };
    }).sort((a, b) => Number(b.curated) - Number(a.curated));
  }

  /* Stories */

  /**
   * The story for a site. Always answers: hand-written when Gemini is off, slow or untrusted.
   * With `generate: false` it only uses stories already written (for narrating or scoring one the reader has seen).
   */
  async story({ siteId, lang, audience, viewerId, tripId }: StoryRequest, { generate = true } = {}): Promise<Story> {
    const site = this.site(siteId);
    const curated = CURATED.get(siteId);
    // The classic telling of a key site is hand-written: instant, no AI, no database
    if (curated && audience === 'classic') return this.curatedStory(site, lang);

    const bucket = await this.bucketFor(tripId, viewerId);
    const cached = await this.readCache(siteId, lang, audience, bucket);
    if (cached) return this.generatedStory(site, lang, audience, bucket, cached);

    if (generate && this.enabled() && this.now() >= this.coolUntil) {
      const retelling = this.retell(site, lang, audience, bucket);
      const body = await Promise.race([retelling, new Promise<null>(resolve => setTimeout(() => resolve(null), this.slowMs).unref())]);
      if (body) return this.generatedStory(site, lang, audience, bucket, body);
    }
    return this.fallbackStory(site, lang);
  }

  private enabled() {
    return this.gemini.enabled || !!this.vertex?.enabled;
  }

  private curatedStory(site: HeritageSite, lang: Lang): Story {
    const curated = CURATED.get(site.id)!;
    const body = curated[lang];
    return {
      siteId: site.id,
      siteName: site.name,
      lang,
      audience: 'classic',
      generated: false,
      vibe: null,
      narration: staticNarration(site.id, lang, body.panels),
      title: body.title,
      panels: body.panels.map((panel, i) => ({ ...panel, art: curated.art[i] })),
      quiz: body.quiz,
      careNote: body.careNote,
    };
  }

  /** What a reader gets when there is no retelling: the hand-written story, or one built from the site's own notes (English) */
  private fallbackStory(site: HeritageSite, lang: Lang): Story {
    if (CURATED.has(site.id)) return this.curatedStory(site, lang);
    return {
      siteId: site.id,
      siteName: site.name,
      lang: 'en',
      audience: 'classic',
      generated: false,
      vibe: null,
      narration: null,
      ...basicStory(site),
    };
  }

  /** A retelling dressed with the site's painted panels (retellings reuse the hand-painted art) */
  private generatedStory(site: HeritageSite, lang: Lang, audience: Audience, bucket: string, body: StoryBody): Story {
    const art = CURATED.get(site.id)?.art ?? [];
    return {
      siteId: site.id,
      siteName: site.name,
      lang,
      audience,
      generated: true,
      vibe: bucket || null,
      narration: null,
      ...body,
      panels: body.panels.map((panel, i) => (art.length ? { ...panel, art: art[Math.min(i, art.length - 1)] } : panel)),
    };
  }

  /** Runs (or joins) the Gemini retelling for this story; resolves null when it can't be done */
  private retell(site: HeritageSite, lang: Lang, audience: Audience, bucket: string): Promise<StoryBody | null> {
    const key = [site.id, lang, audience, bucket].join('|');
    let running = this.retelling.get(key);
    if (!running) {
      running = this.runRetelling(site, lang, audience, bucket).finally(() => this.retelling.delete(key));
      this.retelling.set(key, running);
    }
    return running;
  }

  private async runRetelling(site: HeritageSite, lang: Lang, audience: Audience, bucket: string): Promise<StoryBody | null> {
    const curated = CURATED.get(site.id);
    const seed = [site.id, lang, audience, bucket].join(':');
    const fallbackCare = curated?.[lang].careNote ?? site.care;
    const started = this.now();
    const clients = [this.gemini, this.vertex].filter((client): client is Gemini => !!client?.enabled);
    let outage = false;
    for (const client of clients) {
      try {
        const body = await generateStory(client, { site, lang, audience, bucket, classic: curated?.en }, seed, fallbackCare);
        await this.writeCache(site.id, lang, audience, bucket, body, client.models.smart);
        logger.info('Stories', `Retold ${site.id} (${lang}, ${audience}${bucket ? `, ${bucket}` : ''}) in ${this.now() - started}ms`);
        return body;
      } catch (err) {
        if (err instanceof StoryRejected) {
          logger.warn('Stories', `Retelling of ${site.id} (${lang}, ${audience}) was rejected: ${err.message}`);
          return null;
        }
        outage = true;
        logger.warn('Stories', `Gemini could not retell ${site.id} (${lang}, ${audience}): ${err instanceof GeminiError ? err.message.slice(0, 160) : (err as Error).message}`);
      }
    }
    if (outage) this.coolUntil = this.now() + COOLDOWN_MS;
    return null;
  }

  /** The squad's vibe bucket, when the viewer is a member of the trip */
  private async bucketFor(tripId?: string | null, viewerId?: string | null): Promise<string> {
    if (!tripId || !viewerId || !UUID.test(tripId)) return '';
    try {
      const member = await this.db.pool.query('SELECT 1 FROM trip_members WHERE trip_id = $1 AND user_id = $2', [tripId, viewerId]);
      if (!member.rowCount) return '';
      const { rows } = await this.db.pool.query('SELECT u.preferences FROM trip_members m JOIN users u ON u.id = m.user_id WHERE m.trip_id = $1', [tripId]);
      return vibeBucket(rows.map(row => row.preferences?.vibe));
    } catch (err) {
      logger.warn('Stories', `Could not read the squad's vibe: ${(err as Error).message}`);
      return '';
    }
  }

  private async readCache(siteId: string, lang: Lang, audience: Audience, bucket: string): Promise<StoryBody | null> {
    try {
      const { rows } = await this.db.pool.query(
        'SELECT story FROM story_cache WHERE site_id = $1 AND lang = $2 AND audience = $3 AND vibe_bucket = $4',
        [siteId, lang, audience, bucket],
      );
      return isStoryBody(rows[0]?.story) ? rows[0].story : null;
    } catch (err) {
      logger.warn('Stories', `Story cache unavailable: ${(err as Error).message}`);
      return null;
    }
  }

  private async writeCache(siteId: string, lang: Lang, audience: Audience, bucket: string, story: StoryBody, model: string) {
    try {
      await this.db.pool.query(
        `INSERT INTO story_cache (site_id, lang, audience, vibe_bucket, story, model) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (site_id, lang, audience, vibe_bucket) DO NOTHING`,
        [siteId, lang, audience, bucket, JSON.stringify(story), model],
      );
    } catch (err) {
      logger.warn('Stories', `Could not cache the story: ${(err as Error).message}`);
    }
  }

  /* Narration */

  /** A playable recording of the story as it is shown: shipped, cached, or recorded now by Gemini */
  async narration(request: StoryRequest): Promise<NarrationResult> {
    const story = await this.story(request, { generate: false });
    if (story.narration) return { ...story.narration, cached: true };

    const hash = narrationHash(story.panels, story.lang, NARRATOR_VOICE);
    const bucket = story.vibe ?? '';
    const key = [story.siteId, story.lang, story.audience, bucket, hash].join('|');
    const existing = await this.findNarration(story, bucket, hash);
    if (existing) return existing;

    const recorder = this.vertex?.enabled ? this.vertex : this.gemini.enabled ? this.gemini : null;
    if (!recorder) throw new ApiError(503, 'NARRATION_UNAVAILABLE', 'The storyteller’s voice is not available right now');

    let running = this.recording.get(key);
    if (!running) {
      running = this.record(recorder, story, bucket, hash).finally(() => this.recording.delete(key));
      this.recording.set(key, running);
    }
    return running;
  }

  private async findNarration(story: Story, bucket: string, hash: string): Promise<NarrationResult | null> {
    try {
      const { rows } = await this.db.pool.query(
        `SELECT audio_key, duration_sec, marks FROM story_narrations
         WHERE site_id = $1 AND lang = $2 AND audience = $3 AND vibe_bucket = $4 AND text_hash = $5`,
        [story.siteId, story.lang, story.audience, bucket, hash],
      );
      const row = rows[0];
      if (!row || !Array.isArray(row.marks)) return null;
      return { url: await this.storage.readUrl(row.audio_key), durationSec: Number(row.duration_sec), marks: row.marks.map(Number), source: 'gemini', cached: true };
    } catch (err) {
      logger.warn('Stories', `Narration cache unavailable: ${(err as Error).message}`);
      return null;
    }
  }

  private async record(recorder: Gemini, story: Story, bucket: string, hash: string): Promise<NarrationResult> {
    const started = this.now();
    let joined;
    try {
      joined = await synthesizeStory(recorder, { panels: story.panels, siteName: story.siteName, lang: story.lang, retryMs: this.retryMs });
    } catch (err) {
      logger.warn('Stories', `Could not record ${story.siteId} (${story.lang}): ${(err as Error).message.slice(0, 200)}`);
      throw new ApiError(503, 'NARRATION_UNAVAILABLE', 'The storyteller lost their voice for a moment. Try again shortly.');
    }
    const key = `stories/narration/${story.siteId}/${story.lang}/${story.audience}-${bucket.replace(/[^a-z]+/g, '-') || 'all'}-${hash}.wav`;
    try {
      await this.storage.put(key, joined.wav, 'audio/wav');
    } catch (err) {
      logger.warn('Stories', `Could not store the narration: ${(err as Error).message}`);
      throw new ApiError(503, 'NARRATION_UNAVAILABLE', 'The recording could not be saved. Try again shortly.');
    }
    try {
      await this.db.pool.query(
        `INSERT INTO story_narrations (site_id, lang, audience, vibe_bucket, text_hash, audio_key, duration_sec, marks, voice)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING`,
        [story.siteId, story.lang, story.audience, bucket, hash, key, joined.durationSec, JSON.stringify(joined.marks), NARRATOR_VOICE],
      );
    } catch (err) {
      logger.warn('Stories', `Could not remember the narration: ${(err as Error).message}`);
    }
    logger.info('Stories', `Recorded ${story.siteId} (${story.lang}, ${story.audience}): ${joined.durationSec}s in ${this.now() - started}ms`);
    return { url: await this.storage.readUrl(key), durationSec: joined.durationSec, marks: joined.marks, source: 'gemini', cached: false };
  }

  /* Heritage Passport */

  /** The passport lives in the database; when it is unreachable the reader gets a clear 503 and the app keeps the stamp on the phone */
  private async withPassport<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      logger.warn('Stories', `Passport unavailable: ${(err as Error).message}`);
      throw new ApiError(503, 'PASSPORT_UNAVAILABLE', 'The passport desk is closed for a moment. Try again shortly.');
    }
  }

  private async isMember(tripId: string, userId: string) {
    if (!UUID.test(tripId)) return false;
    const { rowCount } = await this.db.pool.query('SELECT 1 FROM trip_members WHERE trip_id = $1 AND user_id = $2', [tripId, userId]);
    return !!rowCount;
  }

  /** Trip members only; non-members get 404 so trip ids don't leak */
  private async assertMember(tripId: string, userId: string) {
    if (!await this.isMember(tripId, userId)) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
  }

  private async stampsOf(userId: string): Promise<StampView[]> {
    const { rows } = await this.db.pool.query('SELECT site_id, score, total, stamped_at FROM heritage_stamps WHERE user_id = $1 ORDER BY stamped_at', [userId]);
    return rows.filter(row => SITE_BY_ID.has(row.site_id)).map(stampView);
  }

  /** Scores the quiz on the server and stamps the passport of the player and anyone who listened with them (best score kept) */
  async stamp(request: StoryRequest & { viewerId: string; answers: unknown[]; withUserIds?: string[] }) {
    return this.withPassport(() => this.stampNow(request));
  }

  private async stampNow({ siteId, lang, audience, viewerId, tripId, answers, withUserIds = [] }: StoryRequest & { viewerId: string; answers: unknown[]; withUserIds?: string[] }) {
    const story = await this.story({ siteId, lang, audience, viewerId, tripId }, { generate: false });
    const result = scoreQuiz(story.quiz, answers);

    // The squad only counts when you are on that trip; otherwise this is just your own stamp
    const squadTrip = tripId && await this.isMember(tripId, viewerId) ? tripId : null;
    let listeners: string[] = [];
    if (squadTrip) {
      // Only people on the same trip can be stamped along with you
      const { rows } = await this.db.pool.query('SELECT user_id FROM trip_members WHERE trip_id = $1', [squadTrip]);
      const members = new Set(rows.map(row => row.user_id as string));
      listeners = withUserIds.filter(id => members.has(id) && id !== viewerId);
    }
    const recipients = [...new Set([viewerId, ...listeners])];

    const { rows: stamped } = await this.db.pool.query(
      `INSERT INTO heritage_stamps (user_id, site_id, score, total, lang, trip_id)
       SELECT recipient, $2::text, $3::int, $4::int, $5::text, $6::uuid FROM unnest($1::text[]) AS recipient
       ON CONFLICT (user_id, site_id) DO UPDATE SET score = GREATEST(heritage_stamps.score, excluded.score), updated_at = now()
       RETURNING user_id, score, total, (xmax = 0) AS inserted`,
      [recipients, siteId, result.score, result.total, story.lang, squadTrip],
    );
    const mine = stamped.find(row => row.user_id === viewerId);

    const stamps = await this.stampsOf(viewerId);
    return {
      siteId,
      siteName: story.siteName,
      ...result,
      /** The best round you have had here, which can be higher than this one */
      best: mine ? { score: mine.score as number, total: mine.total as number, grade: gradeFor(mine.score, mine.total) } : { score: result.score, total: result.total, grade: result.grade },
      firstTime: !!mine?.inserted,
      stampedWith: listeners.length,
      passport: { stamped: stamps.length, totalSites: SITES.length },
      ...(squadTrip ? { squad: await this.squadAt(squadTrip, siteId) } : {}),
    };
  }

  /** Who in the squad holds the stamp for one site */
  private async squadAt(tripId: string, siteId: string) {
    const { rows } = await this.db.pool.query(
      `SELECT m.ledger_member_id AS member_id, m.user_id, u.name, u.picture, s.score, s.total
       FROM trip_members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN heritage_stamps s ON s.user_id = m.user_id AND s.site_id = $2
       WHERE m.trip_id = $1
       ORDER BY m.joined_at`,
      [tripId, siteId],
    );
    const members = rows.map(row => ({
      memberId: row.member_id as string,
      userId: row.user_id as string,
      name: row.name as string,
      picture: (row.picture ?? null) as string | null,
      stamped: row.score !== null && row.score !== undefined,
    }));
    return { total: members.length, stamped: members.filter(m => m.stamped).length, members };
  }

  /** Your stamps, and the catalogue of every site (stamped or not yet) */
  passport(userId: string) {
    return this.withPassport(() => this.passportNow(userId));
  }

  private async passportNow(userId: string) {
    const stamps = await this.stampsOf(userId);
    const bySite = new Map(stamps.map(stamp => [stamp.siteId, stamp]));
    return {
      totalSites: SITES.length,
      stamped: stamps.length,
      stamps,
      sites: this.catalogue().map(site => ({ ...site, stamp: bySite.get(site.siteId) ?? null })),
    };
  }

  /** The squad's passports: who has which stamp, and a leaderboard */
  tripPassport(tripId: string, userId: string) {
    return this.withPassport(() => this.tripPassportNow(tripId, userId));
  }

  private async tripPassportNow(tripId: string, userId: string) {
    await this.assertMember(tripId, userId);
    const { rows } = await this.db.pool.query(
      `SELECT m.ledger_member_id AS member_id, m.user_id, u.name, u.picture, s.site_id, s.score, s.total, s.stamped_at
       FROM trip_members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN heritage_stamps s ON s.user_id = m.user_id
       WHERE m.trip_id = $1
       ORDER BY m.joined_at, s.stamped_at`,
      [tripId],
    );
    const people = new Map<string, { memberId: string; userId: string; name: string; picture: string | null; stamps: StampView[] }>();
    for (const row of rows) {
      let person = people.get(row.user_id);
      if (!person) {
        person = { memberId: row.member_id, userId: row.user_id, name: row.name, picture: row.picture ?? null, stamps: [] };
        people.set(row.user_id, person);
      }
      if (row.site_id && SITE_BY_ID.has(row.site_id)) person.stamps.push(stampView(row));
    }
    const members = [...people.values()].map(person => ({
      ...person,
      stamped: person.stamps.length,
      points: person.stamps.reduce((sum, stamp) => sum + stamp.score, 0),
    }));
    const leaderboard = [...members]
      .sort((a, b) => b.stamped - a.stamped || b.points - a.points || a.name.localeCompare(b.name))
      .map((member, i) => ({ rank: i + 1, memberId: member.memberId, userId: member.userId, name: member.name, stamped: member.stamped, points: member.points }));
    const bySite: Record<string, string[]> = {};
    for (const member of members) for (const stamp of member.stamps) (bySite[stamp.siteId] ??= []).push(member.memberId);
    return { tripId, totalSites: SITES.length, squadSize: members.length, members, leaderboard, bySite };
  }
}
