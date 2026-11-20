// CONTRACT STUB: the props below are the agreed API. The swipe-kit work replaces this body with the real
// gesture stack (drag, stamps, fling, keyboard, undo) and the per-format card faces; keep the props stable.
import { useEffect, useRef, type ReactNode } from 'react'
import type { Card, Reply } from '../../data/taste'

export type CataloguePhoto = { src: string; alt: string; credit: string; license: string; source: string }

export type QuizStackProps = {
  /** Cards still to answer, top first. The stack animates the answered card away, then calls onAnswer;
   * the parent then drops that card from `cards`. */
  cards: Card[]
  onAnswer: (card: Card, reply: Reply, ms: number) => void
  /** Rewind the last answer (the parent puts that card back on top) */
  onUndo?: () => void
  canUndo?: boolean
  /** Credited photo for art.kind === 'catalog' cards */
  photoFor?: (experienceId: string) => CataloguePhoto | undefined
  /** Optional line under the top card, e.g. "Riya and Kabir loved this" */
  footer?: (card: Card) => ReactNode
}

export function QuizStack({ cards, onAnswer, onUndo, canUndo, footer }: QuizStackProps) {
  const card = cards[0]
  const shownAt = useRef(0)
  useEffect(() => {
    shownAt.current = Date.now()
  }, [card?.id])
  if (!card) return null
  const ms = () => Date.now() - shownAt.current
  return (
    <section aria-label={card.prompt}>
      <p className="overline">{card.topic}</p>
      <h2>{card.prompt}</h2>
      {card.format === 'swipe' ? (
        <div>
          <button type="button" onClick={() => onAnswer(card, { kind: 'swipe', verdict: 'nope' }, ms())}>Nope</button>
          <button type="button" onClick={() => onAnswer(card, { kind: 'swipe', verdict: 'love' }, ms())}>Must-do</button>
          <button type="button" onClick={() => onAnswer(card, { kind: 'swipe', verdict: 'like' }, ms())}>Yes</button>
        </div>
      ) : (
        <div>
          {card.options.map((o) => (
            <button key={o.id} type="button" onClick={() => onAnswer(card, { kind: 'choose', optionIds: [o.id] }, ms())}>
              {o.label}
            </button>
          ))}
        </div>
      )}
      {footer?.(card)}
      <button type="button" onClick={() => onAnswer(card, { kind: 'skip' }, ms())}>Skip</button>
      {onUndo && (
        <button type="button" onClick={onUndo} disabled={!canUndo}>
          Undo
        </button>
      )}
    </section>
  )
}
