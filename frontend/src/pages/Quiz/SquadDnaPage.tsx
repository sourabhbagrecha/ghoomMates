import iconCheck from '../../assets/figma/icon-check-success.svg'
import iconStar from '../../assets/figma/icon-star.svg'
import iconWaiting from '../../assets/icons/icon-hourglass-primary.svg'
import { Avatar } from '../../components/Avatar'
import { Button, LinkButton } from '../../components/Button'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { ErrorState } from '../../components/states/ErrorState'
import { Skeleton } from '../../components/states/Skeleton'
import { VibeChart } from '../../components/VibeChart'
import { STYLE_KEYS } from '../../data/taste'
import { VIBE_AXES, type VibeScores } from '../../data/vibe'
import type { SquadInsights } from '../../services/prefsService'
import { tripScope } from '../../services/vibeStorage'
import { loadSquad, squadPersonId, type SquadData } from './decks'
import { QuizScreen, ScreenReaderText, SignInNeeded } from './QuizParts'
import { goBack, useLoad, useSignedIn, useSwipeDraft } from './quizHooks'
import { RULE_CAPTIONS, STYLE_NAMES, axisLabel, dietLine, firstName, listNames, mustDoLine, percent, tripDeckRoute } from './quizData'

type SquadDnaPageProps = {
  tripId: string
  go: (route: string) => void
  onDone: () => void
}

/** How the squad travels together, blended from everyone's swipes. Never says who said no to anything. */
export function SquadDnaPage({ tripId, go, onDone }: SquadDnaPageProps) {
  const signedIn = useSignedIn()
  return signedIn ? <SquadDnaScreen tripId={tripId} go={go} onDone={onDone} /> : <SignInNeeded onBack={onDone} />
}

function SquadDnaScreen({ tripId, go, onDone }: SquadDnaPageProps) {
  const squad = useLoad(tripId, loadSquad)
  const draft = useSwipeDraft(tripScope(tripId))

  const data = squad.status === 'ready' ? squad.data : null
  const answered = new Set(draft?.answers.map((a) => a.cardId))
  const unanswered = data?.deck ? data.deck.cards.filter((c) => !answered.has(c.id)).length : 0
  const city = data?.insights.city ?? null

  const actions = data ? (
    unanswered > 0 ? (
      <>
        <Button variant="primary" onClick={() => go(tripDeckRoute(tripId))}>
          Swipe the deck
        </Button>
        <LinkButton onClick={onDone}>Back to the trip</LinkButton>
      </>
    ) : (
      <Button variant="primary" onClick={onDone}>
        Back to the trip
      </Button>
    )
  ) : undefined

  return (
    <QuizScreen>
      <OnboardingLayout
        eyebrow={city ? `${city} trip` : 'Your trip'}
        title="Squad DNA"
        subtitle="How you all travel, blended into one plan."
        onBack={() => goBack(onDone)}
        bodyClassName="quiz-screen__body"
        actions={actions}
      >
        {squad.status === 'loading' ? (
          <div className="squad-dna__loading" aria-busy="true" role="status">
            <ScreenReaderText>Loading your squad’s DNA…</ScreenReaderText>
            <Skeleton variant="card" height={320} radius={22} />
            <Skeleton variant="card" height={180} radius={22} />
          </div>
        ) : squad.status === 'error' ? (
          <ErrorState
            title="Squad DNA didn’t load"
            text="We couldn’t blend the squad just now. Give it another go?"
            detail={squad.error instanceof Error ? squad.error.message : undefined}
            onRetry={squad.retry}
          />
        ) : data ? (
          <SquadDna data={data} />
        ) : null}
      </OnboardingLayout>
    </QuizScreen>
  )
}

const squadVibeOf = (insights: SquadInsights): VibeScores =>
  Object.fromEntries(VIBE_AXES.map(({ id }) => [id, insights.axes[id]?.mean ?? 0])) as VibeScores

