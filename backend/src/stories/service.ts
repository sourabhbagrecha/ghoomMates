import type { Database } from '../db.ts';
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

export type StoriesDb = Pick<Database, 'db'>;

export type StoriesOptions = {
  /** Hand-written stories and shipped narration work without one; stamps, the passport and the caches need it */
  db: StoriesDb | undefined;
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

type StampRow = { site_id: string; score: number; total: number; stamped_at: Date | string };

const stampView = (row: StampRow): StampView => ({
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
  private db: StoriesDb | undefined;
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

  // Throws (and so lands in the same fallbacks as a database outage) when there is no database
  private col(name: string) {
    if (!this.db) throw new Error('No database configured');
    return this.db.db.collection(name);
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
      if (!await this.isMember(tripId, viewerId)) return '';
      const members = await this.col('trip_members').find({ trip_id: tripId }, { projection: { user_id: 1 } }).toArray();
      const users = await this.col('users').find({ _id: { $in: members.map(m => m.user_id) } }, { projection: { preferences: 1 } }).toArray();
      return vibeBucket(users.map(user => user.preferences?.vibe));
    } catch (err) {
      logger.warn('Stories', `Could not read the squad's vibe: ${(err as Error).message}`);
      return '';
    }
  }

  private async readCache(siteId: string, lang: Lang, audience: Audience, bucket: string): Promise<StoryBody | null> {
    try {
      const row = await this.col('story_cache').findOne({ site_id: siteId, lang, audience, vibe_bucket: bucket });
      return isStoryBody(row?.story) ? row.story : null;
    } catch (err) {
      logger.warn('Stories', `Story cache unavailable: ${(err as Error).message}`);
      return null;
    }
  }

  private async writeCache(siteId: string, lang: Lang, audience: Audience, bucket: string, story: StoryBody, model: string) {
    try {
      // The first retelling cached wins
      await this.col('story_cache').updateOne(
        { site_id: siteId, lang, audience, vibe_bucket: bucket },
        { $setOnInsert: { story, model, created_at: new Date() } },
        { upsert: true },
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
      const row = await this.col('story_narrations').findOne({ site_id: story.siteId, lang: story.lang, audience: story.audience, vibe_bucket: bucket, text_hash: hash });
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
      await this.col('story_narrations').updateOne(
        { site_id: story.siteId, lang: story.lang, audience: story.audience, vibe_bucket: bucket, text_hash: hash },
        { $setOnInsert: { audio_key: key, duration_sec: joined.durationSec, marks: joined.marks, voice: NARRATOR_VOICE, created_at: new Date() } },
        { upsert: true },
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
    return !!await this.col('trip_members').findOne({ trip_id: tripId, user_id: userId }, { projection: { _id: 1 } });
  }

  /** Trip members only; non-members get 404 so trip ids don't leak */
  private async assertMember(tripId: string, userId: string) {
    if (!await this.isMember(tripId, userId)) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
  }

  private async stampsOf(userId: string): Promise<StampView[]> {
    const rows = await this.col('heritage_stamps').find({ user_id: userId }).sort({ stamped_at: 1, _id: 1 }).toArray();
    return rows.filter(row => SITE_BY_ID.has(row.site_id)).map(row => stampView(row as unknown as StampRow));
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
      const rows = await this.col('trip_members').find({ trip_id: squadTrip }, { projection: { user_id: 1 } }).toArray();
      const members = new Set(rows.map(row => row.user_id as string));
      listeners = withUserIds.filter(id => members.has(id) && id !== viewerId);
    }
    const recipients = [...new Set([viewerId, ...listeners])];

    // One stamp per person per site, keeping the best score; the rest is set only on the first stamp
    const now = new Date();
    const { upsertedIds } = await this.col('heritage_stamps').bulkWrite(recipients.map(userId => ({
      updateOne: {
        filter: { user_id: userId, site_id: siteId },
        update: {
          $max: { score: result.score },
          $set: { updated_at: now },
          $setOnInsert: { total: result.total, lang: story.lang, trip_id: squadTrip, stamped_at: now },
        },
        upsert: true,
      },
    })));
    const firstTime = recipients.indexOf(viewerId) in upsertedIds;

    const stamps = await this.stampsOf(viewerId);
    const mine = stamps.find(stamp => stamp.siteId === siteId);
    return {
      siteId,
      siteName: story.siteName,
      ...result,
      /** The best round you have had here, which can be higher than this one */
      best: mine ? { score: mine.score, total: mine.total, grade: mine.grade } : { score: result.score, total: result.total, grade: result.grade },
      firstTime,
      stampedWith: listeners.length,
      passport: { stamped: stamps.length, totalSites: SITES.length },
      ...(squadTrip ? { squad: await this.squadAt(squadTrip, siteId) } : {}),
    };
  }

  /** Who in the squad holds the stamp for one site */
  private async squadAt(tripId: string, siteId: string) {
    const squad = await this.squadOf(tripId);
    const stamped = new Set((await this.col('heritage_stamps').find({ site_id: siteId, user_id: { $in: squad.map(m => m.userId) } }, { projection: { user_id: 1 } }).toArray()).map(s => s.user_id));
    const members = squad.map(member => ({ ...member, stamped: stamped.has(member.userId) }));
    return { total: members.length, stamped: members.filter(m => m.stamped).length, members };
  }

  /** The trip's members who still have an account, in the order they joined */
  private async squadOf(tripId: string) {
    const members = await this.col('trip_members').find({ trip_id: tripId }).sort({ joined_at: 1, _id: 1 }).toArray();
    const users = await this.col('users').find({ _id: { $in: members.map(m => m.user_id) } }, { projection: { name: 1, picture: 1 } }).toArray();
    const byId = new Map(users.map(u => [u._id as unknown as string, u]));
    return members.filter(m => byId.has(m.user_id)).map(m => {
      const user = byId.get(m.user_id)!;
      return { memberId: m.ledger_member_id as string, userId: m.user_id as string, name: user.name as string, picture: (user.picture ?? null) as string | null };
    });
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
    const squad = await this.squadOf(tripId);
    const people = new Map(squad.map(member => [member.userId, { ...member, stamps: [] as StampView[] }]));
    const rows = await this.col('heritage_stamps').find({ user_id: { $in: [...people.keys()] } }).sort({ stamped_at: 1, _id: 1 }).toArray();
    for (const row of rows) {
      if (SITE_BY_ID.has(row.site_id)) people.get(row.user_id)?.stamps.push(stampView(row as unknown as StampRow));
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
