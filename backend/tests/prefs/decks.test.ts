import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { expect } from '../expect.ts';
import { TRIP_CARD_PREFIXES } from '../../src/prefs/contract.ts';
import { budgetFor, DECK_MAKERS, experienceStyle } from '../../src/prefs/decks/city.ts';
import { novelty, orderTripDeck, priority, squadSplit, uncertainty, VARIETY_WINDOW, type SquadTally } from '../../src/prefs/order.ts';
import { CARDS, cardAxes, cardKind, DECKS, deckForCity, snapshot, strongestAxis, tripCity } from '../../src/prefs/registry.ts';
import { AXES, DEALBREAKERS, DIETS, FORMATS, STYLE_KEYS, type Axis, type Card, type Vibe } from '../../src/prefs/taste.ts';
import { HOST_BY_ID } from '../../src/hospitality/partners.ts';
import { MAKER_BY_ID } from '../../src/makers/makers.ts';
import { EXPERIENCES } from '../../src/voice/experiences.ts';

const ICONS_DIR = new URL('../../../frontend/src/assets/icons/', import.meta.url);
const PUBLIC_DIR = new URL('../../../frontend/public/', import.meta.url);

// Icons another agent is adding to frontend/src/assets/icons for Vibe Swipe. Until they land, the "files exist" test
// below fails for exactly these names (and only these).
const NEW_ICONS = [
  'heart', 'x', 'star', 'flame', 'waves', 'tent', 'bike', 'music', 'flower-2', 'users', 'user', 'map', 'sparkles', 'tree-palm',
  'palette', 'binoculars', 'ban', 'salad', 'egg', 'drumstick', 'clock', 'zap', 'armchair', 'hand-heart', 'thumbs-up',
  'thumbs-down', 'undo-2', 'check', 'sunset', 'chef-hat', 'sprout', 'store', 'trophy',
];

const ALL_DECKS = Object.entries(DECKS) as [keyof typeof DECKS, Card[]][];
const ALL_CARDS = ALL_DECKS.flatMap(([, cards]) => cards);
const OPTION_COUNT: Record<Card['format'], [number, number]> = {
  swipe: [1, 1], 'this-or-that': [2, 2], pick: [3, 5], multi: [3, 7], 'best-worst': [4, 4], spectrum: [5, 5],
};
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const unit = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1;

/** All the copy a card puts on screen that this module writes (catalogue pitches are the catalogue's) */
const copyOf = (card: Card) => [card.topic, card.prompt, card.hint, ...card.options.flatMap(o => [o.label, o.detail])]
  .filter((text): text is string => typeof text === 'string');

