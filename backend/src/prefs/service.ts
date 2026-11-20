// Vibe Swipe storage: answers in pref_answers, the re-scored taste on users.preferences, and the trip deck with the
// squad's likes. Who said no is never read out of the database into a response: nopes only count towards ordering.
import { ApiError, object, requireThat } from '../expenses/domain.ts';
import { transaction, type ClientSession, type Database } from '../db.ts';
import type { AnswersResponse, MeResponse, PrefAnswerDoc, ResetResponse, StoredTaste, TasteSummary, TripDeckResponse } from './contract.ts';
import { orderTripDeck, type SquadTally } from './order.ts';
import { CARD_ORDER, CARDS, CORE_DECK, deckForCity, snapshot, tripCity } from './registry.ts';
import {
  AXES, DIETS, confidenceOf, overallConfidence, personaFor, scoreAnswers, styleConfidenceOf, styleOf, tasteFromVibe, topTags, vibeOf,
  type Answer, type Card, type Fan, type Taste, type Vibe,
} from './taste.ts';
import { parseAnswers } from './validate.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORE_BY_ID = new Map(CORE_DECK.map(card => [card.id, card]));

const isObject = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** A complete 0–1 vibe (the old 8-card quiz result), else null */
export function readLegacyVibe(value: unknown): Vibe | null {
  if (!isObject(value) || !AXES.every(axis => isNumber(value[axis]) && value[axis] >= 0 && value[axis] <= 1)) return null;
  return Object.fromEntries(AXES.map(axis => [axis, value[axis]])) as Vibe;
}

/** users.preferences.taste as stored by this module, or null for anything else (missing, older shapes) */
export function readStoredTaste(value: unknown): StoredTaste | null {
  if (!isObject(value) || value.v !== 2 || !isObject(value.axes) || !isObject(value.style) || !isObject(value.tags)) return null;
  if (!AXES.every(axis => isObject(value.axes[axis]) && isNumber(value.axes[axis].a) && isNumber(value.axes[axis].b))) return null;
  if (!Array.isArray(value.dealbreakers) || !isNumber(value.answered)) return null;
  if (value.diet !== null && !(DIETS as readonly unknown[]).includes(value.diet)) return null;
  return value as StoredTaste;
}

export function summarize(taste: Taste): TasteSummary {
  return {
    vibe: vibeOf(taste),
    confidence: confidenceOf(taste),
    overall: overallConfidence(taste),
    style: styleOf(taste),
    styleConfidence: styleConfidenceOf(taste),
    topTags: topTags(taste),
    dealbreakers: [...taste.dealbreakers],
    diet: taste.diet,
    persona: personaFor(taste),
    answered: taste.answered,
  };
}

const firstName = (name: unknown) => (typeof name === 'string' && name.trim() ? name.trim().split(/\s+/)[0] : 'A mate');

const answerOf = (doc: Pick<PrefAnswerDoc, 'card_id' | 'reply' | 'ms'>): Answer => ({ cardId: doc.card_id, reply: doc.reply, ms: doc.ms });

const byDeckOrder = (x: { card_id: string }, y: { card_id: string }) =>
  (CARD_ORDER.get(x.card_id) ?? Infinity) - (CARD_ORDER.get(y.card_id) ?? Infinity) || x.card_id.localeCompare(y.card_id);

export class PrefsService {
  private database: Database;
  private now: () => Date;

  constructor(database: Database, now: () => Date = () => new Date()) {
    this.database = database;
    this.now = now;
  }

  private get answers() {
    return this.database.db.collection<PrefAnswerDoc>('pref_answers');
  }

  private get users() {
    return this.database.db.collection<{ _id: string; [key: string]: any }>('users');
  }

  /** The trip if you are a member; 404 otherwise, like the trips module, so trip ids don't leak */
  async trip(tripId: string, userId: string) {
    if (!UUID.test(tripId)) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
    const db = this.database.db;
    const [trip, member] = await Promise.all([
      db.collection('trips').findOne({ _id: tripId as any }, { projection: { name: 1, destination: 1 } }),
      db.collection('trip_members').findOne({ trip_id: tripId, user_id: userId }, { projection: { _id: 1 } }),
    ]);
    if (!trip || !member) throw new ApiError(404, 'NOT_FOUND', 'Trip not found');
    const city = tripCity({ destination: trip.destination, name: trip.name });
    return { id: tripId, city, deck: deckForCity(city) };
  }

