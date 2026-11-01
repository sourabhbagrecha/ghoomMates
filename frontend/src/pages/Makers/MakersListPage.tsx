import { useEffect, useState } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import iconMapPin from '../../assets/figma/icon-map-pin-sky.svg'
import { Chip } from '../../components/Chip'
import { GhoomMateTip } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { EmptyState } from '../../components/states/EmptyState'
import { ErrorState } from '../../components/states/ErrorState'
import { Skeleton } from '../../components/states/Skeleton'
import { useActiveTrip } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { makersApi, type Craft, type MakerList, type MakerSummary } from '../../services/makersService'
import { formatINR } from '../Trip/tripFormat'
import { backTarget, durationLabel, groupLabel, hashParams, nextHeritageStop, whereLabel } from './makersData'
import './MakersListPage.css'

// The craft picked last time, so coming back from a maker's page keeps the filter
let lastCraft: string | null = null

/** Every sample maker: filter by craft, and sort by distance from your next heritage stop. */
export function MakersListPage() {
  const navigate = useNavigate()
  const { trip, itinerary } = useActiveTrip()
  const params = hashParams()
  const hashNear = params.get('near')
  const hashCraft = params.get('craft')
  const next = nextHeritageStop(trip, itinerary)
  // Measure from the stop they came from, else the squad's next heritage stop, else the City Palace
  const anchor = hashNear ?? next?.siteId ?? 'city-palace'

  const [craft, setCraft] = useState<string | null>(hashCraft ?? lastCraft)
  const [nearOn, setNearOn] = useState(true)
  const [crafts, setCrafts] = useState<Craft[]>([])
  const [list, setList] = useState<MakerList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    makersApi.crafts().then(setCrafts).catch(() => undefined)
  }, [attempt])

  useEffect(() => {
    let stale = false
    makersApi
      .list({ craft, near: nearOn ? anchor : null })
      .then((result) => {
        if (stale) return
        setList(result)
        setError(null)
      })
      .catch((err) => !stale && setError(err instanceof Error ? err.message : 'Something went wrong'))
    return () => {
      stale = true
    }
  }, [craft, nearOn, anchor, attempt])

  const choose = (id: string | null) => {
    lastCraft = id
    setCraft(id)
  }

  const anchorName = list?.near?.name ?? (hashNear ? 'this stop' : (next?.siteName ?? 'City Palace'))
  const goToMaker = (id: string) => navigate(`trip/explore/makers/${id}${nearOn ? `?near=${anchor}` : ''}`)

  return (
    <OnboardingLayout
      eyebrow={`Udaipur · ${list ? `${list.items.length} sample ${list.items.length === 1 ? 'maker' : 'makers'}` : 'living crafts'}`}
      title="Meet the makers"
      onBack={() => navigate(backTarget('trip/explore'))}
      headerBg={headerBg}
      headerHeight={170}
      bodyClassName="makers-list__body"
    >
      <GhoomMateTip>Ask for the maker, not the shop. A squad that books direct keeps its rupees in the old city.</GhoomMateTip>

      <div className="makers-list__chips no-scrollbar">
        <Chip selected={craft === null} onClick={() => choose(null)}>
          All crafts
        </Chip>
        {crafts.map((c) => (
          <Chip key={c.id} selected={craft === c.id} onClick={() => choose(c.id)}>
            {c.name}
          </Chip>
        ))}
      </div>

      <div className="makers-list__sort" role="group" aria-label="Sort makers">
        <span className="makers-list__sort-label">Sort by</span>
        <Chip selected={nearOn} onClick={() => setNearOn(true)}>
          Near {anchorName}
        </Chip>
        <Chip selected={!nearOn} onClick={() => setNearOn(false)}>
          Our picks
        </Chip>
      </div>
      {nearOn && next && !hashNear && <p className="makers-list__caption">Measured from {next.siteName}, your next heritage stop</p>}

      {error && !list && (
        <ErrorState
          title="Couldn’t load the makers"
          text="Check your connection and give it another go."
          detail={error}
          onRetry={() => {
            setError(null)
            setAttempt((n) => n + 1)
          }}
        />
      )}

      {!list && !error && (
        <div className="makers-list__stack" aria-busy="true" aria-label="Loading makers">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="card" height={118} radius={20} />
          ))}
        </div>
      )}

      {list && list.items.length === 0 && (
        <EmptyState size="compact" headingLevel={3} title="No makers for that craft yet" text="Try another craft, or all crafts." action={{ label: 'Show all crafts', onClick: () => choose(null) }} />
      )}

      {list && list.items.length > 0 && (
        <div className="makers-list__stack">
          {list.items.map((maker) => (
            <MakerCard key={maker.id} maker={maker} craftId={craft} onOpen={() => goToMaker(maker.id)} />
          ))}
        </div>
      )}

      <p className="makers-list__footnote">
        Sample partners: the makers are made up for the demo, while the crafts, the places and the facts are real. Workshop prices are estimates.
      </p>
    </OnboardingLayout>
  )
}

/** Shows the craft the list is filtered to, else the maker's main craft */
function MakerCard({ maker, craftId, onOpen }: { maker: MakerSummary; craftId: string | null; onOpen: () => void }) {
  const main = maker.crafts.find((c) => c.id === craftId) ?? maker.crafts[0]
  const { workshop } = maker
  return (
    <article className="list-card maker-card">
      <button type="button" className="maker-card__open" aria-label={`Open ${maker.name}, ${main.name}`} onClick={onOpen} />
      <div className="maker-card__cover">
        <img src={main.cover} alt="" width={78} height={96} loading="lazy" />
      </div>
      <div className="maker-card__info">
        <div className="maker-card__tags">
          {maker.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
        <h3 className="maker-card__name">{maker.name}</h3>
        <p className="maker-card__craft">{main.name}</p>
        <p className="maker-card__where">
          <img src={iconMapPin} alt="" width={12} height={12} />
          {whereLabel(maker)}
        </p>
        <div className="maker-card__footer">
          <p className="maker-card__price">
            {formatINR(workshop.pricePerPerson)}
            <span>
              {' '}
              /person · {durationLabel(workshop.durationMin)} · {groupLabel(workshop)}
            </span>
          </p>
        </div>
      </div>
    </article>
  )
}
