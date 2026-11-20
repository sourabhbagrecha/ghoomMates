import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '../expect.ts';
import type { PrefAnswerDoc } from '../../src/prefs/contract.ts';
import { AXES, type CardPlace, type Dealbreaker, type Diet, type StyleKey, type Taste, type Vibe } from '../../src/prefs/taste.ts';
import { explainDraft, shortlistDraft } from '../../src/trips/itinerary.ts';
import {
  buildInsights, cardWhy, constraintsBrief, consensus, dealbreakerUnion, deckCity, firstNames, groupStart, groupStyle, mateFrom, namesLine,
  readTaste, safeWhy, shortlistBrief, shortlistOf, squadPersona, startMinutes, stopWhy, strictestDiet, twin, type CardTally, type Mate,
} from '../../src/trips/squad.ts';

const vibe = (v: Partial<Vibe> = {}): Vibe => ({ adventure: 0.5, food: 0.5, nightlife: 0.5, culture: 0.5, chill: 0.5, shops: 0.5, ...v });

/** A swiped taste: each axis's mean is the given value, with `evidence` cards' worth on top of the prior; style votes at weight 2 (confidence 0.5) */
function taste(v: Partial<Vibe>, opts: { style?: Partial<Record<StyleKey, number>>; styleWeight?: number; dealbreakers?: Dealbreaker[]; diet?: Diet | null; evidence?: number } = {}): Taste {
  const n = opts.evidence ?? 8;
  const full = vibe(v);
  const weight = opts.styleWeight ?? 2;
  return {
    v: 2,
    axes: Object.fromEntries(AXES.map(a => [a, { a: (2 + n) * full[a], b: (2 + n) * (1 - full[a]) }])) as Taste['axes'],
    style: Object.fromEntries(Object.entries(opts.style ?? {}).map(([k, value]) => [k, { sum: value! * weight, weight }])),
    tags: {},
    dealbreakers: opts.dealbreakers ?? [],
    diet: opts.diet ?? null,
    answered: 12,
  };
}

let ids = 0;
function mate(name: string, t: Taste | null, prefs: Record<string, unknown> = {}): Mate {
  return mateFrom({ _id: `usr_${name.toLowerCase()}_${ids++}`, name, preferences: { ...prefs, ...(t ? { taste: { ...t, updatedAt: '2026-11-19T10:00:00.000Z' } } : {}) } }, name, t !== null);
}

type Snapshot = PrefAnswerDoc['card'];
const card = (title: string, axes: Partial<Vibe>, place?: CardPlace, extra: Partial<Snapshot> = {}): Snapshot => ({ title, kind: 'experience', axes, tags: [], city: 'Udaipur', ...(place ? { place } : {}), ...extra });

function swipe(m: Mate, cardId: string, snapshot: Snapshot, verdict: 'nope' | 'like' | 'love' | 'skip', scope = 'trip-1'): PrefAnswerDoc {
  const now = new Date('2026-11-19T10:00:00Z');
  return {
    user_id: m.userId, scope, card_id: cardId, format: 'swipe', ms: 900, card: snapshot,
    reply: verdict === 'skip' ? { kind: 'skip' } : { kind: 'swipe', verdict },
    created_at: now, updated_at: now,
  };
}

