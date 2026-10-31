import { Button, LinkButton } from '../../components/Button'
import { GhoomMateAvatar } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { useNavigate } from '../../hooks/navigation'
import { QUIZ } from './profileData'
import { displayName, quizActions, useProfileStore } from './profileStore'
import './QuizIntroPage.css'

export function QuizIntroPage() {
  const navigate = useNavigate()
  const profile = useProfileStore()

  return (
    <OnboardingLayout
      eyebrow="Vibe quiz"
      title="What’s your vibe?"
      subtitle={`${QUIZ.length} quick cards · about a minute`}
      onBack={() => navigate('profile')}
      bodyClassName="quiz-intro__body"
      actions={
        <>
          <Button variant="primary" onClick={() => navigate('profile/quiz/1')}>
            Let’s go
          </Button>
          <LinkButton
            onClick={() => {
              quizActions.discard()
              navigate('profile')
            }}
          >
            Skip for now
          </LinkButton>
        </>
      }
    >
      <section className="card quiz-intro__card">
        <GhoomMateAvatar size={96} ring={4} />
        <h2 className="quiz-intro__title">Hey {displayName(profile)}, let’s find your travel vibe</h2>
        <p className="quiz-intro__text">
          Tap whatever sounds like you. I’ll blend it with your squads’ answers so every plan has something you’ll love.
        </p>
        <ul className="quiz-intro__topics" aria-label="What the cards cover">
          {QUIZ.map((q) => (
            <li key={q.id} className="tag">
              {q.topic}
            </li>
          ))}
        </ul>
      </section>

      <p className="quiz-intro__current">
        Right now you’re <strong>{profile.vibe.persona}</strong>. Your old answers are filled in, and nothing changes until
        you save.
      </p>
    </OnboardingLayout>
  )
}
