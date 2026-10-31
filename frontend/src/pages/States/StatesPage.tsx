import { useEffect, useState } from 'react'
import iconPlus from '../../assets/figma/icon-plus.svg'
import { Button, LinkButton } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { EmptyState } from '../../components/states/EmptyState'
import { ErrorState } from '../../components/states/ErrorState'
import { OfflineBanner } from '../../components/states/OfflineBanner'
import { Skeleton } from '../../components/states/Skeleton'
import { UPCOMING_TRIPS } from '../../data/trips'
import { useNavigate } from '../../hooks/navigation'
import './StatesPage.css'

const DEMOS = [
  { id: 'loading', label: 'Loading' },
  { id: 'empty', label: 'Empty' },
  { id: 'error', label: 'Error' },
  { id: 'offline', label: 'Offline' },
] as const

type DemoId = (typeof DEMOS)[number]['id']

const RETRY_MS = 1000

/** Gallery of the shared system states, each shown in context. */
export function StatesPage() {
  const navigate = useNavigate()
  const [demo, setDemo] = useState<DemoId>('loading')

  return (
    <OnboardingLayout
      eyebrow="Design system"
      title="System states"
      subtitle="Loading, empty, error and offline, in context."
      onBack={() => navigate('')}
      bodyClassName="states-page"
    >
      <div className="states-page__tabs no-scrollbar" role="group" aria-label="Show state">
        {DEMOS.map((d) => (
          <Chip key={d.id} selected={demo === d.id} onClick={() => setDemo(d.id)}>
            {d.label}
          </Chip>
        ))}
      </div>

      {demo === 'loading' && <LoadingDemo />}
      {demo === 'empty' && <EmptyDemo />}
      {demo === 'error' && <ErrorDemo />}
      {demo === 'offline' && <OfflineDemo />}
    </OnboardingLayout>
  )
}

/** Home while trips are on their way */
function HomeSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="states-page__stack" aria-busy="true">
      <p className="states-page__sr">Loading your trips…</p>
      <div className="card states-skeleton__live">
        <Skeleton variant="card" height={128} radius={16} />
        <Skeleton width="60%" height={17} />
        <Skeleton width="40%" height={11} />
        <div className="states-skeleton__shortcuts">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} variant="circle" width={40} />
          ))}
        </div>
      </div>
      <Skeleton width={140} height={18} />
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="list-card states-row">
      <Skeleton variant="card" width={56} height={56} radius={14} />
      <div className="states-row__info">
        <Skeleton width="65%" height={14} />
        <Skeleton width="85%" height={10} />
        <Skeleton width={64} height={18} radius={8} />
      </div>
    </div>
  )
}

function LoadingDemo() {
  return (
    <>
      <p className="states-page__caption">Home while your trips load. Shapes match the real cards so nothing jumps.</p>
      <HomeSkeleton />
    </>
  )
}

function EmptyDemo() {
  const navigate = useNavigate()

  return (
    <>
      <p className="states-page__caption">Home before your first trip. One friendly line and one thing to do.</p>
      <EmptyState
        title="No trips yet"
        text="Plan one with your squad, or jump into a trip a friend invited you to."
        action={{ label: 'Plan a trip', icon: iconPlus, onClick: () => navigate('create/destination') }}
      />
      <EmptyState
        size="compact"
        title="Nothing planned for Day 3 yet"
        text="Add a stop, or tap me and say “Plan Day 3”."
        action={{ label: 'Add a stop', icon: iconPlus, onClick: () => navigate('trip/itinerary/add') }}
      />
    </>
  )
}

function ErrorDemo() {
  const [status, setStatus] = useState<'error' | 'retrying' | 'loaded'>('error')

  // TODO: the real screens retry the failed request; this fakes a 1s round trip
  useEffect(() => {
    if (status !== 'retrying') return
    const timer = window.setTimeout(() => setStatus('loaded'), RETRY_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  return (
    <>
      <p className="states-page__caption">A request failed. Say so plainly and offer a retry.</p>
      {status === 'error' && (
        <ErrorState
          title="Couldn’t load your trips"
          text="The network dropped the ball. Give it another go?"
          detail="Error 503 · trips/list timed out after 10s · req 7f3a91c2"
          onRetry={() => setStatus('retrying')}
        />
      )}
      {status === 'retrying' && (
        <div className="states-page__stack" aria-busy="true">
          <p className="states-page__sr">Trying again…</p>
          <SkeletonRow />
          <SkeletonRow />
        </div>
      )}
      {status === 'loaded' && (
        <>
          <ul className="states-page__stack" aria-label="Upcoming trips">
            {UPCOMING_TRIPS.map((trip) => (
              <li key={trip.id} className="list-card states-row">
                <img className="states-row__cover" src={trip.cover} alt="" width={56} height={56} />
                <div className="states-row__info">
                  <p className="states-row__name">{trip.name}</p>
                  <p className="states-row__meta">
                    {trip.dates} · {trip.members.length} mates
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <LinkButton className="states-page__reset" onClick={() => setStatus('error')}>
            Show the error again
          </LinkButton>
        </>
      )}
    </>
  )
}

function OfflineDemo() {
  return (
    <>
      <p className="states-page__caption">
        In the app this pill sits under the status bar on every screen, and says “Back online” for a moment when the
        connection returns.
      </p>
      <div className="states-offline__stage">
        <OfflineBanner preview="offline" />
        <OfflineBanner preview="back" />
      </div>
      <section className="card states-offline__try">
        <p className="overline">Try it live</p>
        <p className="states-offline__text">Turn off Wi-Fi, or fake it here. The real banner shows up at the top.</p>
        <div className="states-offline__actions">
          {/* Dispatches the same window events the banner listens to; navigator.onLine doesn’t change */}
          <Button variant="primary" onClick={() => window.dispatchEvent(new Event('offline'))}>
            Go offline
          </Button>
          <Button variant="outline" onClick={() => window.dispatchEvent(new Event('online'))}>
            Back online
          </Button>
        </div>
      </section>
    </>
  )
}