describe('reading profiles', () => {
  test('a stored taste wins, a legacy vibe is the fallback, and neither leaves a member pending', () => {
    const swiped = mate('Riya', taste({ food: 0.9 }));
    expect(swiped.swiped).toBe(true);
    expect(swiped.vibe!.food).toBe(0.9);
    const legacy = mate('Kabir', null, { vibe: vibe({ culture: 0.8 }) });
    expect(legacy.swiped).toBe(false);
    expect(legacy.vibe!.culture).toBe(0.8);
    expect(legacy.confidence!.culture).toBe(0.5);
    const pending = mate('Pat', null, { vibe: { food: 0.4 } });
    expect(pending.vibe).toBe(null);
    expect(readTaste({ v: 2, axes: {}, answered: 3 })).toBe(null);
  });

  test('a "no early starts" note counts as a deal-breaker, and the diet falls back to preferences.diet', () => {
    const m = mate('Dev', null, { diet: 'veg', ghoomate: { notes: [{ text: 'not a morning person', noEarlyStarts: true }] } });
    expect(m.dealbreakers).toEqual(['early-starts']);
    expect(m.diet).toBe('veg');
  });

  test('first names are made unique', () => {
    expect(firstNames(['Riya Shah', 'Riya Kapoor', 'Kabir', 'Kabir'])).toEqual(['Riya S.', 'Riya K.', 'Kabir', 'Kabir 2']);
  });

  test('deck cities', () => {
    expect(deckCity('Udaipur, Rajasthan')).toBe('Udaipur');
    expect(deckCity('North Goa')).toBe('Goa');
    expect(deckCity('Jaipur')).toBe(null);
  });
});

describe('groupStyle', () => {
  test('least misery for mornings and budget, the median for pace, the mean for together, the keenest for eco', () => {
    const style = groupStyle([
      { taste: taste({}, { style: { mornings: 0.5, budget: 0.8, pace: 0.1, together: 0.2, eco: 0.1 } }) },
      { taste: taste({}, { style: { mornings: 0.9, budget: 0.3, pace: 0.5, together: 0.6, eco: 0.7 } }) },
      { taste: taste({}, { style: { mornings: 1, budget: 0.9, pace: 0.9, together: 1, eco: 0.2 } }) },
    ]);
    expect(style.mornings.value).toBe(0.5);
    expect(style.mornings.rule).toBe('least-misery');
    expect(style.mornings.label).toBe('Group plans start around 8:30 AM, set by the latest riser');
    expect(style.budget.value).toBe(0.3);
    expect(style.pace.value).toBe(0.5);
    expect(style.pace.rule).toBe('median');
    expect(style.together.value).toBe(0.6);
    expect(style.eco.value).toBe(0.7);
    expect(style.eco.rule).toBe('most-pleasure');
  });

  test('start times: 10:30 AM for late risers, 8:30 AM in the middle, 6:30 AM for early birds', () => {
    expect(startMinutes(0)).toBe(10 * 60 + 30);
    expect(startMinutes(0.5)).toBe(8 * 60 + 30);
    expect(startMinutes(1)).toBe(6 * 60 + 30);
  });

  test('only members we know enough about vote; with no votes the value is a labelled default', () => {
    const style = groupStyle([
      { taste: taste({}, { style: { mornings: 0 }, styleWeight: 0.2 }) },
      { taste: taste({}, { style: { mornings: 1 } }) },
      { taste: null },
    ]);
    expect(style.mornings.value).toBe(1);
    expect(style.mornings.voters).toBe(1);
    expect(style.walking.value).toBe(0.5);
    assert.match(style.walking.label, /default/);
  });

  test('least-misery labels never name anyone', () => {
    const squad = [mate('Riya', taste({}, { style: { mornings: 0, budget: 0, walking: 0, crowds: 0 } })), mate('Kabir', taste({}, { style: { mornings: 1, budget: 1 } }))];
    const text = JSON.stringify(groupStyle(squad));
    assert.ok(!text.includes('Riya') && !text.includes('Kabir'), text);
  });

  test('"no early starts" holds the group start at 8:30 AM', () => {
    const style = groupStyle([{ taste: taste({}, { style: { mornings: 1 } }) }]);
    expect(groupStart(style, [])).toBe(6 * 60 + 30);
    expect(groupStart(style, ['early-starts'])).toBe(8 * 60 + 30);
  });
});

