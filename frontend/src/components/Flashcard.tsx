import type { ReactNode } from 'react'
import './Flashcard.css'

type FlashcardProps = {
  /** e.g. “Vibe check · Card 3 of 8” */
  overline: string
  question: string
  hint: string
  onSkip?: () => void
  className?: string
  /** The answer chips */
  children: ReactNode
}

/** Amber question card with the next card peeking out behind it (vibe check, personality quiz). */
export function Flashcard({ overline, question, hint, onSkip, className, children }: FlashcardProps) {
  return (
    <section className={`flashcards${className ? ` ${className}` : ''}`}>
      <div className="flashcards__next" aria-hidden="true" />
      <div className="flashcard">
        <div className="flashcard__top">
          <p className="overline flashcard__overline">{overline}</p>
          <button type="button" className="flashcard__skip" onClick={onSkip}>
            Skip
          </button>
        </div>
        <h2 className="flashcard__question">{question}</h2>
        <p className="flashcard__hint">{hint}</p>
        <div className="flashcard__options">{children}</div>
      </div>
    </section>
  )
}
