import { useState } from 'react'
import { Button, LinkButton } from '../../components/Button'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { EmptyState } from '../../components/states/EmptyState'
import { ErrorState } from '../../components/states/ErrorState'
import { Skeleton } from '../../components/states/Skeleton'
import { VibeChart } from '../../components/VibeChart'
import { activeTrip } from '../../data/activeTrip'
import { VIBE_AXES } from '../../data/vibe'
import { loadPersona, restartCore, type PersonaData } from './decks'
import { QuizScreen, ScreenReaderText, StyleMeters } from './QuizParts'
import { goBack, useLoad, useSignedIn } from './quizHooks'
import { STYLE_METERS, VIBE_SWIPE_LINE, dietLine, tagLabel, tripDeckRoute } from './quizData'

type PersonaPageProps = {
  go: (route: string) => void
  onDone: () => void
}

/** Your travel persona: from the swipes on this device, else your profile */
export function PersonaPage({ go, onDone }: PersonaPageProps) {
  const signedIn = useSignedIn()
  const persona = useLoad(signedIn ? 'signed-in' : 'signed-out', loadPersona)
  const [restart, setRestart] = useState<'idle' | 'busy' | 'failed'>('idle')

  const retake = () => {
    setRestart('busy')
    restartCore().then(
      () => go('quiz/play'),
      () => setRestart('failed'),
    )
  }

  const data = persona.status === 'ready' ? persona.data : null
  // Straight on to the open trip's deck, when there is one to swipe
  const tripId = signedIn ? activeTrip.get().tripId : null
  const busy = restart === 'busy'

  const actions = data ? (
    <>
      {tripId ? (
        <Button variant="primary" onClick={() => go(tripDeckRoute(tripId))}>
          Swipe your trip’s deck
        </Button>
      ) : (
        <Button variant="primary" onClick={onDone}>
          Let’s go
        </Button>
      )}
      <div className="quiz-screen__links">
        {tripId && <LinkButton onClick={onDone}>Not now</LinkButton>}
        <LinkButton onClick={retake} disabled={busy}>
          {busy ? 'Starting over…' : 'Retake'}
        </LinkButton>
      </div>
      {restart === 'failed' && (
        <p className="quiz-screen__error" role="alert">
          Couldn’t clear your old answers. Check your connection and try again?
        </p>
      )}
    </>
  ) : undefined

  return (
    <QuizScreen>
      <OnboardingLayout
        eyebrow="Your travel persona"
        title="Meet your vibe"
        onBack={() => goBack(onDone)}
        bodyClassName="quiz-screen__body"
        actions={actions}
      >
        {persona.status === 'loading' ? (
          <div className="card quiz-persona__hero" aria-busy="true" role="status">
            <ScreenReaderText>Loading your persona…</ScreenReaderText>
            <Skeleton width={120} />
            <Skeleton width={220} height={24} />
            <Skeleton width={180} />
            <Skeleton variant="circle" width={196} />
          </div>
        ) : persona.status === 'error' ? (
          <ErrorState
            title="Your persona didn’t load"
            text="We couldn’t fetch your vibe. Give it another go?"
            detail={persona.error instanceof Error ? persona.error.message : undefined}
            onRetry={persona.retry}
          />
        ) : data ? (
          <PersonaResult data={data} />
        ) : (
          <EmptyState
            title="No vibe yet"
            text={`${VIBE_SWIPE_LINE} and we’ll show you your travel persona.`}
            action={{ label: 'Start swiping', onClick: () => go('quiz/play') }}
          />
        )}
      </OnboardingLayout>
    </QuizScreen>
  )
}

function PersonaResult({ data: { summary, legacy } }: { data: PersonaData }) {
  const { persona } = summary
  const diet = dietLine(summary.diet, summary.dealbreakers)
  const hasStyle = STYLE_METERS.some((m) => summary.styleConfidence[m.key] > 0)
  const chartLabel = `Your vibe chart: ${VIBE_AXES.map(({ id, label }) => `${label} ${Math.round(summary.vibe[id] * 100)}%`).join(', ')}`

  return (
    <>
      <section className="card quiz-persona__hero" aria-labelledby="quiz-persona-name">
        <p className="overline">You’re</p>
        <h2 id="quiz-persona-name" className="quiz-persona__name">
          {persona.name}
        </h2>
        <p className="quiz-persona__tagline">{persona.tagline}</p>
        <VibeChart
          series={[{ scores: summary.vibe, color: 'var(--color-amber)', fillOpacity: 0.3, dots: true }]}
          width={240}
          label={chartLabel}
        />
        {persona.badges.length > 0 && (
          <ul className="quiz-persona__badges" aria-label="Your badges">
            {persona.badges.map((badge) => (
              <li key={badge} className="quiz-persona__badge">
                {badge}
              </li>
            ))}
          </ul>
        )}
        {summary.topTags.length > 0 && (
          <ul className="quiz-persona__tags" aria-label="What you’re into">
            {summary.topTags.map((tag) => (
              <li key={tag} className="tag">
                {tagLabel(tag)}
              </li>
            ))}
          </ul>
        )}
        {legacy && <p className="quiz-persona__note">From your old quiz. Swipe the new deck for a sharper read.</p>}
      </section>

      {(diet || hasStyle) && (
        <section className="card quiz-persona__style" aria-labelledby="quiz-persona-style">
          <h2 id="quiz-persona-style" className="quiz-section-title">
            How you travel
          </h2>
          <StyleMeters style={summary.style} confidence={summary.styleConfidence} />
          {diet && (
            <p className="quiz-persona__diet">
              <span className="overline">Food and hard noes</span>
              <span>{diet}</span>
            </p>
          )}
        </section>
      )}
    </>
  )
}