describe('diet and deal-breakers', () => {
  test('everyone eats at the strictest diet', () => {
    expect(strictestDiet([{ diet: 'eggetarian' }, { diet: null }, { diet: 'veg' }])).toBe('veg');
    expect(strictestDiet([{ diet: 'vegan' }, { diet: 'jain' }])).toBe('jain');
    expect(strictestDiet([{ diet: null }])).toBe(null);
  });

  test('deal-breakers are one list, in the catalogue order, without owners', () => {
    expect(dealbreakerUnion([{ dealbreakers: ['spicy', 'water'] }, { dealbreakers: ['water', 'heights'] }, { dealbreakers: [] }])).toEqual(['water', 'heights', 'spicy']);
  });

  test('the constraints block turns them into whole-group rules', () => {
    const squad = [mate('Riya', taste({}, { style: { mornings: 0.5, eco: 0.9 }, dealbreakers: ['water'], diet: 'jain' })), mate('Kabir', taste({}, { dealbreakers: ['late-nights'] }))];
    const brief = constraintsBrief(groupStyle(squad), strictestDiet(squad), dealbreakerUnion(squad));
    assert.match(brief, /Start whole-group plans at 08:30 AM or later/);
    assert.match(brief, /No swimming, snorkelling or kayaking for the whole group/);
    assert.match(brief, /Wrap up whole-group plans by 10 PM/);
    assert.match(brief, /every meal stop must suit a Jain/);
    assert.match(brief, /e-rickshaws/);
    assert.ok(!brief.includes('Riya') && !brief.includes('Kabir'));
  });
});

// Riya, Kabir and Meera like things; Dee only ever says no; Pat hasn't swiped
function squadWithAnswers() {
  const riya = mate('Riya', taste({ chill: 0.9, food: 0.6 }));
  const kabir = mate('Kabir', taste({ food: 0.9, culture: 0.7 }));
  const meera = mate('Meera', taste({ food: 0.85, nightlife: 0.8 }));
  const dee = mate('Dee', taste({ adventure: 0.1, nightlife: 0.1 }, { dealbreakers: ['heights'] }));
  const pat = mate('Pat', null);
  const members = [riya, kabir, meera, dee, pat];
  const boat = card('Lake Pichola sunset boat', { chill: 0.9, culture: 0.6 }, { area: 'Lal Ghat', startTime: '04:45 PM', duration: '2 hrs', priceRupees: 1299 });
  const food = card('Old city food walk', { food: 1 }, { area: 'Jagdish Chowk', startTime: '05:30 PM', duration: '3 hrs' });
  const night = card('Rooftop party', { nightlife: 1 });
  const cliff = card('Cliff rappel', { adventure: 1 });
  const answers = [
    swipe(riya, 'exp:boat', boat, 'love'), swipe(kabir, 'exp:boat', boat, 'like'), swipe(meera, 'exp:boat', boat, 'like'),
    swipe(riya, 'exp:food', food, 'like'), swipe(kabir, 'exp:food', food, 'like'), swipe(dee, 'exp:food', food, 'skip'),
    swipe(meera, 'exp:night', night, 'love'), swipe(dee, 'exp:night', night, 'nope'),
    swipe(dee, 'exp:cliff', cliff, 'nope'),
    swipe(riya, 'style:mornings', card('Sunrise starts', {}, undefined, { kind: 'style' }), 'like'),
  ];
  return { members, answers, riya, dee };
}

