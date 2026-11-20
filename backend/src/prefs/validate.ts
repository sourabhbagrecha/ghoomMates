// Request validation for POST /api/prefs/answers: every answer must fit its card's format and options.
import { ApiError, requireThat } from '../expenses/domain.ts';
import type { Answer, Card, Reply } from './taste.ts';

export const MAX_ANSWERS = 60;
export const MAX_MS = 600_000;
const VERDICTS = new Set(['nope', 'like', 'love']);
const ONE_OPTION = new Set(['this-or-that', 'pick', 'spectrum']);

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** A clean reply for this card (unknown fields dropped), or a 400 */
export function parseReply(card: Card, value: unknown, at: string): Reply {
  requireThat(isObject(value), `${at}.reply must be an object`);
  const optionIds = new Set(card.options.map(o => o.id));
  switch (value.kind) {
    case 'skip':
      return { kind: 'skip' };
    case 'swipe':
      requireThat(card.format === 'swipe', `${at}: ${card.id} is not a swipe card`);
      requireThat(typeof value.verdict === 'string' && VERDICTS.has(value.verdict), `${at}.reply.verdict must be nope, like or love`);
      return { kind: 'swipe', verdict: value.verdict as 'nope' | 'like' | 'love' };
    case 'best-worst': {
      requireThat(card.format === 'best-worst', `${at}: ${card.id} is not a best-worst card`);
      const { best, worst } = value;
      requireThat(typeof best === 'string' && optionIds.has(best), `${at}.reply.best must be one of ${card.id}'s option ids`);
      requireThat(typeof worst === 'string' && optionIds.has(worst), `${at}.reply.worst must be one of ${card.id}'s option ids`);
      requireThat(best !== worst, `${at}: best and worst must be different options`);
      return { kind: 'best-worst', best, worst };
    }
    case 'choose': {
      requireThat(card.format !== 'swipe' && card.format !== 'best-worst', `${at}: ${card.id} is a ${card.format} card, so it can’t take a choose reply`);
      const ids = value.optionIds;
      requireThat(Array.isArray(ids) && ids.every(id => typeof id === 'string' && optionIds.has(id)), `${at}.reply.optionIds must be ${card.id}'s option ids`);
      requireThat(new Set(ids).size === ids.length, `${at}.reply.optionIds must not repeat an option`);
      if (ONE_OPTION.has(card.format)) {
        requireThat(ids.length === 1, `${at}: a ${card.format} card takes exactly one option`);
      } else {
        requireThat(ids.length >= 1, `${at}: pick at least one option`);
        const exclusive = card.options.filter(o => o.exclusive && ids.includes(o.id));
        requireThat(!exclusive.length || ids.length === 1, `${at}: “${exclusive[0]?.label}” can’t be combined with other options`);
      }
      return { kind: 'choose', optionIds: [...ids] as string[] };
    }
    default:
      throw new ApiError(400, 'VALIDATION_ERROR', `${at}.reply.kind must be swipe, choose, best-worst or skip`);
  }
}

/** 1–60 answers to cards of this deck. A card answered twice in one request keeps the last answer. */
export function parseAnswers(value: unknown, deck: ReadonlyMap<string, Card>, deckName: string): Answer[] {
  requireThat(Array.isArray(value) && value.length >= 1 && value.length <= MAX_ANSWERS, `answers must be a list of 1 to ${MAX_ANSWERS} answers`);
  const byCard = new Map<string, Answer>();
  value.forEach((item, index) => {
    const at = `answers[${index}]`;
    requireThat(isObject(item), `${at} must be an object`);
    const card = typeof item.cardId === 'string' ? deck.get(item.cardId) : undefined;
    requireThat(card, `${at}.cardId must be a card in the ${deckName} deck`);
    const reply = parseReply(card, item.reply, at);
    requireThat(typeof item.ms === 'number' && Number.isFinite(item.ms), `${at}.ms must be a number`);
    const ms = Math.round(Math.min(MAX_MS, Math.max(0, item.ms)));
    byCard.delete(card.id);
    byCard.set(card.id, { cardId: card.id, reply, ms });
  });
  return [...byCard.values()];
}
