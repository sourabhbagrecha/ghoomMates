import iconCheck from '../../assets/figma/icon-check-success.svg'
import { Button, LinkButton } from '../../components/Button'
import { GhoomMateAvatar } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { useNavigate } from '../../hooks/navigation'
import { QUIZ, SQUAD_SCORES, computeVibe } from './profileData'
import { quizActions, useProfileStore } from './profileStore'
import { VibeLegend, VibeWeb } from './VibeWeb'
import './QuizResultPage.css'

export function QuizResultPage() {
  const navigate = useNavigate()
  const { draft } = useProfileStore()
  const vibe = computeVibe(draft)
  const answered = QUIZ.filter((q) => draft[q.id]?.length).length

  return (
    <OnboardingLayout
      eyebrow="Vibe quiz · Your result"
      title="Meet your vibe"
      subtitle={`From ${answered} of ${QUIZ.length} cards`}
      onBack={() => navigate(`profile/quiz/${QUIZ.length}`)}
      bodyClassName="quiz-result__body"
      actions={
        <>
          <Button
            variant="primary"
            onClick={() => {
              // TODO: sync to the profile service so squads re-blend their vibe
              quizActions.save()
              navigate('profile')
            }}
          >
            Save my vibe
          </Button>
          <LinkButton onClick={() => navigate('profile/quiz/1')}>Change my answers</LinkButton>
        </>
      }
    >
      <section className="card quiz-result__vibe">
        <p className="overline quiz-result__overline">You’re</p>
        <h2 className="quiz-result__persona">{vibe.persona}</h2>
        <VibeWeb you={vibe.scores} squad={SQUAD_SCORES} size="large" />
        <VibeLegend />
      </section>

      <section className="card quiz-result__traits" aria-labelledby="quiz-result-traits">
        <h2 id="quiz-result-traits" className="overline">
          Your top traits
        </h2>
        <ol className="quiz-result__list">
          {vibe.traits.map((t, i) => (
            <li key={t.title} className="quiz-result__trait">
              <span className="quiz-result__number" aria-hidden="true">
                {i + 1}
              </span>
              <span className="quiz-result__text">
                {t.title}
                <span>{t.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card quiz-result__changes" aria-labelledby="quiz-result-changes">
        <div className="quiz-result__changes-head">
          <GhoomMateAvatar size={36} ring={2} />
          <h2 id="quiz-result-changes" className="quiz-result__changes-title">
            What this changes
            <span>GhoomMate will…</span>
          </h2>
        </div>
        <ul className="quiz-result__changes-list">
          {vibe.changes.map((c) => (
            <li key={c}>
              <img src={iconCheck} alt="" width={14} height={14} />
              {c}
            </li>
          ))}
        </ul>
      </section>
    </OnboardingLayout>
  )
}