describe('consensus', () => {
  test('sorts trip cards into must-dos, whole-group picks and contested ones', () => {
    const { members, answers } = squadWithAnswers();
    const tally = consensus(answers, members);
    expect(tally.tallies).toHaveLength(4);
    expect(tally.mustDos.map(c => [c.cardId, c.lovers])).toEqual([['exp:boat', ['Riya']], ['exp:night', ['Meera']]]);
    expect(tally.consensus.map(c => c.cardId)).toEqual(['exp:boat', 'exp:food']);
    const boat = tally.consensus[0];
    expect(boat.fans).toEqual(['Riya', 'Kabir', 'Meera']);
    // (2 likes + 2·1 love) / 4 members with data
    expect(boat.score).toBe(1);
    expect(tally.contested.map(c => [c.cardId, c.fans])).toEqual([['exp:night', ['Meera']]]);
    expect(tally.contested[0].nopes).toBe(1);
  });

  test('predicts a like from members who did not answer but whose vibe fits', () => {
    const { members, answers } = squadWithAnswers();
    const food = consensus(answers, members).tallies.find(c => c.cardId === 'exp:food')!;
    // Meera (food 0.85) didn't answer and fits; Dee skipped, so counts as not answered, and doesn't fit
    expect(food.answered).toBe(2);
    expect(food.predicted).toBe(1);
    expect(food.score).toBe(0.63);
  });

  test('never says who said no', () => {
    const { members, answers, riya } = squadWithAnswers();
    const insights = buildInsights({ tripId: 'trip-1', city: 'Udaipur', meId: riya.userId, members, answers });
    const { members: _members, pending: _pending, twin: _twin, ...rest } = insights;
    const text = JSON.stringify(rest);
    assert.ok(!text.includes('Dee'), text);
    expect(insights.dealbreakers).toEqual(['heights']);
    const tally = consensus(answers, members);
    for (const c of tally.tallies) assert.ok(!JSON.stringify(c).includes('Dee') && !cardWhy(c).includes('Dee'));
  });

  test('squad insights: pending members, swipe counts and the squad persona', () => {
    const { members, answers, riya } = squadWithAnswers();
    const insights = buildInsights({ tripId: 'trip-1', city: 'Udaipur', meId: riya.userId, members, answers });
    expect(insights.pending).toEqual(['Pat']);
    // Only your own count: a mate's count minus the cards they're a fan of would give away their nopes
    expect(insights.members.map(m => m.tripAnswered)).toEqual([3, 0, 0, 0, 0]);
    expect(insights.members[0].isMe).toBe(true);
    expect(insights.members[4].confidence).toBe(0);
    expect(insights.consensus[0]).toEqual({ cardId: 'exp:boat', title: 'Lake Pichola sunset boat', likes: 3, answered: 3, fans: ['Riya', 'Kabir', 'Meera'] });
    expect(insights.mustDos[0]).toEqual({ cardId: 'exp:boat', title: 'Lake Pichola sunset boat', fans: ['Riya'] });
    expect(typeof insights.squadPersona).toBe('string');
    expect(insights.style.mornings.label.includes('default')).toBe(true);
  });
});

describe('people', () => {
  test('twin: the closest vibe, as a whole percentage', () => {
    const me = { userId: 'a', name: 'Me', vibe: vibe() };
    const others = [me, { userId: 'b', name: 'Near', vibe: vibe({ adventure: 0.6, food: 0.6, nightlife: 0.6, culture: 0.6, chill: 0.6, shops: 0.6 }) }, { userId: 'c', name: 'Far', vibe: vibe({ adventure: 1, food: 1, nightlife: 1, culture: 1, chill: 1, shops: 1 }) }];
    expect(twin(me, others)).toEqual({ name: 'Near', match: 90 });
    expect(twin({ userId: 'x', vibe: null }, others)).toBe(null);
  });

  test('squad persona', () => {
    expect(squadPersona(vibe({ food: 0.9, adventure: 0.8 }))).toBe('The Hungry Explorers');
    expect(squadPersona(null)).toBe(null);
  });
});