  private async storedTaste(userId: string, session?: ClientSession) {
    const user = await this.users.findOne({ _id: userId }, { projection: { 'preferences.taste': 1 }, session });
    return readStoredTaste(user?.preferences?.taste);
  }

  async tripDeck(userId: string, tripId: string): Promise<TripDeckResponse['deck']> {
    const { city, deck } = await this.trip(tripId, userId);
    const db = this.database.db;
    const [members, docs, taste] = await Promise.all([
      db.collection('trip_members').find({ trip_id: tripId }, { projection: { user_id: 1 } }).toArray(),
      this.answers.find({ scope: tripId }, { projection: { user_id: 1, card_id: 1, reply: 1, ms: 1 } }).toArray(),
      this.storedTaste(userId),
    ]);
    const mates = new Set(members.map(m => m.user_id as string).filter(id => id !== userId));
    const people = mates.size
      ? await this.users.find({ _id: { $in: [...mates] } }, { projection: { name: 1, 'preferences.colour': 1 } }).toArray()
      : [];
    const person = new Map(people.map(p => [p._id, p]));
    const inDeck = new Set(deck.map(card => card.id));

    const mine = docs.filter(d => d.user_id === userId && inDeck.has(d.card_id)).sort(byDeckOrder);
    const fans = new Map<string, Fan[]>();
    const squad = new Map<string, SquadTally>();
    for (const doc of docs) {
      if (!mates.has(doc.user_id) || !inDeck.has(doc.card_id) || doc.reply.kind === 'skip') continue;
      const tally = squad.get(doc.card_id) ?? { answered: 0, likes: 0 };
      tally.answered++;
      if (doc.reply.kind === 'swipe' && doc.reply.verdict !== 'nope') {
        tally.likes++;
        const who = person.get(doc.user_id);
        const colour = who?.preferences?.colour;
        const fan: Fan = { name: firstName(who?.name), ...(typeof colour === 'string' ? { colour } : {}), verdict: doc.reply.verdict };
        fans.set(doc.card_id, [...(fans.get(doc.card_id) ?? []), fan]);
      }
      squad.set(doc.card_id, tally);
    }

    const answeredIds = new Set(mine.map(d => d.card_id));
    const ordered = orderTripDeck({
      cards: deck.filter(card => !answeredIds.has(card.id)),
      confidence: taste ? confidenceOf(taste) : null,
      myTags: new Set(taste ? Object.keys(taste.tags) : []),
      squad,
    });
    const withFans = (card: Card): Card => ({
      ...card,
      fans: (fans.get(card.id) ?? []).sort((x, y) => (x.verdict === y.verdict ? x.name.localeCompare(y.name) : x.verdict === 'love' ? -1 : 1)),
    });
    return {
      scope: 'trip',
      tripId,
      city,
      cards: [...ordered, ...deck.filter(card => answeredIds.has(card.id))].map(withFans),
      answered: mine.map(answerOf),
      total: deck.length,
    };
  }

  async me(userId: string): Promise<MeResponse> {
    const [taste, core] = await Promise.all([
      this.storedTaste(userId),
      this.answers.find({ user_id: userId, scope: 'core' }, { projection: { card_id: 1, reply: 1, ms: 1 } }).toArray(),
    ]);
    return {
      taste,
      summary: taste ? summarize(taste) : null,
      answers: { core: core.filter(d => CORE_BY_ID.has(d.card_id)).sort(byDeckOrder).map(answerOf) },
    };
  }

  /**
   * Re-scores every answer you have stored (core and every trip) from scratch, in a fixed order. An old 8-card quiz
   * result is the starting evidence (about four cards' worth per axis), so one swipe doesn't wipe it out; it is kept
   * as preferences.vibe_legacy the first time a taste is written, and dropped when you retake the core deck.
   */
  private async score(userId: string, session: ClientSession, legacy: Vibe | null): Promise<Taste> {
    const docs = await this.answers.find({ user_id: userId }, { projection: { scope: 1, card_id: 1, reply: 1, ms: 1 }, session }).toArray();
    docs.sort((x, y) => Number(x.scope !== 'core') - Number(y.scope !== 'core') || x.scope.localeCompare(y.scope) || byDeckOrder(x, y));
    return scoreAnswers(CARDS, docs.map(answerOf), legacy ? tasteFromVibe(legacy) : undefined);
  }

