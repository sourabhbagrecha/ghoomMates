// Adaptive order for a trip deck: the cards that teach us most about you, and settle the squad's open questions,
// come first. Pure and deterministic, so the same state always gives the same deck.
import { cardAxes, cardTags, strongestAxis } from './registry.ts';
import { AXES, type Card, type Vibe } from './taste.ts';

/** Other members' non-skip answers to one card. Counts only: who said what never enters the ordering. */
export type SquadTally = { answered: number; likes: number };

export type OrderInput = {
  /** The cards still to answer */
  cards: Card[];
  /** My confidence per axis (confidenceOf my stored taste); null when I have no taste yet, i.e. 0 everywhere */
  confidence: Vibe | null;
  /** Tags already in my taste (liked or noped) */
  myTags: ReadonlySet<string>;
  /** Other members' answers by card id */
  squad: ReadonlyMap<string, SquadTally>;
};

/** Two cards in a row may share their strongest axis only when no other card is within this much priority */
export const VARIETY_WINDOW = 0.1;

/** How little we know about my taste on the axes this card speaks to: Σ v·(1 − confidence) / Σ v */
export function uncertainty(card: Card, confidence: Vibe | null): number {
  const axes = cardAxes(card);
  let weight = 0;
  let unknown = 0;
  for (const axis of AXES) {
    const v = axes[axis] ?? 0;
    if (v <= 0) continue;
    weight += v;
    unknown += v * (1 - (confidence?.[axis] ?? 0));
  }
  return weight > 0 ? unknown / weight : 0;
}

/** 1 when the squad is split down the middle, 0 when it agrees; 0.5 while nobody else has answered */
export function squadSplit(tally: SquadTally | undefined): number {
  if (!tally || tally.answered <= 0) return 0.5;
  const likeShare = tally.likes / tally.answered;
  return 1 - Math.abs(likeShare - 0.5) * 2;
}

/** 1 when none of the card's tags is in my taste yet */
export const novelty = (card: Card, myTags: ReadonlySet<string>) => (cardTags(card).some(tag => myTags.has(tag)) ? 0 : 1);

export function priority(card: Card, input: Omit<OrderInput, 'cards'>): number {
  return 0.5 * uncertainty(card, input.confidence) + 0.3 * squadSplit(input.squad.get(card.id)) + 0.2 * novelty(card, input.myTags);
}

/** Highest priority first (ties by id), then greedily avoids two cards in a row leaning on the same axis when a
 * card within VARIETY_WINDOW of the best remaining one leans elsewhere. */
export function orderTripDeck(input: OrderInput): Card[] {
  const remaining = input.cards
    .map(card => ({ card, priority: priority(card, input), axis: strongestAxis(card) }))
    .sort((x, y) => y.priority - x.priority || (x.card.id < y.card.id ? -1 : x.card.id > y.card.id ? 1 : 0));
  const ordered: Card[] = [];
  let lastAxis: string | null = null;
  while (remaining.length) {
    let pick = 0;
    const head = remaining[0];
    if (lastAxis !== null && head.axis === lastAxis) {
      const floor = head.priority - VARIETY_WINDOW - 1e-9;
      const other = remaining.findIndex(r => r.priority >= floor && r.axis !== lastAxis);
      if (other > 0) pick = other;
    }
    const [next] = remaining.splice(pick, 1);
    ordered.push(next.card);
    lastAxis = next.axis;
  }
  return ordered;
}