describe('why-lines', () => {
  const tally = (over: Partial<CardTally>): CardTally => ({
    cardId: 'exp:x', title: 'X', kind: 'experience', city: null, place: null, axes: {}, tags: [], likers: [], lovers: [], fans: [],
    nopes: 0, answered: 0, predicted: 0, members: 4, score: 0, ...over,
  });

  test('names', () => {
    expect(namesLine(['Riya'])).toBe('Riya');
    expect(namesLine(['Riya', 'Kabir'])).toBe('Riya and Kabir');
    expect(namesLine(['Riya', 'Kabir', 'Meera', 'Dev'])).toBe('Riya, Kabir +2');
  });

  test('card stops say who loved or liked them, or that everyone is in', () => {
    expect(cardWhy(tally({ lovers: ['Riya'], fans: ['Riya'] }))).toBe('Riya’s must-do');
    expect(cardWhy(tally({ lovers: ['Riya', 'Kabir', 'Meera', 'Dev'], fans: ['Riya', 'Kabir', 'Meera', 'Dev'] }))).toBe('Riya, Kabir +2’s must-do');
    expect(cardWhy(tally({ likers: ['A', 'B', 'C', 'D'], fans: ['A', 'B', 'C', 'D'], answered: 4 }))).toBe('Everyone’s in · 4 of 4 liked');
    expect(cardWhy(tally({ likers: ['Riya', 'Kabir'], fans: ['Riya', 'Kabir'], answered: 3, nopes: 1 }))).toBe('Liked by Riya and Kabir');
  });

  test('other stops: who it was picked for and the vibe, and Gemini lines that blame someone are dropped', () => {
    expect(stopWhy({ forMembers: ['Riya'], axis: 'food' })).toBe('Picked for Riya · food');
    expect(stopWhy({ forMembers: [], axis: 'group', tag: 'Stay' })).toBe(null);
    expect(safeWhy('Kabir hates crowds, so we go early', ['Kabir'])).toBe(null);
    expect(safeWhy('Kabir isn’t big on adventure, so a slow morning', ['Kabir'])).toBe(null);
    expect(safeWhy('Gentle walk since Kabir is scared of heights', ['Kabir'])).toBe(null);
    // De-duplicated names ("Riya K.", "Riya S.") still match the bare first name
    expect(safeWhy('Riya hates water, so no boat', ['Riya K.', 'Riya S.'])).toBe(null);
    // A name inside another word is not a match
    assert.notEqual(safeWhy('Avoid the Kabirganj crowds', ['Kabir']), null);
    expect(safeWhy('  Golden-hour views for the photographers  ', ['Kabir'])).toBe('Golden-hour views for the photographers');
    expect(safeWhy('x'.repeat(200), [])!.length).toBe(120);
  });
});

