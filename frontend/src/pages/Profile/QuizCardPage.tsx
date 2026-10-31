import { Button, LinkButton } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { GhoomMateTip } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { useNavigate } from '../../hooks/navigation'
import { QUIZ } from './profileData'
import { quizActions, useProfileStore } from './profileStore'
import './QuizCardPage.css'

/** One vibe-check flashcard; `index` is 0-based, the route is 1-based. */
export function QuizCardPage({ index }: { index: number }) {
  const navigate = useNavigate()
  const { draft } = useProfileStore()
  const question = QUIZ[index]
  const picked = draft[question.id] ?? []
  const card = index + 1
  const isLast = card === QUIZ.length
  const questionId = `quiz-question-${question.id}`

  const next = () => navigate(isLast ? 'profile/quiz/result' : `profile/quiz/${card + 1}`)

  const toggle = (optionId: string) => {
    if (!question.multi) return quizActions.answer(question.id, [optionId])
    quizActions.answer(
      question.id,
      picked.includes(optionId) ? picked.filter((id) => id !== optionId) : [...picked, optionId],
    )
  }

  return (
    <OnboardingLayout
      eyebrow={`Vibe quiz · Card ${card} of ${QUIZ.length}`}
      title={question.topic}
      step={card}
      totalSteps={QUIZ.length}
      onBack={() => navigate(card === 1 ? 'profile/quiz' : `profile/quiz/${card - 1}`)}
      bodyClassName="quiz-card__body"
      actions={
        <>
          <Button variant="primary" disabled={!picked.length} onClick={next}>
            {isLast ? 'See my vibe' : 'Next card'}
          </Button>
          {/* Answers so far stay in the draft for next time */}
          <LinkButton onClick={() => navigate('profile')}>Finish later</LinkButton>
        </>
      }
    >
      <section className="quiz-card">
        {!isLast && <div className="quiz-card__next" aria-hidden="true" />}
        <div className="quiz-card__card">
          <div className="quiz-card__top">
            <p className="overline quiz-card__overline">
              Vibe check · Card {card} of {QUIZ.length}
            </p>
            <button
              type="button"
              className="quiz-card__skip"
              onClick={() => {
                quizActions.answer(question.id, [])
                next()
              }}
            >
              Skip
            </button>
          </div>
          <h2 id={questionId} className="quiz-card__question">
            {question.question}
          </h2>
          <p className="quiz-card__hint">{question.multi ? 'Select all that apply to you' : 'Pick the one that’s most you'}</p>
          <div className="quiz-card__options" role="group" aria-labelledby={questionId}>
            {question.options.map((option) => (
              <Chip key={option.id} selected={picked.includes(option.id)} onClick={() => toggle(option.id)}>
                {option.label}
              </Chip>
            ))}
          </div>
        </div>
      </section>

      <GhoomMateTip>{question.tip}</GhoomMateTip>
    </OnboardingLayout>
  )
}
