import { Button } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { Flashcard } from '../../components/Flashcard'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { VibeChart } from '../../components/VibeChart'
import type { VibeScores } from '../../data/vibe'
import { QUIZ_CARDS } from './quizData'
import './QuizPages.css'

type QuizCardPageProps = {
  index: number
  picked: string[]
  /** Vibe so far, including this card's picks */
  scores: VibeScores
  onPick: (picked: string[]) => void
  onBack: () => void
  onNext: () => void
  onSkipQuiz: () => void
}

export function QuizCardPage({ index, picked, scores, onPick, onBack, onNext, onSkipQuiz }: QuizCardPageProps) {
  const card = QUIZ_CARDS[index]
  const isLast = index === QUIZ_CARDS.length - 1

  const toggle = (id: string) => {
    if (!card.multi) onPick([id])
    else onPick(picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id])
  }

  return (
    <OnboardingLayout
      eyebrow="Personality quiz"
      title={card.topic}
      onBack={onBack}
      headerRight={
        <button type="button" className="onboarding__header-link" onClick={onSkipQuiz}>
          Skip quiz
        </button>
      }
      headerExtra={
        <div
          className="onboarding__progress"
          role="progressbar"
          aria-label={`Card ${index + 1} of ${QUIZ_CARDS.length}`}
          aria-valuenow={index + 1}
          aria-valuemin={1}
          aria-valuemax={QUIZ_CARDS.length}
        >
          {QUIZ_CARDS.map((c, i) => (
            <span key={c.id} className={i <= index ? 'onboarding__segment--done' : undefined} />
          ))}
        </div>
      }
      bodyClassName="quiz__body"
      actions={
        <Button variant="primary" onClick={onNext} disabled={picked.length === 0}>
          {isLast ? 'See my vibe' : 'Next'}
        </Button>
      }
    >
      <Flashcard
        className="quiz-card__flashcard"
        overline={`Vibe check · Card ${index + 1} of ${QUIZ_CARDS.length}`}
        question={card.question}
        hint={card.multi ? 'Select all that apply to you' : 'Pick one'}
        onSkip={onNext}
      >
        {card.options.map((option) => (
          <Chip key={option.id} selected={picked.includes(option.id)} onClick={() => toggle(option.id)}>
            {option.label}
          </Chip>
        ))}
      </Flashcard>

      <section className="card quiz-card__so-far">
        <VibeChart
          series={[{ scores, color: 'var(--color-amber)', fillOpacity: 0.15, dots: true }]}
          width={150}
          label="Your vibe so far"
        />
        <div className="quiz-card__so-far-text">
          <p className="overline">Your vibe so far</p>
          <p>Every answer reshapes your spiderweb.</p>
        </div>
      </section>
    </OnboardingLayout>
  )
}