describe('shortlist', () => {
  test('the prompt block lists ids, counts and must-dos, and names fans only', () => {
    const { members, answers } = squadWithAnswers();
    const brief = shortlistBrief(shortlistOf(consensus(answers, members)), members);
    assert.match(brief, /\[exp:boat\] Lake Pichola sunset boat \(Lal Ghat, starts 04:45 PM, ₹1299, 2 hrs\) · 3 of 3 liked/);
    assert.match(brief, /- for Riya: \[exp:boat\]/);
    assert.match(brief, /\[exp:night\] Rooftop party · for Meera/);
    assert.ok(!brief.includes('Dee'));
  });

  // Udaipur catalogue-shaped cards, as the prefs module snapshots them
  function udaipurSquad(extra: { dealbreakers?: Dealbreaker[] } = {}) {
    const riya = mate('Riya', taste({ chill: 0.9 }, { dealbreakers: extra.dealbreakers }));
    const kabir = mate('Kabir', taste({ culture: 0.9 }));
    const members = [riya, kabir];
    const cards: [string, Snapshot][] = [
      ['exp:palace', card('City Palace royal stories walk', { culture: 1 }, { area: 'City Palace', startTime: '09:30 AM', duration: '2.5 hrs', priceRupees: 1099, pitch: 'Beat the crowds' })],
      ['exp:boat', card('Lake Pichola sunset boat ride', { chill: 0.9, culture: 0.6 }, { area: 'Lal Ghat', startTime: '04:45 PM', duration: '2 hrs' })],
      ['exp:painting', card('Mewar miniature painting workshop', { culture: 1 }, { area: 'Hathi Pol', startTime: '10:00 AM', duration: '3 hrs' })],
      ['exp:food', card('Old city kachori and chaat walk', { food: 1 }, { area: 'Jagdish Chowk', startTime: '05:30 PM', duration: '3 hrs' })],
      ['exp:yoga', card('Sunrise yoga above Fateh Sagar', { chill: 1 }, { area: 'Neemach Mata', startTime: '06:15 AM', duration: '1.5 hrs' })],
      ['exp:kayak', card('Kayak on Fateh Sagar', { adventure: 1 }, { area: 'Fateh Sagar', startTime: '11:00 AM', duration: '2 hrs' })],
    ];
    const answers = cards.flatMap(([id, c]) => [swipe(riya, id, c, id === 'exp:boat' ? 'love' : 'like'), swipe(kabir, id, c, 'like')]);
    return { members, shortlist: shortlistOf(consensus(answers, members)) };
  }
  const timeOf = (t: string) => {
    const [, h, m, p] = /^(\d{2}):(\d{2}) (AM|PM)$/.exec(t)!;
    return (Number(h) % 12 + (p === 'PM' ? 12 : 0)) * 60 + Number(m);
  };

  test('a plan from the swiped cards: check-in first, home last, nothing before the group start', () => {
    const { members, shortlist } = udaipurSquad({ dealbreakers: ['water'] });
    const draft = shortlistDraft({ city: 'Udaipur', days: 3, shortlist, start: 8 * 60 + 30, slots: 4, dealbreakers: ['water'], diet: 'jain' })!;
    expect(draft.source).toBe('shortlist');
    expect(draft.days).toHaveLength(3);
    expect(draft.days[0].slots[0][0].tag).toBe('Stay');
    const last = draft.days[2].slots.at(-1)![0];
    expect(last.title).toBe('Head home');
    const stops = draft.days.flatMap(d => d.slots.flat());
    for (const s of stops) assert.ok(timeOf(s.time) >= 8 * 60 + 30, `${s.title} at ${s.time}`);
    for (const d of draft.days) assert.ok(d.slots.length <= 4, `${d.title} has ${d.slots.length} slots`);
    const cards = stops.filter(s => s.cardId);
    // Yoga starts before the group does; the kayak is out because someone ruled out water
    assert.ok(!cards.some(s => s.cardId === 'exp:yoga' || s.cardId === 'exp:kayak'));
    expect(cards.length >= 3).toBe(true);
    const boat = cards.find(s => s.cardId === 'exp:boat')!;
    expect(boat.time).toBe('04:45 PM');
    expect(boat.forMembers).toEqual(['Riya']);
    const meals = stops.filter(s => s.tag === 'Food' && !s.cardId);
    assert.ok(meals.length > 0 && meals.every(m => /Jain/.test(m.notes)));

    const explained = explainDraft(draft, shortlist, members.map(m => m.name), true);
    const whys = explained.days.flatMap(d => d.slots.flat()).filter(s => s.cardId).map(s => s.why);
    assert.ok(whys.includes('Riya’s must-do'), JSON.stringify(whys));
    assert.ok(whys.includes('Everyone’s in · 2 of 2 liked'), JSON.stringify(whys));
  });

  test('one day of the plan, and no plan with fewer than three timed cards', () => {
    const { shortlist } = udaipurSquad();
    const day2 = shortlistDraft({ city: 'Udaipur', days: 3, onlyDay: 2, shortlist, start: 8 * 60 + 30, slots: 4, dealbreakers: [], diet: null })!;
    expect(day2.days).toHaveLength(1);
    const thin = shortlistOf(consensus([], []));
    expect(shortlistDraft({ city: 'Goa', days: 3, shortlist: thin, start: 510, slots: 4, dealbreakers: [], diet: null })).toBe(null);
  });
});
