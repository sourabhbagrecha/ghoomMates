import { useState } from 'react'
import iconArrow from '../../assets/figma/icon-arrow-primary.svg'
import iconYes from '../../assets/figma/icon-check-big-primary.svg'
import iconMustDo from '../../assets/figma/icon-star.svg'
import iconNope from '../../assets/figma/icon-x-ink.svg'
import { Button, LinkButton } from '../../components/Button'
import { GhoomMateTip } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { VibeChart } from '../../components/VibeChart'
import { EXAMPLE_VIBE } from '../../data/vibe'
import { getStoredUser } from '../../services/authService'
import { CORE_SCOPE } from '../../services/vibeStorage'
import { restartCore } from './decks'
import { QuizScreen, ScreenReaderText } from './QuizParts'
import { goBack, useSignedIn, useSwipeDraft } from './quizHooks'
import { VIBE_SWIPE_LINE } from './quizData'

type QuizIntroPageProps = {
  go: (route: string) => void
  onDone: () => void
}

const GESTURES = [
  { id: 'nope', icon: iconNope, label: 'Nope', direction: 'left', turn: 180 },
  { id: 'yes', icon: iconYes, label: 'Yes', direction: 'right', turn: 0 },
  { id: 'must', icon: iconMustDo, label: 'Must-do', direction: 'up', turn: -90 },
] as const

/** Your profile already has a result from the swipe deck */
const hasProfileTaste = () => {
  const preferences = getStoredUser()?.preferences
  return !!preferences?.taste && !!preferences.persona
}

/** What Vibe Swipe is, how to swipe, and a way in: start, keep going, or start over once you've finished */
export function QuizIntroPage({ go, onDone }: QuizIntroPageProps) {
  const signedIn = useSignedIn()
  const draft = useSwipeDraft(CORE_SCOPE)
  const [restart, setRestart] = useState<'idle' | 'busy' | 'failed'>('idle')

  const swiped = draft?.answers.length ?? 0
  const finished = !!draft?.done || (signedIn && !swiped && hasProfileTaste())
  const partway = !finished && swiped > 0

  const startOver = () => {
    setRestart('busy')
    restartCore().then(
      () => go('quiz/play'),
      () => setRestart('failed'),
    )
  }
  const busy = restart === 'busy'

  return (
    <QuizScreen>
      <OnboardingLayout
        eyebrow="Vibe Swipe"
        title="What’s your vibe?"
        subtitle="Swipe quick cards and GhoomMate learns how you like to travel."
        onBack={() => goBack(onDone)}
        bodyClassName="quiz-screen__body"
        actions={
          <>
            {finished ? (
              <>
                <Button variant="primary" onClick={startOver} disabled={busy}>
                  {busy ? 'Starting over…' : 'Start over'}
                </Button>
                <div className="quiz-screen__links">
                  <LinkButton onClick={() => go('quiz/persona')}>See my persona</LinkButton>
                  <LinkButton onClick={onDone}>Not now</LinkButton>
                </div>
              </>
            ) : partway ? (
              <>
                <Button variant="primary" onClick={() => go('quiz/play')} disabled={busy}>
                  Keep swiping
                </Button>
                <div className="quiz-screen__links">
                  <LinkButton onClick={startOver} disabled={busy}>
                    {busy ? 'Starting over…' : 'Start over'}
                  </LinkButton>
                  <LinkButton onClick={onDone}>Skip for now</LinkButton>
                </div>
              </>
            ) : (
              <>
                <Button variant="primary" onClick={() => go('quiz/play')}>
                  Start swiping
                </Button>
                <LinkButton onClick={onDone}>Skip for now</LinkButton>
              </>
            )}
            {restart === 'failed' && (
              <p className="quiz-screen__error" role="alert">
                Couldn’t clear your old answers. Check your connection and try again?
              </p>
            )}
          </>
        }
      >
        <section className="card quiz-intro__how" aria-labelledby="quiz-intro-how">
          <p className="overline">{VIBE_SWIPE_LINE}</p>
          <h2 id="quiz-intro-how" className="quiz-intro__how-title">
            {finished ? 'You’ve swiped the lot' : partway ? `You’re ${swiped} ${swiped === 1 ? 'swipe' : 'swipes'} in` : 'Swipe, don’t think'}
          </h2>
          <ul className="quiz-intro__gestures" aria-label="How to swipe">
            {GESTURES.map(({ id, icon, label, direction, turn }) => (
              <li key={id} className={`quiz-intro__gesture quiz-intro__gesture--${id}`}>
                <span className="quiz-intro__gesture-icon" aria-hidden="true">
                  <img src={icon} alt="" width={20} height={20} />
                </span>
                <span className="quiz-intro__gesture-label">
                  <img
                    className="quiz-intro__gesture-arrow"
                    src={iconArrow}
                    alt=""
                    width={12}
                    height={12}
                    style={{ transform: `rotate(${turn}deg)` }}
                  />
                  <ScreenReaderText>Swipe {direction}: </ScreenReaderText>
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card quiz-intro__unlock">
          <VibeChart
            series={[{ scores: EXAMPLE_VIBE, color: 'var(--color-amber)', fillOpacity: 0.15, dots: true }]}
            width={124}
            label="Example vibe chart"
          />
          <div className="quiz-intro__unlock-text">
            <p className="overline">You’ll unlock</p>
            <h2>Your vibe chart and travel persona</h2>
            <p>Share it with the squad. We blend it into every trip plan.</p>
          </div>
        </section>

        <GhoomMateTip>No wrong answers, mate. Not sure? Skip the card.</GhoomMateTip>
      </OnboardingLayout>
    </QuizScreen>
  )
}