function SquadDna({ data: { insights } }: { data: SquadData }) {
  const me = insights.members.find((m) => m.isMe)
  const squadVibe = squadVibeOf(insights)
  // Your own first name never shows in the nudge: you already know you haven't swiped
  const waitingOn = insights.pending.filter((name) => !me || me.coreDone || name !== firstName(me.name))
  const diet = dietLine(insights.diet, insights.dealbreakers)
  const chartLabel = `Squad vibe: ${VIBE_AXES.map(({ id, label }) => `${label} ${Math.round(squadVibe[id] * 100)}%`).join(', ')}`

  return (
    <>
      <section className="card squad-dna__hero" aria-labelledby="squad-dna-persona">
        <p className="overline">Your squad is</p>
        <h2 id="squad-dna-persona" className="squad-dna__persona">
          {insights.squadPersona ?? 'Still taking shape'}
        </h2>
        <VibeChart
          series={[
            { scores: squadVibe, color: 'var(--color-sky)', fillOpacity: 0.28 },
            ...(me?.vibe ? [{ scores: me.vibe, color: 'var(--color-amber)', fillOpacity: 0.15, dots: true }] : []),
          ]}
          width={240}
          label={chartLabel}
        />
        <div className="squad-dna__legend" aria-hidden="true">
          <span>
            <span className="squad-dna__swatch squad-dna__swatch--squad" />
            Squad
          </span>
          {me?.vibe && (
            <span>
              <span className="squad-dna__swatch squad-dna__swatch--you" />
              You
            </span>
          )}
        </div>
        {insights.twin && (
          <p className="squad-dna__twin">
            Your travel twin: {firstName(insights.twin.name)} · {percent(insights.twin.match)}% match
          </p>
        )}
      </section>

      {waitingOn.length > 0 && (
        <p className="squad-dna__nudge" role="note">
          <img src={iconWaiting} alt="" width={18} height={18} />
          <span>
            Waiting on {listNames(waitingOn)}. You can still build the plan; they’ll fit in once they swipe.
          </span>
        </p>
      )}

      <section className="card squad-dna__section" aria-labelledby="squad-dna-members">
        <h2 id="squad-dna-members" className="quiz-section-title">
          The squad
        </h2>
        <ul className="squad-dna__members">
          {insights.members.map((m) => (
            <li key={m.userId} className="squad-dna__member">
              <Avatar person={squadPersonId(m.userId)} size={36} />
              <span className="squad-dna__member-text">
                <span className="squad-dna__member-name">{m.isMe ? 'You' : firstName(m.name)}</span>
                <span className="squad-dna__member-persona">{m.persona ?? 'No persona yet'}</span>
              </span>
              {m.coreDone ? (
                <span className="squad-dna__status squad-dna__status--done">
                  <img src={iconCheck} alt="" width={14} height={14} />
                  Swiped
                </span>
              ) : (
                <span className="squad-dna__status">Not yet</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {(insights.sharedLoves.length > 0 || insights.splits.length > 0) && (
        <section className="card squad-dna__section" aria-labelledby="squad-dna-vibes">
          <h2 id="squad-dna-vibes" className="quiz-section-title">
            Where you meet
          </h2>
          {insights.sharedLoves.length > 0 && (
            <div className="squad-dna__chips">
              <p className="overline">Everyone loves</p>
              <ul aria-label="Everyone loves">
                {insights.sharedLoves.map((axis) => (
                  <li key={axis} className="squad-dna__chip squad-dna__chip--love">
                    {axisLabel(axis)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {insights.splits.length > 0 && (
            <div className="squad-dna__chips">
              <p className="overline">Split on</p>
              <ul aria-label="Split on">
                {insights.splits.map((axis) => (
                  <li key={axis} className="squad-dna__chip">
                    {axisLabel(axis)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="card squad-dna__section" aria-labelledby="squad-dna-style">
        <h2 id="squad-dna-style" className="quiz-section-title">
          How we’ll travel
        </h2>
        <ul className="squad-dna__style">
          {STYLE_KEYS.filter((key) => insights.style[key]).map((key) => {
            const { label, rule } = insights.style[key]
            return (
              <li key={key} className="squad-dna__style-row">
                <span className="squad-dna__style-text">
                  <span className="squad-dna__style-name">{STYLE_NAMES[key]}</span>
                  <span className="squad-dna__style-label">{label}</span>
                </span>
                <span className="squad-dna__rule">{RULE_CAPTIONS[rule] ?? rule}</span>
              </li>
            )
          })}
        </ul>
        {diet && (
          <p className="squad-dna__diet">
            <span className="overline">Food and hard noes</span>
            <span>{diet}</span>
            <span className="squad-dna__caption">Planned around the whole squad. We never say whose.</span>
          </p>
        )}
      </section>

      {insights.mustDos.length > 0 && (
        <section className="card squad-dna__section" aria-labelledby="squad-dna-musts">
          <h2 id="squad-dna-musts" className="quiz-section-title">
            Must-dos
          </h2>
          <ul className="squad-dna__picks">
            {insights.mustDos.map((pick) => (
              <li key={pick.cardId} className="squad-dna__pick">
                <img src={iconStar} alt="" width={16} height={16} />
                <span className="squad-dna__pick-text">
                  <span className="squad-dna__pick-title">{pick.title}</span>
                  <span className="squad-dna__pick-meta">{mustDoLine(pick.fans)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {insights.consensus.length > 0 && (
        <section className="card squad-dna__section" aria-labelledby="squad-dna-consensus">
          <h2 id="squad-dna-consensus" className="quiz-section-title">
            Everyone’s in
          </h2>
          <ul className="squad-dna__picks">
            {insights.consensus.map((pick) => (
              <li key={pick.cardId} className="squad-dna__pick">
                <span className="squad-dna__pick-text">
                  <span className="squad-dna__pick-title">{pick.title}</span>
                </span>
                <span className="squad-dna__count">
                  {pick.likes} of {pick.answered} liked
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
