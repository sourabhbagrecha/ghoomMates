import { Button, LinkButton } from '../../components/Button'
import '../../components/Flashcard.css'
import { GhoomMateTip } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { VibeChart } from '../../components/VibeChart'
import { EXAMPLE_VIBE } from '../../data/vibe'
import { QUIZ_CARDS, QUIZ_TOPICS } from './quizData'
import './QuizPages.css'

type QuizIntroPageProps = {
  onBack: () => void
  onStart: () => void
  onSkip: () => void
}

export function QuizIntroPage({ onBack, onStart, onSkip }: QuizIntroPageProps) {
  return (
    <OnboardingLayout
      eyebrow="Personality quiz"
      title="What’s your vibe?"
      subtitle={`Let GhoomMate learn your vibe in ${QUIZ_CARDS.length} quick cards.`}
      onBack={onBack}
      bodyClassName="quiz__body"
      actions={
        <>
          <Button variant="primary" onClick={onStart}>
            Start the quiz
          </Button>
          <LinkButton onClick={onSkip}>Skip for now</LinkButton>
        </>
      }
    >
      {/* A preview of the deck, in the same flashcard style as the cards themselves */}
      <div className="flashcards" aria-hidden="true">
        <div className="flashcards__next" />
        <div className="flashcard">
          <p className="overline flashcard__overline">{QUIZ_CARDS.length} cards · about a minute</p>
          <p className="flashcard__question">Quick questions about how you travel</p>
          <div className="flashcard__options">
            {QUIZ_TOPICS.map((topic) => (
              <span key={topic} className="quiz-intro__topic">
                {topic}
              </span>
            ))}
          </div>
        </div>
      </div>

      <section className="card quiz-intro__unlock">
        <VibeChart
          series={[{ scores: EXAMPLE_VIBE, color: 'var(--color-amber)', fillOpacity: 0.15, dots: true }]}
          width={132}
          label="Example vibe chart"
        />
        <div className="quiz-intro__unlock-text">
          <p className="overline">You’ll unlock</p>
          <h2>Your vibe chart and travel persona</h2>
          <p>Share it with the squad. We’ll blend it into every trip plan.</p>
        </div>
      </section>

      <GhoomMateTip>No wrong answers here. Skip any card you like!</GhoomMateTip>
    </OnboardingLayout>
  )
}
