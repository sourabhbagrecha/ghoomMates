import { useMemo } from 'react'
import iconStar from '../../assets/figma/icon-star.svg'
import { Button, LinkButton } from '../../components/Button'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { EmptyState } from '../../components/states/EmptyState'
import { ErrorState } from '../../components/states/ErrorState'
import { QuizStack } from '../../components/swipe/QuizStack'
import { activeTrip } from '../../data/activeTrip'
import type { Answer, Card, Reply } from '../../data/taste'
import type { TripDeck } from '../../services/prefsService'
import { canUndoAnswer, flushSwipes, recordAnswer, tripScope, undoAnswer, unsentAnswers } from '../../services/vibeStorage'
import { loadTripPlay, photoFor } from './decks'
import { DeckSkeleton, FansLine, QuizProgress, QuizScreen, SignInNeeded } from './QuizParts'
import { useFlushOnLeave, useLoad, useSignedIn, useSwipeDraft } from './quizHooks'
import { SEND_EVERY, squadRoute } from './quizData'

type TripDeckPageProps = {
  tripId: string
  go: (route: string) => void
  onDone: () => void
}

const warn = (error: unknown) => console.warn('Could not save swipes:', error)

/** "Udaipur, Rajasthan" → "Udaipur" */
const cityName = (place: string | null | undefined) => place?.split(',')[0].trim() || null

const deckTitle = (city: string | null) => (city ? `Swipe the ${city} deck` : 'Swipe your trip’s deck')

const isFan = (reply: Reply) => reply.kind === 'swipe' && reply.verdict !== 'nope'
const isLove = (reply: Reply) => reply.kind === 'swipe' && reply.verdict === 'love'

/** A trip's deck: the places and plans for this trip, with which mates are keen on each */
export function TripDeckPage({ tripId, go, onDone }: TripDeckPageProps) {
  const signedIn = useSignedIn()
  return signedIn ? <TripDeckScreen tripId={tripId} go={go} onDone={onDone} /> : <SignInNeeded onBack={onDone} />
}

function TripDeckScreen({ tripId, go, onDone }: TripDeckPageProps) {
  const deck = useLoad(tripId, loadTripPlay)
  useFlushOnLeave(tripScope(tripId))

  if (deck.status === 'ready') return <TripPlay deck={deck.data} go={go} onDone={onDone} />

  // The open trip's destination stands in for the deck's city while it loads
  const open = activeTrip.get().trip
  const city = open?.id === tripId ? cityName(open.destination) : null
  return (
    <QuizScreen longTitle>
      <OnboardingLayout
        eyebrow="Trip deck"
        title={deckTitle(city)}
        onBack={onDone}
        headerExtra={<QuizProgress value={0} max={1} label="Deck progress" />}
        bodyClassName="quiz-screen__body"
      >
        {deck.status === 'loading' ? (
          <DeckSkeleton label="Loading your trip’s deck" />
        ) : (
          <ErrorState
            title="The deck didn’t load"
            text="We couldn’t fetch this trip’s cards. Check your connection and give it another go?"
            detail={deck.error instanceof Error ? deck.error.message : undefined}
            onRetry={deck.retry}
          />
        )}
      </OnboardingLayout>
    </QuizScreen>
  )
}

type TripPlayProps = {
  deck: TripDeck
  go: (route: string) => void
  onDone: () => void
}

function TripPlay({ deck, go, onDone }: TripPlayProps) {
  const scope = tripScope(deck.tripId)
  const draft = useSwipeDraft(scope)

  const answers = useMemo(() => draft?.answers ?? [], [draft])
  const byCard = useMemo(() => new Map<string, Answer>(answers.map((a) => [a.cardId, a])), [answers])
  const remaining = useMemo(() => deck.cards.filter((c) => !byCard.has(c.id)), [deck, byCard])

  const total = deck.cards.length
  const done = total - remaining.length
  const city = cityName(deck.city)
  const toSquad = () => go(squadRoute(deck.tripId))

  const onAnswer = (card: Card, reply: Reply, ms: number) => {
    const last = remaining.every((c) => c.id === card.id)
    const next = recordAnswer(scope, { cardId: card.id, reply, ms }, last)
    if (last || unsentAnswers(next).length >= SEND_EVERY) void flushSwipes(scope).catch(warn)
  }

  const squadLink = (
    <button type="button" className="onboarding__header-link" onClick={toSquad}>
      Squad DNA
    </button>
  )

  if (!total) {
    return (
      <QuizScreen longTitle>
        <OnboardingLayout eyebrow="Trip deck" title={deckTitle(city)} onBack={onDone} bodyClassName="quiz-screen__body">
          <EmptyState
            title="No cards for this trip yet"
            text="Once the trip has a city, we’ll deal a deck of things to do there."
            action={{ label: 'Back to the trip', onClick: onDone }}
          />
        </OnboardingLayout>
      </QuizScreen>
    )
  }

  if (!remaining.length) {
    const loved = deck.cards.filter((c) => {
      const answer = byCard.get(c.id)
      return answer && isLove(answer.reply)
    })
    const liked = deck.cards.filter((c) => {
      const answer = byCard.get(c.id)
      return answer && isFan(answer.reply)
    }).length
    return (
      <QuizScreen>
        <OnboardingLayout
          eyebrow={city ? `${city} deck · all done` : 'Trip deck · all done'}
          title="That’s the deck"
          onBack={onDone}
          headerExtra={<QuizProgress value={total} max={total} label={`${total} of ${total} cards swiped`} />}
          bodyClassName="quiz-screen__body"
          actions={
            <>
              <Button variant="primary" onClick={toSquad}>
                See squad DNA
              </Button>
              <LinkButton onClick={onDone}>Back to the trip</LinkButton>
            </>
          }
        >
          <section className="card trip-deck__done" aria-labelledby="trip-deck-done">
            <p className="overline">Nice one, mate</p>
            <h2 id="trip-deck-done" className="trip-deck__done-title">
              You liked {liked} of {total}
            </h2>
            <p className="trip-deck__done-text">GhoomMate plans around these, and around everyone else’s picks too.</p>
          </section>

          <section className="card trip-deck__musts" aria-labelledby="trip-deck-musts">
            <h2 id="trip-deck-musts" className="quiz-section-title">
              Your must-dos
            </h2>
            {loved.length ? (
              <ul className="trip-deck__must-list">
                {loved.map((card) => (
                  <li key={card.id} className="trip-deck__must">
                    <img src={iconStar} alt="" width={16} height={16} />
                    <span>{card.prompt}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="trip-deck__done-text">None this time. Swipe up on a card to make it a must-do.</p>
            )}
          </section>
        </OnboardingLayout>
      </QuizScreen>
    )
  }

  return (
    <QuizScreen longTitle>
      <OnboardingLayout
        eyebrow={`Trip deck · ${Math.min(done + 1, total)} of ${total}`}
        title={deckTitle(city)}
        onBack={onDone}
        headerRight={squadLink}
        headerExtra={<QuizProgress value={done} max={total} label={`${done} of ${total} cards swiped`} />}
        bodyClassName="quiz-screen__body"
      >
        <div className="quiz-play__stack">
          <QuizStack
            cards={remaining}
            onAnswer={onAnswer}
            onUndo={() => undoAnswer(scope)}
            canUndo={canUndoAnswer(scope, draft)}
            photoFor={photoFor}
            footer={(card) => (card.fans?.length ? <FansLine fans={card.fans} /> : null)}
          />
        </div>
      </OnboardingLayout>
    </QuizScreen>
  )
}