describe('every card is well formed', () => {
  test('decks have the expected sizes', () => {
    expect(DECKS.core).toHaveLength(17);
    expect(DECKS.udaipur).toHaveLength(EXPERIENCES.filter(e => e.city === 'Udaipur').length + DECK_MAKERS.length + 1);
    expect(DECKS.goa).toHaveLength(EXPERIENCES.filter(e => e.city === 'Goa').length);
    expect(DECKS.generic).toHaveLength(18);
  });

  for (const [deck, cards] of ALL_DECKS) {
    test(`${deck}: formats, option counts, unique option ids, short labels and prompts`, () => {
      for (const card of cards) {
        assert.ok((FORMATS as readonly string[]).includes(card.format), `${card.id}: format ${card.format}`);
        const [min, max] = OPTION_COUNT[card.format];
        assert.ok(card.options.length >= min && card.options.length <= max, `${card.id}: ${card.options.length} options for ${card.format}`);
        expect(new Set(card.options.map(o => o.id)).size).toBe(card.options.length);
        assert.ok(card.prompt.length > 0 && card.prompt.length <= 60, `${card.id}: prompt “${card.prompt}” is ${card.prompt.length} chars`);
        assert.ok(card.topic.length > 0, `${card.id}: topic`);
        for (const option of card.options) {
          const words = option.label.trim().split(/\s+/).length;
          assert.ok(option.label.trim() && words <= 4, `${card.id}/${option.id}: label “${option.label}” is ${words} words`);
          assert.ok(!option.exclusive || card.format === 'multi', `${card.id}/${option.id}: exclusive outside a multi card`);
        }
        if (card.format === 'multi') assert.ok(card.options.filter(o => o.exclusive).length <= 1, `${card.id}: more than one exclusive option`);
      }
    });

    test(`${deck}: effects use real axes, style keys, deal-breakers and diets, with kebab-case tags`, () => {
      for (const card of cards) {
        for (const option of card.options) {
          const at = `${card.id}/${option.id}`;
          const { axes = {}, style = {}, tags = [], dealbreaker, diet } = option.effects;
          for (const [key, value] of Object.entries(axes)) assert.ok((AXES as readonly string[]).includes(key) && unit(value), `${at}: axis ${key}=${value}`);
          for (const [key, value] of Object.entries(style)) assert.ok((STYLE_KEYS as readonly string[]).includes(key) && unit(value), `${at}: style ${key}=${value}`);
          for (const tag of tags) assert.ok(KEBAB.test(tag), `${at}: tag “${tag}” is not kebab-case`);
          expect(new Set(tags).size).toBe(tags.length);
          assert.ok(dealbreaker === undefined || (DEALBREAKERS as readonly string[]).includes(dealbreaker), `${at}: dealbreaker ${dealbreaker}`);
          assert.ok(diet === undefined || (DIETS as readonly string[]).includes(diet), `${at}: diet ${diet}`);
        }
      }
    });

    test(`${deck}: copy uses curly quotes and Indian digit grouping`, () => {
      for (const card of cards) {
        for (const text of copyOf(card)) {
          assert.ok(!/['"]/.test(text), `${card.id}: straight quote in “${text}”`);
          assert.ok(!/₹\s?\d{4,}/.test(text), `${card.id}: ungrouped rupees in “${text}”`);
        }
      }
    });
  }

  test('card ids are unique across decks and carry the right prefix', () => {
    expect(new Set(ALL_CARDS.map(c => c.id)).size).toBe(ALL_CARDS.length);
    expect(Object.keys(CARDS)).toHaveLength(ALL_CARDS.length);
    for (const card of DECKS.core) assert.ok(card.id.startsWith('core:'), card.id);
    for (const card of DECKS.generic) assert.ok(card.id.startsWith('gen:'), card.id);
    for (const card of [...DECKS.udaipur, ...DECKS.goa, ...DECKS.generic]) {
      assert.ok(TRIP_CARD_PREFIXES.some(prefix => card.id.startsWith(prefix)), `${card.id}: not a trip card prefix`);
      expect(card.format).toBe('swipe');
    }
  });

  test('the core deck covers every format and the diet and deal-breaker questions', () => {
    for (const format of FORMATS) assert.ok(DECKS.core.some(c => c.format === format), `no ${format} card in the core deck`);
    const diet = CARDS['core:diet'];
    expect(diet.options.map(o => o.effects.diet)).toEqual(['non-veg', 'eggetarian', 'veg', 'vegan', 'jain']);
    const hardNo = CARDS['core:hard-no'];
    expect(hardNo.format).toBe('multi');
    expect(hardNo.options.filter(o => o.exclusive).map(o => o.id)).toEqual(['none']);
  });
});

describe('icons and pictures', () => {
  const files = new Set(readdirSync(ICONS_DIR));
  const existing = new Set([...files].map(f => /^icon-(.+)-(primary|white)\.svg$/.exec(f)?.[1]).filter(Boolean) as string[]);
  const optionIcons = new Set(ALL_CARDS.flatMap(c => c.options.map(o => o.icon)));
  const artIcons = new Set(ALL_CARDS.flatMap(c => (c.art?.kind === 'illustrated' ? [c.art.icon] : [])));

  test('every icon is one the app has or one on the new-icons list', () => {
    const known = new Set([...existing, ...NEW_ICONS]);
    const unknown = [...optionIcons, ...artIcons].filter(icon => !known.has(icon));
    expect(unknown).toEqual([]);
    // and any file missing today is one of the new icons, never a typo of an existing one
    const newSet = new Set(NEW_ICONS);
    const missing = [
      ...[...optionIcons].filter(icon => !files.has(`icon-${icon}-primary.svg`)),
      ...[...artIcons].filter(icon => !files.has(`icon-${icon}-white.svg`)),
    ];
    expect(missing.filter(icon => !newSet.has(icon))).toEqual([]);
  });

  // Expected to fail until the new icons land: it then lists only names from NEW_ICONS
  test('option icons have a -primary file and illustrated art icons a -white file', () => {
    const missing = [
      ...[...optionIcons].filter(icon => !files.has(`icon-${icon}-primary.svg`)).map(icon => `icon-${icon}-primary.svg`),
      ...[...artIcons].filter(icon => !files.has(`icon-${icon}-white.svg`)).map(icon => `icon-${icon}-white.svg`),
    ].sort();
    expect(missing).toEqual([]);
  });

  test('photo art points at a file in frontend/public, with alt text', () => {
    const photos = ALL_CARDS.flatMap(c => (c.art?.kind === 'photo' ? [{ id: c.id, ...c.art }] : []));
    assert.ok(photos.length >= DECK_MAKERS.length + 1);
    for (const photo of photos) {
      assert.ok(photo.src.startsWith('/'), `${photo.id}: ${photo.src}`);
      assert.ok(existsSync(new URL(photo.src.slice(1), PUBLIC_DIR)), `${photo.id}: missing frontend/public${photo.src}`);
      assert.ok(photo.alt.trim().length > 0, `${photo.id}: alt`);
    }
  });

  test('core and generic cards are illustrated; catalogue cards point at their experience', () => {
    for (const card of [...DECKS.core, ...DECKS.generic]) expect(card.art?.kind).toBe('illustrated');
    for (const card of ALL_CARDS.filter(c => c.id.startsWith('exp:'))) expect(card.art).toEqual({ kind: 'catalog', experienceId: card.id.slice(4) });
  });
});

describe('trip decks come from the catalogues', () => {
  const ids = (cards: Card[], prefix: string) => cards.filter(c => c.id.startsWith(prefix)).map(c => c.id.slice(prefix.length));

  test('every experience card is a real experience in the right city, and each city’s are all there', () => {
    for (const city of ['Udaipur', 'Goa'] as const) {
      const deck = city === 'Udaipur' ? DECKS.udaipur : DECKS.goa;
      expect(ids(deck, 'exp:').sort()).toEqual(EXPERIENCES.filter(e => e.city === city).map(e => e.id).sort());
    }
  });

  test('maker and host cards are real makers and hosts', () => {
    const makers = ids(DECKS.udaipur, 'maker:');
    assert.ok(makers.length >= 3 && makers.length <= 4);
    for (const id of makers) assert.ok(MAKER_BY_ID.has(id), id);
    const hosts = ids(DECKS.udaipur, 'host:');
    expect(hosts).toHaveLength(1);
    for (const id of hosts) assert.ok(HOST_BY_ID.has(id), id);
    expect(ids(DECKS.goa, 'maker:')).toEqual([]);
  });

  test('experience cards carry the catalogue facts and the swipe option is the experience', () => {
    const menar = CARDS['exp:menar-bird-village'];
    expect(menar.options[0].id).toBe('menar-bird-village');
    expect(menar.place?.startTime).toBe('05:45 AM');
    expect(menar.options[0].effects.axes).toEqual({ chill: 0.8, adventure: 0.5, culture: 0.3 });
    assert.ok(menar.options[0].effects.tags?.includes('birding'));
    assert.ok(menar.options[0].effects.tags?.includes('hidden-gems'));
  });

  test('style hints come from the facts: early starts, late nights, price and hidden gems', () => {
    expect(CARDS['exp:menar-bird-village'].options[0].effects.style?.mornings).toBe(1);
    expect(CARDS['exp:baga-night-out'].options[0].effects.style?.mornings).toBe(0);
    expect(CARDS['exp:fontainhas-heritage-walk'].options[0].effects.style?.mornings).toBe(undefined);
    expect(CARDS['exp:menar-bird-village'].options[0].effects.style?.crowds).toBe(0);
    expect(CARDS['exp:baga-night-out'].options[0].effects.style?.crowds).toBe(undefined);
    expect([budgetFor(599), budgetFor(800), budgetFor(1499), budgetFor(1500), budgetFor(1999)]).toEqual([0.2, 0.2, 0.5, 0.5, 0.8]);
    expect(experienceStyle({ startTime: '07:59 AM', priceRupees: 2500, tags: ['Food'] })).toEqual({ mornings: 1, budget: 0.8 });
    expect(experienceStyle({ startTime: '08:00 AM', priceRupees: 700, tags: ['Hidden gems'] })).toEqual({ budget: 0.2, crowds: 0 });
  });

  test('a trip’s city comes from its destination, else its name', () => {
    expect(tripCity({ destination: 'Udaipur, Rajasthan', name: 'Lakes' })).toBe('Udaipur');
    expect(tripCity({ destination: 'North Goa', name: 'x' })).toBe('Goa');
    expect(tripCity({ destination: '', name: 'Goa 2026!' })).toBe('Goa');
    expect(tripCity({ destination: 'Jaipur', name: 'Pink city' })).toBe(null);
    expect(tripCity({})).toBe(null);
    expect(deckForCity('Udaipur')).toBe(DECKS.udaipur);
    expect(deckForCity(null)).toBe(DECKS.generic);
  });

  test('snapshots carry what the trips module needs, without the card code', () => {
    expect(snapshot(CARDS['exp:baga-night-out'])).toEqual({
      title: 'Baga night out with a local',
      kind: 'experience',
      axes: { nightlife: 1, food: 0.2 },
      tags: ['nightlife', 'clubs', 'live-music'],
      city: 'Goa',
      place: { area: 'Baga, North Goa', priceRupees: 1999, startTime: '09:30 PM', duration: '4 hrs', rating: 4.68, pitch: CARDS['exp:baga-night-out'].place!.pitch },
    });
    expect(cardKind('core:pace')).toBe('style');
    expect(cardKind('maker:puran-bhat')).toBe('maker');
    expect(cardKind('host:kesar-pol-haveli')).toBe('experience');
    expect(cardKind('gen:spa-day')).toBe('archetype');
    const pace = snapshot(CARDS['core:pace']);
    expect(pace.kind).toBe('style');
    expect(pace.city).toBe(undefined);
    expect(snapshot(CARDS['host:kesar-pol-haveli']).city).toBe('Udaipur');
  });
});

describe('adaptive order', () => {
  const card = (id: string, axes: Partial<Vibe>, tags: string[] = []): Card => ({
    id, format: 'swipe', topic: 'T', prompt: id, options: [{ id, label: id, icon: 'gem', effects: { axes, tags } }],
  });
  const zero: Vibe = { adventure: 0, food: 0, nightlife: 0, culture: 0, chill: 0, shops: 0 };
  const none = new Map<string, SquadTally>();
  const noTags = new Set<string>();

  test('uncertainty weighs my confidence by how much the card speaks to each axis', () => {
    const c = card('c', { adventure: 1, food: 0.5 });
    expect(uncertainty(c, null)).toBe(1);
    expect(uncertainty(c, zero)).toBe(1);
    const sure = { ...zero, adventure: 0.8, food: 0.2 };
    assert.ok(Math.abs(uncertainty(c, sure) - (1 * 0.2 + 0.5 * 0.8) / 1.5) < 1e-9);
    expect(uncertainty(card('blank', {}), null)).toBe(0);
  });

  test('squadSplit is 1 for an even split, 0 for agreement, 0.5 before anyone answers', () => {
    expect(squadSplit(undefined)).toBe(0.5);
    expect(squadSplit({ answered: 0, likes: 0 })).toBe(0.5);
    expect(squadSplit({ answered: 4, likes: 2 })).toBe(1);
    expect(squadSplit({ answered: 3, likes: 3 })).toBe(0);
    expect(squadSplit({ answered: 3, likes: 0 })).toBe(0);
    assert.ok(Math.abs(squadSplit({ answered: 4, likes: 1 }) - 0.5) < 1e-9);
  });

  test('novelty is 1 until one of the card’s tags is in my taste', () => {
    const c = card('c', { food: 1 }, ['street-food', 'markets']);
    expect(novelty(c, noTags)).toBe(1);
    expect(novelty(c, new Set(['markets']))).toBe(0);
  });

  test('priority = 0.5·uncertainty + 0.3·squadSplit + 0.2·novelty', () => {
    const c = card('c', { food: 1 }, ['x']);
    const p = priority(c, { confidence: { ...zero, food: 0.5 }, myTags: new Set(['x']), squad: new Map([['c', { answered: 2, likes: 1 }]]) });
    assert.ok(Math.abs(p - (0.5 * 0.5 + 0.3 * 1 + 0)) < 1e-9);
  });

  test('highest priority first, ties broken by id', () => {
    const confidence = { ...zero, food: 0.9 };
    const cards = [card('b', { food: 1 }), card('d', { adventure: 1 }), card('a', { food: 1 }), card('c', { culture: 1 })];
    const order = orderTripDeck({ cards, confidence, myTags: noTags, squad: none }).map(c => c.id);
    // c and d (unknown axes) beat a and b (food is known); c before d by id, and they lean on different axes
    expect(order).toEqual(['c', 'd', 'a', 'b']);
  });

  test('never two cards on the same axis in a row when another is within the variety window', () => {
    // Everyone split down the middle on all three; f1 and f2 lean on food with nothing known, so priority 1.0 each.
    // c leans on culture, where my confidence k gives it 1 − 0.5·k: 0.91 at k = 0.18 (inside), 0.89 at k = 0.22.
    const split = { answered: 2, likes: 1 };
    const squad = new Map<string, SquadTally>([['f1', split], ['f2', split], ['c', split]]);
    const cards = [card('f1', { food: 1 }), card('f2', { food: 0.9 }), card('c', { culture: 1 })];
    const run = (k: number) => {
      const input = { cards, confidence: { ...zero, culture: k }, myTags: noTags, squad };
      expect(priority(cards[0], input)).toBe(1);
      return orderTripDeck(input).map(c => c.id);
    };
    expect(VARIETY_WINDOW).toBe(0.1);
    expect(run(0.18)).toEqual(['f1', 'c', 'f2']);
    expect(run(0.22)).toEqual(['f1', 'f2', 'c']);
  });

  test('the order is deterministic and keeps every card once', () => {
    const input = { cards: DECKS.udaipur, confidence: { ...zero, culture: 0.6, chill: 0.3 }, myTags: new Set(['sunsets']), squad: none };
    const first = orderTripDeck(input).map(c => c.id);
    expect(orderTripDeck({ ...input, cards: [...DECKS.udaipur].reverse() }).map(c => c.id)).toEqual(first);
    expect([...first].sort()).toEqual(DECKS.udaipur.map(c => c.id).sort());
    for (let i = 1; i < first.length; i++) {
      const [prev, next] = [CARDS[first[i - 1]], CARDS[first[i]]];
      if (strongestAxis(prev) !== strongestAxis(next)) continue;
      // Same axis twice in a row is allowed only when nothing else left was within the window
      const rest = first.slice(i).map(id => CARDS[id]);
      const p = (c: Card) => priority(c, input);
      const head = Math.max(...rest.map(p));
      assert.ok(!rest.some(c => strongestAxis(c) !== strongestAxis(prev) && p(c) >= head - VARIETY_WINDOW - 1e-9), `${first[i - 1]} then ${first[i]}`);
    }
  });

  test('cardAxes reads the subject of a swipe card and the strongest option per axis otherwise', () => {
    expect(cardAxes(CARDS['exp:baga-night-out'])).toEqual({ nightlife: 1, food: 0.2 });
    const tot = CARDS['core:fort-or-beach-club'];
    const axes = cardAxes(tot);
    for (const option of tot.options) {
      for (const [axis, v] of Object.entries(option.effects.axes ?? {})) assert.ok((axes[axis as Axis] ?? 0) >= v);
    }
    expect(strongestAxis(card('tie', { food: 0.5, adventure: 0.5 }))).toBe('adventure');
    expect(strongestAxis(card('none', {}))).toBe(null);
  });
});
