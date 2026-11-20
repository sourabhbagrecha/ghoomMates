// Every Vibe Swipe deck, and the lookups the routes and the re-scoring share: a card by id, the deck for a trip's
// city, and the snapshot stored with each answer.
import { cityForDestination, type ExperienceCity } from '../voice/experiences.ts';
import type { CardKind, PrefAnswerDoc } from './contract.ts';
import { CORE_DECK } from './decks/core.ts';
import { GOA_DECK, UDAIPUR_DECK } from './decks/city.ts';
import { GENERIC_DECK } from './decks/generic.ts';
import { AXES, type Axis, type Card, type Vibe } from './taste.ts';

export { CORE_DECK, GENERIC_DECK, GOA_DECK, UDAIPUR_DECK };

export const DECKS: Record<'core' | 'udaipur' | 'goa' | 'generic', Card[]> = {
  core: CORE_DECK,
  udaipur: UDAIPUR_DECK,
  goa: GOA_DECK,
  generic: GENERIC_DECK,
};

const ALL = Object.values(DECKS).flat();

/** Every card of every deck by id (ids are unique across decks; tests/prefs/decks.test.ts checks) */
export const CARDS: Record<string, Card> = Object.fromEntries(ALL.map(card => [card.id, card]));

/** A stable position per card, so answers are always scored in the same order */
export const CARD_ORDER = new Map(ALL.map((card, index) => [card.id, index]));

const CITY_DECKS: Record<ExperienceCity, Card[]> = { Udaipur: UDAIPUR_DECK, Goa: GOA_DECK };

/** The catalogue city a trip is in, from its destination, else its name ("Udaipur, Rajasthan" → Udaipur) */
export const tripCity = (trip: { destination?: unknown; name?: unknown }): ExperienceCity | null =>
  cityForDestination(typeof trip.destination === 'string' ? trip.destination : '') ??
  cityForDestination(typeof trip.name === 'string' ? trip.name : '');

/** Udaipur and Goa get their catalogue decks; anywhere else gets the generic activity deck */
export const deckForCity = (city: ExperienceCity | null): Card[] => (city ? CITY_DECKS[city] : GENERIC_DECK);

const CITY_OF_CARD = new Map<string, ExperienceCity>(
  (Object.entries(CITY_DECKS) as [ExperienceCity, Card[]][]).flatMap(([city, cards]) => cards.map(card => [card.id, city] as const)),
);

export function cardKind(id: string): CardKind {
  if (id.startsWith('core:')) return 'style';
  if (id.startsWith('maker:')) return 'maker';
  if (id.startsWith('gen:')) return 'archetype';
  return 'experience';
}

/** What a card says about you on each axis: the subject of a swipe card, else the strongest option per axis */
export function cardAxes(card: Card): Partial<Vibe> {
  const axes: Partial<Vibe> = {};
  const options = card.format === 'swipe' ? card.options.slice(0, 1) : card.options;
  for (const option of options) {
    for (const axis of AXES) {
      const v = option.effects.axes?.[axis];
      if (v && v > (axes[axis] ?? 0)) axes[axis] = v;
    }
  }
  return axes;
}

export function cardTags(card: Card): string[] {
  const options = card.format === 'swipe' ? card.options.slice(0, 1) : card.options;
  return [...new Set(options.flatMap(o => o.effects.tags ?? []))];
}

/** The axis a card leans on most (ties go to the earlier axis), or null for a card with no axes */
export function strongestAxis(card: Card): Axis | null {
  const axes = cardAxes(card);
  let best: Axis | null = null;
  for (const axis of AXES) if ((axes[axis] ?? 0) > 0 && (best === null || axes[axis]! > axes[best]!)) best = axis;
  return best;
}

/** The card snapshot stored with an answer, so the trips module can do group maths without the deck code */
export function snapshot(card: Card): PrefAnswerDoc['card'] {
  const city = CITY_OF_CARD.get(card.id);
  return {
    title: card.prompt,
    kind: cardKind(card.id),
    axes: cardAxes(card),
    tags: cardTags(card),
    ...(city ? { city } : {}),
    ...(card.place ? { place: Object.fromEntries(Object.entries(card.place).filter(([, v]) => v !== undefined)) } : {}),
  };
}
