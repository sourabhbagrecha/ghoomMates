import type { Database } from '../db.ts';
import { ApiError } from '../http.ts';
import { SITE_BY_ID, SITES, type HeritageSite } from '../heritage/sites.ts';
import { logger } from '../logger.ts';
import type { MediaStorage } from '../storage.ts';
import { basicStory } from './basic.ts';
import { CURATED } from './curated/index.ts';
import { staticNarration } from './curated/narration.ts';
import { gradeFor, scoreQuiz, type Grade } from './quiz.ts';
import { readTale, signTale, type Tale } from './tales.ts';
import type { Audience, Lang, Story } from './types.ts';

export type StoriesDb = Pick<Database, 'db'>;

export type StoriesOptions = {
  /** Bundled stories and their narration work without one; prepared tales, stamps and the passport need it */
  db: StoriesDb | undefined;
  storage: MediaStorage;
  /** How long a reader waits for prepared tales before the bundled story is shown (an unreachable database can take 15 s) */
  lookupMs?: number;
};

export type StoryRequest = { siteId: string; lang: Lang; audience: Audience };

export type StampRequest = StoryRequest & { viewerId: string; tripId?: string | null; answers: unknown[]; withUserIds?: string[] };

export type StampView = { siteId: string; score: number; total: number; grade: Grade; stampedAt: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StampRow = { site_id: string; score: number; total: number; stamped_at: Date | string };

const stampView = (row: StampRow): StampView => ({
  siteId: row.site_id,
  score: row.score,
  total: row.total,
  grade: gradeFor(row.score, row.total),
  stampedAt: new Date(row.stamped_at).toISOString(),
});

export class StoriesService {
  private db: StoriesDb | undefined;
  private storage: MediaStorage;
  private lookupMs: number;

  constructor({ db, storage, lookupMs = 3_000 }: StoriesOptions) {
    this.db = db;
    this.storage = storage;
    this.lookupMs = lookupMs;
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

  /** Prepared tales matching a filter; none (logged) when the database is down, slow or the documents are malformed */
  private async tales(filter: Record<string, unknown>): Promise<Tale[]> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const lookup = this.col('heritage_tales').find(filter).toArray();
      lookup.catch(() => undefined);
      const docs = await Promise.race([
        lookup,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`no answer in ${this.lookupMs}ms`)), this.lookupMs);
        }),
      ]);
      return docs.flatMap((doc) => {
        const read = readTale(doc);
        if ('tale' in read) return [read.tale];
        logger.warn('Stories', `Skipping prepared tale ${String(doc._id)} (${doc.site_id}/${doc.lang}/${doc.audience}): ${read.problem}`);
        return [];
      });
    } catch (err) {
      logger.warn('Stories', `Prepared tales unavailable: ${(err as Error).message}`);
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  /** Every site with its story: the ones with a full telling (prepared or bundled) first, with their painted cover */
  async catalogue() {
    const classic = await this.tales({ audience: 'classic' });
    const prepared = (siteId: string, lang: Lang) => classic.find((t) => t.siteId === siteId && t.lang === lang);
    const items = await Promise.all(SITES.map(async (site) => {
      const curated = CURATED.get(site.id);
      const en = prepared(site.id, 'en');
      const hi = prepared(site.id, 'hi');
      const coverKey = (en ?? hi)?.artKeys[0];
      return {
        siteId: site.id,
        city: site.city,
        name: site.name,
        kind: site.kind,
        gem: site.gem,
        curated: !!(en || hi || curated),
        title: en?.body.title ?? curated?.en.title ?? hi?.body.title ?? site.name,
        titleHi: hi?.body.title ?? curated?.hi.title ?? null,
        art: coverKey ? await this.storage.readUrl(coverKey) : curated?.art[0] ?? null,
        panels: (en ?? hi)?.body.panels.length ?? curated?.en.panels.length ?? 3,
        narrated: {
          en: en ? !!en.narration : !!curated && !!staticNarration(site.id, 'en', curated.en.panels),
          hi: hi ? !!hi.narration : !!curated && !!staticNarration(site.id, 'hi', curated.hi.panels),
        },
      };
    }));
    return items.sort((a, b) => Number(b.curated) - Number(a.curated));
  }

  /* Stories */

  /**
   * The story for a site, from what is already prepared: the tale for this language and audience, else the classic one
   * in this language, else the bundled story, else a prepared English one, else one built from the site's notes.
   * `audience` and `lang` in the answer say what the story actually is.
   */
  async story({ siteId, lang, audience }: StoryRequest): Promise<Story> {
    const site = this.site(siteId);
    const tales = await this.tales({ site_id: siteId, lang: { $in: [...new Set<Lang>([lang, 'en'])] }, audience: { $in: [...new Set<Audience>([audience, 'classic'])] } });
    const find = (l: Lang, a: Audience) => tales.find((t) => t.lang === l && t.audience === a);
    const curated = CURATED.get(siteId);

    const tale = find(lang, audience) ?? find(lang, 'classic');
    if (tale) return this.preparedStory(site, tale);
    if (curated) return this.bundledStory(site, lang);
    const english = find('en', 'classic');
    if (english) return this.preparedStory(site, english);
    return { siteId, siteName: site.name, lang: 'en', audience: 'classic', source: 'basic', narration: null, ...basicStory(site) };
  }

  private async preparedStory(site: HeritageSite, tale: Tale): Promise<Story> {
    const { panels, narration } = await signTale(this.storage, tale, CURATED.get(site.id)?.art);
    return {
      siteId: site.id,
      siteName: site.name,
      lang: tale.lang,
      audience: tale.audience,
      source: 'prepared',
      narration,
      ...tale.body,
      careNote: tale.body.careNote || CURATED.get(site.id)?.[tale.lang].careNote || site.care,
      panels,
    };
  }

  private bundledStory(site: HeritageSite, lang: Lang): Story {
    const curated = CURATED.get(site.id)!;
    const body = curated[lang];
    return {
      siteId: site.id,
      siteName: site.name,
      lang,
      audience: 'classic',
      source: 'bundled',
      narration: staticNarration(site.id, lang, body.panels),
      title: body.title,
      panels: body.panels.map((panel, i) => ({ ...panel, art: curated.art[i] })),
      quiz: body.quiz,
      careNote: body.careNote,
    };
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
  async stamp(request: StampRequest) {
    return this.withPassport(() => this.stampNow(request));
  }

  private async stampNow({ siteId, lang, audience, viewerId, tripId, answers, withUserIds = [] }: StampRequest) {
    const story = await this.story({ siteId, lang, audience });
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
      sites: (await this.catalogue()).map(site => ({ ...site, stamp: bySite.get(site.siteId) ?? null })),
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