  /** Your preferences as they are before this write */
  private async preferencesOf(userId: string, session: ClientSession): Promise<Record<string, any>> {
    const user = await this.users.findOne({ _id: userId }, { projection: { preferences: 1 }, session });
    return isObject(user?.preferences) ? user.preferences : {};
  }

  /** The old quiz vibe to start from: the one kept at the first write, else (no taste yet) the current vibe */
  private static legacyOf(prefs: Record<string, any>): Vibe | null {
    return readLegacyVibe(prefs.vibe_legacy) ?? (readStoredTaste(prefs.taste) ? null : readLegacyVibe(prefs.vibe));
  }

  /** Writes the taste with dot paths, so every other preference (colour, …) stays. A taste with no evidence yet (only
   * skips) leaves vibe and persona alone rather than flattening an older vibe to 0.5 everywhere. */
  private async writeTaste(userId: string, taste: Taste, session: ClientSession, legacy: Vibe | null = null): Promise<StoredTaste> {
    const now = this.now();
    const stored: StoredTaste = { ...taste, updatedAt: now.toISOString() };
    const set: Record<string, unknown> = { 'preferences.taste': stored, updated_at: now };
    if (legacy) set['preferences.vibe_legacy'] = legacy;
    if (taste.answered > 0) {
      set['preferences.vibe'] = vibeOf(taste);
      set['preferences.persona'] = personaFor(taste).name;
    }
    if (taste.diet !== null) set['preferences.diet'] = taste.diet;
    await this.users.updateOne({ _id: userId }, { $set: set }, { session });
    return stored;
  }

  async saveAnswers(userId: string, body: unknown): Promise<AnswersResponse & { saved: number; scope: string }> {
    const input = object(body);
    requireThat(input.scope === 'core' || input.scope === 'trip', 'scope must be core or trip');
    let scope = 'core';
    let deck = CORE_DECK;
    if (input.scope === 'trip') {
      requireThat(typeof input.tripId === 'string' && input.tripId.length > 0, 'tripId is required for trip answers');
      const trip = await this.trip(input.tripId, userId);
      scope = trip.id;
      deck = trip.deck;
    }
    const byId = new Map(deck.map(card => [card.id, card]));
    const answers = parseAnswers(input.answers, byId, input.scope === 'core' ? 'core' : 'trip’s');

    const taste = await transaction(this.database, async (session) => {
      const now = this.now();
      const legacy = PrefsService.legacyOf(await this.preferencesOf(userId, session));
      await this.answers.bulkWrite(answers.map(answer => {
        const card = byId.get(answer.cardId)!;
        return {
          updateOne: {
            filter: { user_id: userId, scope, card_id: card.id },
            update: {
              $set: { format: card.format, reply: answer.reply, ms: answer.ms, card: snapshot(card), updated_at: now },
              $setOnInsert: { created_at: now },
            },
            upsert: true,
          },
        };
      }), { session });
      return this.writeTaste(userId, await this.score(userId, session, legacy), session, legacy);
    });
    return { taste, summary: summarize(taste), saved: answers.length, scope };
  }

  async resetCore(userId: string, body: unknown): Promise<ResetResponse> {
    requireThat(object(body).scope === 'core', 'scope must be core: only the core deck can be retaken');
    return transaction(this.database, async (session) => {
      const prefs = await this.preferencesOf(userId, session);
      await this.answers.deleteMany({ user_id: userId, scope: 'core' }, { session });
      // A retake starts fresh: the old quiz result goes too
      const taste = await this.score(userId, session, null);
      const unset: Record<string, ''> = { 'preferences.vibe_legacy': '' };
      // A diet that only came from the deleted answers goes with them (one set elsewhere stays)
      const oldDiet = readStoredTaste(prefs.taste)?.diet ?? null;
      if (taste.diet === null && oldDiet !== null && prefs.diet === oldDiet) unset['preferences.diet'] = '';
      if (taste.answered === 0) {
        // Nothing left to go on: you are back to "hasn't taken the quiz" everywhere
        Object.assign(unset, { 'preferences.taste': '', 'preferences.vibe': '', 'preferences.persona': '' });
        await this.users.updateOne({ _id: userId }, { $unset: unset, $set: { updated_at: this.now() } }, { session });
        return { taste: null, summary: null };
      }
      await this.users.updateOne({ _id: userId }, { $unset: unset }, { session });
      const stored = await this.writeTaste(userId, taste, session);
      return { taste: stored, summary: summarize(stored) };
    });
  }
}
