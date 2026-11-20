import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '../expect.ts';
import type { Database } from '../../src/db.ts';
import { ApiError } from '../../src/http.ts';
import type { User } from '../../src/auth/types.ts';
import { createPrefsApp } from '../../src/prefs/app.ts';
import { DECKS } from '../../src/prefs/registry.ts';
import { personaFor, vibeOf } from '../../src/prefs/taste.ts';
import { mount, serve } from '../helpers.ts';
import { testDatabase } from '../mongo.ts';

let db: Database;
let server: Awaited<ReturnType<typeof serve>>;
let offline: Awaited<ReturnType<typeof serve>>;
const users = new Map<string, User>();
const LEGACY_VIBE = { adventure: 0.9, food: 0.2, nightlife: 0.1, culture: 0.8, chill: 0.4, shops: 0.3 };

async function createUser(name: string, preferences: Record<string, unknown> = {}) {
  const id = `usr_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const email = `${id}@test.local`;
  const now = new Date();
  await db.db.collection('users').insertOne({
    _id: id as any, username: id, google_id: id, email, email_verified: true, name, picture: null, preferences,
    created_at: now, updated_at: now, last_login_at: now,
  });
  users.set(id, { id, email, name, username: id, preferences, googleId: id, emailVerified: true, createdAt: '', updatedAt: '', lastLoginAt: '' });
  return id;
}

/** A trip straight into the collections the trips module owns, with these members */
async function createTrip(destination: string, memberIds: string[], name = 'Squad trip') {
  const id = randomUUID();
  await db.db.collection('trips').insertOne({
    _id: id as any, name, destination, group_name: name, invite_code: randomUUID(), expense_group_id: randomUUID(), created_at: new Date(),
  });
  await db.db.collection('trip_members').insertMany(memberIds.map((userId, i) => ({
    trip_id: id, user_id: userId, ledger_member_id: randomUUID(), role: i === 0 ? 'organiser' : 'mate', joined_at: new Date(),
  })));
  return id;
}

before(async () => {
  db = await testDatabase();
  const authenticate = async (token: string) => {
    const user = users.get(token);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Bad token');
    return user;
  };
  server = await serve(mount('/api/prefs', createPrefsApp({ db, authenticate })));
  offline = await serve(mount('/api/prefs', createPrefsApp()));
});

after(async () => {
  await server.close();
  await offline.close();
});

async function call(token: string | null, path: string, body?: unknown, target = server) {
  const response = await target.request(`/api/prefs${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() as any };
}

const answer = (token: string, answers: unknown[], extra: Record<string, unknown> = { scope: 'core' }) =>
  call(token, '/answers', { ...extra, answers });
const swipe = (cardId: string, verdict: 'nope' | 'like' | 'love', ms = 3000) => ({ cardId, reply: { kind: 'swipe', verdict }, ms });
const choose = (cardId: string, optionIds: string[], ms = 3000) => ({ cardId, reply: { kind: 'choose', optionIds }, ms });
const skip = (cardId: string) => ({ cardId, reply: { kind: 'skip' }, ms: 0 });

const prefsOf = async (userId: string) => ((await db.db.collection('users').findOne({ _id: userId as any })) as any).preferences;
const storedAnswers = (userId: string) => db.db.collection('pref_answers').find({ user_id: userId }).sort({ card_id: 1 }).toArray();

