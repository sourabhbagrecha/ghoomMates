import { useMemo, useState, type ReactNode } from 'react'
import { Button, LinkButton } from '../../components/Button'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { ErrorState } from '../../components/states/ErrorState'
import { QuizStack } from '../../components/swipe/QuizStack'
import { scoreAnswers, vibeOf, type Card, type Reply } from '../../data/taste'
import type { CoreDeck } from '../../services/prefsService'
import { CORE_SCOPE, canUndoAnswer, flushSwipes, recordAnswer, saveVibe, undoAnswer, unsentAnswers } from '../../services/vibeStorage'
import { cardsById, loadCorePlay, restartCore, summaryOf } from './decks'
import { DeckSkeleton, LiveVibe, QuizProgress, QuizScreen } from './QuizParts'
import { useFlushOnLeave, useLoad, useSignedIn, useSwipeDraft } from './quizHooks'
import { SEND_EVERY } from './quizData'

type QuizPlayPageProps = {
  go: (route: string) => void
  onDone: () => void
}

const warn = (error: unknown) => console.warn('Could not save swipes:', error)

/** The core Vibe Swipe deck: the stack, a live preview of your vibe, and your answers saved as you go */
export function QuizPlayPage({ go, onDone }: QuizPlayPageProps) {
  const deck = useLoad('core', loadCorePlay)
  useFlushOnLeave(CORE_SCOPE)

  const skipQuiz = (
    <button type="button" className="onboarding__header-link" onClick={onDone}>
      Skip quiz
    </button>
  )

  if (deck.status !== 'ready') {
    return (
      <QuizScreen>
        <OnboardingLayout
          eyebrow="Vibe Swipe"
          title="Swipe your vibe"
          onBack={() => go('quiz')}
          headerRight={skipQuiz}
          headerExtra={<QuizProgress value={0} max={1} label="Deck progress" />}
          bodyClassName="quiz-screen__body"
        >
          {deck.status === 'loading' ? (
            <DeckSkeleton />
          ) : (
            <ErrorState
              title="The deck didn’t load"
              text="We couldn’t fetch your cards. Check your connection and give it another go?"
              detail={deck.error instanceof Error ? deck.error.message : undefined}
              onRetry={deck.retry}
            />
          )}
        </OnboardingLayout>
      </QuizScreen>
    )
  }

  return <CorePlay deck={deck.data} go={go} skipQuiz={skipQuiz} />
}

type CorePlayProps = {
  deck: CoreDeck
  go: (route: string) => void
  skipQuiz: ReactNode
}

function CorePlay({ deck, go, skipQuiz }: CorePlayProps) {
  const signedIn = useSignedIn()
  const draft = useSwipeDraft(CORE_SCOPE)
  const [finishing, setFinishing] = useState(false)
  const [restart, setRestart] = useState<'idle' | 'busy' | 'failed'>('idle')

  const byId = useMemo(() => cardsById(deck.cards), [deck])
  const answers = useMemo(() => draft?.answers ?? [], [draft])
  const answeredIds = useMemo(() => new Set(answers.map((a) => a.cardId)), [answers])
  const remaining = useMemo(() => deck.cards.filter((c) => !answeredIds.has(c.id)), [deck, answeredIds])
  const summary = useMemo(() => summaryOf(scoreAnswers(byId, answers)), [byId, answers])

  const total = deck.cards.length
  const done = total - remaining.length
  const answeredCount = answers.filter((a) => byId[a.cardId] && a.reply.kind !== 'skip').length

  const finish = (answersNow = answers) => {
    setFinishing(true)
    const vibe = vibeOf(scoreAnswers(byId, answersNow))
    if (signedIn) {
      // The server's re-scored vibe wins when the last batch lands; ours stands in if it doesn't
      flushSwipes(CORE_SCOPE).then(
        (res) => saveVibe(res?.summary.vibe ?? vibe),
        (error) => {
          warn(error)
          saveVibe(vibe)
        },
      )
    } else {
      saveVibe(vibe)
    }
    go('quiz/persona')
  }

  const onAnswer = (card: Card, reply: Reply, ms: number) => {
    const last = remaining.every((c) => c.id === card.id)
    const next = recordAnswer(CORE_SCOPE, { cardId: card.id, reply, ms }, last)
    if (last) return finish(next.answers)
    if (signedIn && unsentAnswers(next).length >= SEND_EVERY) void flushSwipes(CORE_SCOPE).catch(warn)
  }

  const startOver = () => {
    setRestart('busy')
    restartCore().then(
      () => setRestart('idle'),
      () => setRestart('failed'),
    )
  }

  const allDone = remaining.length === 0 && !finishing
  const position = Math.min(done + 1, total)

  return (
    <QuizScreen>
      <OnboardingLayout
        eyebrow={allDone ? 'Vibe Swipe · all done' : `Vibe Swipe · ${position} of ${total}`}
        title="Swipe your vibe"
        onBack={() => go('quiz')}
        headerRight={skipQuiz}
        headerExtra={<QuizProgress value={done} max={total} label={`${done} of ${total} cards swiped`} />}
        bodyClassName="quiz-screen__body"
        actions={
          allDone ? (
            <>
              <Button variant="primary" onClick={() => finish()} disabled={restart === 'busy'}>
                See my persona
              </Button>
              <LinkButton onClick={startOver} disabled={restart === 'busy'}>
                {restart === 'busy' ? 'Starting over…' : 'Start over'}
              </LinkButton>
              {restart === 'failed' && (
                <p className="quiz-screen__error" role="alert">
                  Couldn’t clear your old answers. Check your connection and try again?
                </p>
              )}
            </>
          ) : undefined
        }
      >
        {allDone ? (
          <section className="card quiz-play__done">
            <p className="overline">That’s the lot</p>
            <h2 className="quiz-play__done-title">You’ve swiped every card</h2>
            <p className="quiz-play__done-text">Your persona’s ready. Or start over if your vibe’s changed.</p>
          </section>
        ) : (
          <div className="quiz-play__stack">
            <QuizStack
              cards={remaining}
              onAnswer={onAnswer}
              onUndo={() => undoAnswer(CORE_SCOPE)}
              canUndo={canUndoAnswer(CORE_SCOPE, draft) && !finishing}
            />
          </div>
        )}
        <LiveVibe summary={summary} answered={answeredCount} />
      </OnboardingLayout>
    </QuizScreen>
  )
}