describe('access', () => {
  test('the core deck is public, with or without a database', async () => {
    for (const target of [server, offline]) {
      const { status, data } = await call(null, '/deck/core', undefined, target);
      expect(status).toBe(200);
      expect(data.deck.scope).toBe('core');
      expect(data.deck.cards.map((c: any) => c.id)).toEqual(DECKS.core.map(c => c.id));
    }
  });

  test('everything else is 503 without a database and 401 without a token', async () => {
    const token = await createUser('Offline Olu');
    expect((await call(token, '/me', undefined, offline)).data.error.code).toBe('SERVICE_UNAVAILABLE');
    expect((await call(token, '/answers', { scope: 'core', answers: [] }, offline)).status).toBe(503);
    expect((await call(token, `/trips/${randomUUID()}/deck`, undefined, offline)).status).toBe(503);

    for (const [path, body] of [['/me'], ['/answers', { scope: 'core', answers: [swipe('core:homestay', 'like')] }], [`/trips/${randomUUID()}/deck`], ['/reset', { scope: 'core' }]] as const) {
      const { status, data } = await call(null, path, body);
      expect(status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    }
    expect((await call('not-a-user', '/me')).status).toBe(401);
    expect((await call(token, '/nowhere')).status).toBe(404);
  });
});

describe('answers', () => {
  test('bad answers are 400s with the validation envelope', async () => {
    const me = await createUser('Valid Vee');
    const bad: unknown[] = [
      { answers: [swipe('core:homestay', 'like')] },
      { scope: 'everything', answers: [swipe('core:homestay', 'like')] },
      { scope: 'core', answers: [] },
      { scope: 'core', answers: Array.from({ length: 61 }, () => skip('core:pace')) },
      { scope: 'core', answers: [swipe('core:nope-not-a-card', 'like')] },
      { scope: 'core', answers: [swipe('exp:baga-night-out', 'like')] },
      { scope: 'core', answers: [swipe('core:homestay', 'meh' as any)] },
      { scope: 'core', answers: [swipe('core:pace', 'like')] },
      { scope: 'core', answers: [choose('core:homestay', ['homestay'])] },
      { scope: 'core', answers: [choose('core:fort-or-beach-club', ['fort', 'beach-club'])] },
      { scope: 'core', answers: [choose('core:pace', ['warp-speed'])] },
      { scope: 'core', answers: [choose('core:skip-a-nap', [])] },
      { scope: 'core', answers: [choose('core:skip-a-nap', ['spa', 'spa'])] },
      { scope: 'core', answers: [choose('core:hard-no', ['water', 'none'])] },
      { scope: 'core', answers: [{ cardId: 'core:best-worst-evening', reply: { kind: 'best-worst', best: 'club', worst: 'club' }, ms: 1 }] },
      { scope: 'core', answers: [{ cardId: 'core:best-worst-evening', reply: { kind: 'choose', optionIds: ['club'] }, ms: 1 }] },
      { scope: 'core', answers: [{ cardId: 'core:homestay', reply: { kind: 'shrug' }, ms: 1 }] },
      { scope: 'core', answers: [{ cardId: 'core:homestay', reply: { kind: 'skip' } }] },
      { scope: 'core', answers: [{ cardId: 'core:homestay', reply: { kind: 'skip' }, ms: 'fast' }] },
      { scope: 'trip', answers: [swipe('exp:baga-night-out', 'like')] },
    ];
    for (const body of bad) {
      const { status, data } = await call(me, '/answers', body);
      assert.equal(status, 400, JSON.stringify(body).slice(0, 160));
      expect(data.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await storedAnswers(me)).toEqual([]);
    expect(await prefsOf(me)).toEqual({});
  });

  test('ms is clamped and rounded; a re-answer overwrites; skips are stored', async () => {
    const me = await createUser('Clamp Cal');
    const first = await answer(me, [
      { ...swipe('core:homestay', 'like'), ms: -50 },
      { ...swipe('core:street-food', 'like'), ms: 9_999_999 },
      { ...choose('core:pace', ['full']), ms: 1234.6 },
      skip('core:paragliding'),
    ]);
    expect(first.status).toBe(200);
    let docs = await storedAnswers(me);
    expect(docs.map(d => [d.card_id, d.ms])).toEqual([
      ['core:homestay', 0], ['core:pace', 1235], ['core:paragliding', 0], ['core:street-food', 600_000],
    ]);
    const paragliding = docs.find(d => d.card_id === 'core:paragliding')!;
    expect(paragliding.reply).toEqual({ kind: 'skip' });
    expect(paragliding.scope).toBe('core');
    expect(paragliding.format).toBe('swipe');
    expect(paragliding.card.title).toBe('Paragliding over the valley');
    expect(paragliding.card.kind).toBe('style');
    const createdAt = docs.find(d => d.card_id === 'core:homestay')!.created_at;

    // Same card twice in one request: the last one wins. Answering again later overwrites, keeping created_at.
    await answer(me, [swipe('core:homestay', 'nope'), swipe('core:homestay', 'love', 800)]);
    docs = await storedAnswers(me);
    expect(docs).toHaveLength(4);
    const homestay = docs.find(d => d.card_id === 'core:homestay')!;
    expect(homestay.reply).toEqual({ kind: 'swipe', verdict: 'love' });
    expect(homestay.ms).toBe(800);
    expect(homestay.created_at).toEqual(createdAt);
  });

  test('every save re-scores all your answers and writes taste, vibe, persona and diet, keeping the rest', async () => {
    const me = await createUser('Score Sam', { colour: '#f97316', vibe: LEGACY_VIBE, homeCity: 'Pune' });
    const { status, data } = await answer(me, [
      swipe('core:paragliding', 'love'),
      swipe('core:sunrise-hilltop', 'love'),
      choose('core:diet', ['veg']),
      choose('core:hard-no', ['late-nights']),
    ]);
    expect(status).toBe(200);
    expect(data.taste.v).toBe(2);
    expect(data.taste.answered).toBe(4);
    expect(data.taste.diet).toBe('veg');
    expect(data.taste.dealbreakers).toEqual(['late-nights']);
    expect(typeof data.taste.updatedAt).toBe('string');
    expect(data.summary.answered).toBe(4);
    expect(data.summary.vibe).toEqual(vibeOf(data.taste));
    expect(data.summary.persona).toEqual(personaFor(data.taste));

    const prefs = await prefsOf(me);
    expect(prefs.colour).toBe('#f97316');
    expect(prefs.homeCity).toBe('Pune');
    expect(prefs.diet).toBe('veg');
    expect(prefs.taste).toEqual(data.taste);
    expect(prefs.vibe).toEqual(vibeOf(data.taste));
    expect(prefs.persona).toBe(data.summary.persona.name);
    assert.ok(prefs.vibe.adventure > 0.5);

    // A later save scores everything again, not just the new answers
    const again = await answer(me, [swipe('core:street-food', 'like')]);
    expect(again.data.taste.answered).toBe(5);
    expect(again.data.taste.diet).toBe('veg');
    expect(again.data.taste.axes.adventure).toEqual(data.taste.axes.adventure);
  });

  test('a save with only skips keeps an older vibe and persona', async () => {
    const me = await createUser('Skip Sid', { vibe: LEGACY_VIBE, persona: 'The Culture Vulture' });
    const { status, data } = await answer(me, [skip('core:pace'), skip('core:homestay')]);
    expect(status).toBe(200);
    expect(data.taste.answered).toBe(0);
    const prefs = await prefsOf(me);
    expect(prefs.vibe).toEqual(LEGACY_VIBE);
    expect(prefs.persona).toBe('The Culture Vulture');
    expect(prefs.taste.answered).toBe(0);
    expect(prefs.diet).toBe(undefined);
  });

  test('GET /me returns the stored taste, its summary and your core answers in deck order', async () => {
    const me = await createUser('Me Mo');
    const empty = await call(me, '/me');
    expect(empty.status).toBe(200);
    expect(empty.data).toEqual({ taste: null, summary: null, answers: { core: [] } });

    await answer(me, [swipe('core:homestay', 'like', 2000), choose('core:pace', ['easy'], 1000)]);
    const { data } = await call(me, '/me');
    expect(data.taste.answered).toBe(2);
    expect(data.summary.answered).toBe(2);
    expect(data.answers.core).toEqual([
      { cardId: 'core:pace', reply: { kind: 'choose', optionIds: ['easy'] }, ms: 1000 },
      { cardId: 'core:homestay', reply: { kind: 'swipe', verdict: 'like' }, ms: 2000 },
    ]);
  });
});

describe('trip decks', () => {
  test('only members see a trip’s deck; anyone else gets a 404', async () => {
    const [owner, stranger] = [await createUser('Owner Oz'), await createUser('Stranger Sky')];
    const trip = await createTrip('Udaipur', [owner]);
    expect((await call(stranger, `/trips/${trip}/deck`)).status).toBe(404);
    expect((await call(owner, `/trips/${randomUUID()}/deck`)).status).toBe(404);
    const notAnId = await call(owner, '/trips/not-a-trip/deck');
    expect(notAnId.status).toBe(404);
    expect(notAnId.data.error.code).toBe('NOT_FOUND');
    expect((await answer(stranger, [swipe('exp:pichola-sunset-boat', 'like')], { scope: 'trip', tripId: trip })).status).toBe(404);
    expect(await storedAnswers(stranger)).toEqual([]);
  });

  test('the deck follows the trip’s city: Udaipur, Goa, else the generic deck', async () => {
    const me = await createUser('City Cy');
    const cases: [string, string, string | null, number][] = [
      ['Udaipur, Rajasthan', 'Lakes', 'Udaipur', DECKS.udaipur.length],
      ['North Goa', 'Beach', 'Goa', DECKS.goa.length],
      ['', 'Goa 2026', 'Goa', DECKS.goa.length],
      ['Jaipur', 'Pink city', null, DECKS.generic.length],
    ];
    expect([DECKS.udaipur.length, DECKS.goa.length, DECKS.generic.length]).toEqual([22, 14, 18]);
    for (const [destination, name, city, size] of cases) {
      const trip = await createTrip(destination, [me], name);
      const { status, data } = await call(me, `/trips/${trip}/deck`);
      expect(status).toBe(200);
      expect(data.deck.scope).toBe('trip');
      expect(data.deck.tripId).toBe(trip);
      expect(data.deck.city).toBe(city);
      expect(data.deck.total).toBe(size);
      expect(data.deck.cards).toHaveLength(size);
      expect(data.deck.answered).toEqual([]);
      for (const card of data.deck.cards) expect(card.fans).toEqual([]);
    }
  });

  test('fans show mates who liked or loved a card, never a nope and never you; answered cards go last', async () => {
    const asha = await createUser('Asha Rao');
    const ben = await createUser('Ben Kumar', { colour: '#2563eb' });
    const chen = await createUser('Chen', { colour: '#16a34a' });
    const dev = await createUser('Dev');
    const trip = await createTrip('Udaipur', [asha, ben, chen, dev]);
    const saveTrip = (token: string, answers: unknown[]) => answer(token, answers, { scope: 'trip', tripId: trip });

    expect((await saveTrip(ben, [swipe('exp:pichola-sunset-boat', 'like'), swipe('exp:city-palace-royal-walk', 'nope'), swipe('maker:puran-bhat', 'love')])).status).toBe(200);
    expect((await saveTrip(chen, [swipe('exp:pichola-sunset-boat', 'love'), swipe('exp:city-palace-royal-walk', 'nope')])).status).toBe(200);
    expect((await saveTrip(dev, [skip('exp:pichola-sunset-boat'), swipe('maker:puran-bhat', 'nope')])).status).toBe(200);
    expect((await saveTrip(asha, [swipe('exp:menar-bird-village', 'like', 1200), swipe('maker:puran-bhat', 'nope')])).status).toBe(200);

    const { status, data } = await call(asha, `/trips/${trip}/deck`);
    expect(status).toBe(200);
    const deck = data.deck;
    const byId = new Map<string, any>(deck.cards.map((c: any) => [c.id, c]));
    expect(byId.get('exp:pichola-sunset-boat').fans).toEqual([
      { name: 'Chen', colour: '#16a34a', verdict: 'love' },
      { name: 'Ben', colour: '#2563eb', verdict: 'like' },
    ]);
    expect(byId.get('exp:city-palace-royal-walk').fans).toEqual([]);
    expect(byId.get('maker:puran-bhat').fans).toEqual([{ name: 'Ben', colour: '#2563eb', verdict: 'love' }]);
    expect(byId.get('exp:menar-bird-village').fans).toEqual([]);

    // My two answers come last, in deck order, and nothing in the response says who said no
    expect(deck.cards.slice(-2).map((c: any) => c.id)).toEqual(['exp:menar-bird-village', 'maker:puran-bhat']);
    expect(deck.answered).toEqual([
      { cardId: 'exp:menar-bird-village', reply: { kind: 'swipe', verdict: 'like' }, ms: 1200 },
      { cardId: 'maker:puran-bhat', reply: { kind: 'swipe', verdict: 'nope' }, ms: 3000 },
    ]);
    const others = JSON.stringify(deck.cards);
    assert.ok(!others.includes('nope'), 'a nope leaked into the cards');
    assert.ok(!others.includes('Dev'), 'Dev only skipped and noped, so he is never named');

    // Ben sees Asha's like (no colour set) and Chen's love, never his own
    const benDeck = (await call(ben, `/trips/${trip}/deck`)).data.deck;
    const benById = new Map<string, any>(benDeck.cards.map((c: any) => [c.id, c]));
    expect(benById.get('exp:menar-bird-village').fans).toEqual([{ name: 'Asha', verdict: 'like' }]);
    expect(benById.get('exp:pichola-sunset-boat').fans).toEqual([{ name: 'Chen', colour: '#16a34a', verdict: 'love' }]);
    expect(benDeck.cards.slice(-3).map((c: any) => c.id)).toEqual(['exp:pichola-sunset-boat', 'exp:city-palace-royal-walk', 'maker:puran-bhat']);
  });

  test('trip answers are stored per trip with a snapshot, count in your taste, and stay out of /me', async () => {
    const me = await createUser('Trip Tara');
    const trip = await createTrip('Goa', [me]);
    expect((await answer(me, [choose('core:pace', ['full'])])).status).toBe(200);
    const core = await answer(me, [swipe('core:homestay', 'like')], { scope: 'trip', tripId: trip });
    expect(core.status).toBe(400);
    const udaipurCard = await answer(me, [swipe('exp:pichola-sunset-boat', 'like')], { scope: 'trip', tripId: trip });
    expect(udaipurCard.status).toBe(400);

    const { status, data } = await answer(me, [swipe('exp:baga-night-out', 'love')], { scope: 'trip', tripId: trip });
    expect(status).toBe(200);
    expect(data.taste.answered).toBe(2);
    assert.ok(data.summary.vibe.nightlife > 0.5);

    const doc = (await storedAnswers(me)).find(d => d.card_id === 'exp:baga-night-out')!;
    expect(doc.scope).toBe(trip);
    expect(doc.card.city).toBe('Goa');
    expect(doc.card.kind).toBe('experience');
    expect(doc.card.place.priceRupees).toBe(1999);

    const mine = (await call(me, '/me')).data;
    expect(mine.answers.core.map((a: any) => a.cardId)).toEqual(['core:pace']);
    expect(mine.taste.answered).toBe(2);
  });
});

describe('reset', () => {
  test('retaking the core deck clears core answers and re-scores from what is left', async () => {
    const me = await createUser('Reset Ria', { colour: '#000000' });
    const trip = await createTrip('Udaipur', [me]);
    await answer(me, [choose('core:diet', ['vegan']), swipe('core:paragliding', 'love')]);
    await answer(me, [swipe('exp:pichola-sunset-boat', 'love')], { scope: 'trip', tripId: trip });

    expect((await call(me, '/reset', { scope: 'trip' })).status).toBe(400);
    expect((await call(me, '/reset', {})).status).toBe(400);

    const { status, data } = await call(me, '/reset', { scope: 'core' });
    expect(status).toBe(200);
    expect(data.taste.answered).toBe(1);
    expect(data.taste.diet).toBe(null);
    expect(data.summary.answered).toBe(1);
    expect((await storedAnswers(me)).map(d => d.card_id)).toEqual(['exp:pichola-sunset-boat']);
    const prefs = await prefsOf(me);
    expect(prefs.taste.answered).toBe(1);
    expect(prefs.vibe).toEqual(vibeOf(data.taste));
    expect(prefs.colour).toBe('#000000');
    // The diet you told us before stays until you answer the diet card again
    expect(prefs.diet).toBe('vegan');
  });

  test('with nothing left, the taste goes and the last vibe stays', async () => {
    const me = await createUser('Blank Bo');
    await answer(me, [swipe('core:street-food', 'love')]);
    const vibe = (await prefsOf(me)).vibe;
    assert.ok(vibe);

    const { status, data } = await call(me, '/reset', { scope: 'core' });
    expect(status).toBe(200);
    expect(data).toEqual({ taste: null, summary: null });
    const prefs = await prefsOf(me);
    expect(prefs.taste).toBe(undefined);
    expect(prefs.vibe).toEqual(vibe);
    expect(await storedAnswers(me)).toEqual([]);
    expect((await call(me, '/me')).data).toEqual({ taste: null, summary: null, answers: { core: [] } });
  });
});
