import iconClock from '../../assets/figma/icon-clock-sky.svg'
import iconMapPin from '../../assets/figma/icon-map-pin-sky.svg'
import { CrowdChip } from '../../components/crowd/Crowd'
import { SectionHeader } from '../../components/SectionHeader'
import { Skeleton } from '../../components/states/Skeleton'
import { useNavigate } from '../../hooks/navigation'
import type { AnyEvent } from '../../services/eventsService'
import { exploreRow, isInstance, isRecurring, relativeLabel, tileFor } from './eventsLogic'
import { useEventList } from './useEventList'
import './EventsSection.css'

/**
 * “This week in Mewar” on the Explore tab: the festivals starting in the next seven days (or the next few coming, when it
 * is a quiet week) and the nightly shows, each with its crowd warning. Opens Mewar Utsav. Hides itself if the calendar
 * can't be loaded, so Explore never shows a hole.
 */
export function EventsSection() {
  const navigate = useNavigate()
  const { list, error, today } = useEventList()
  if (error && !list) return null

  const row = list ? exploreRow(list, today) : null
  const cards: AnyEvent[] = row ? [...row.instances, ...row.recurring] : []
  if (row && cards.length === 0) return null

  return (
    <>
      <SectionHeader
        title={row?.title ?? 'This week in Mewar'}
        action={
          <button type="button" className="text-link" onClick={() => navigate('trip/explore/events')}>
            See all
          </button>
        }
      />
      <div className="utsav-row no-scrollbar">
        {row
          ? cards.map((event) => <UtsavCard key={isInstance(event) ? event.key : event.id} event={event} onOpen={() => navigate(`trip/explore/events?e=${event.id}`)} />)
          : [0, 1].map((i) => (
              <div key={i} className="utsav-card utsav-card--loading" aria-hidden="true">
                <Skeleton height={44} width="70%" />
                <Skeleton height={12} width="90%" />
                <Skeleton height={12} width="60%" />
              </div>
            ))}
      </div>
      <p className="utsav-caption">Festivals, fairs and nightly shows, with crowd warnings from the heritage map. Join as a guest and the day is yours.</p>
    </>
  )
}

function UtsavCard({ event, onOpen }: { event: AnyEvent; onOpen: () => void }) {
  const tile = tileFor(event)
  const badge = isInstance(event) ? relativeLabel(event) : { text: isRecurring(event) ? 'Every night' : 'Dates TBA', soon: false }
  const crowd = 'crowd' in event ? event.crowd : null

  return (
    <article className="utsav-card">
      <button type="button" className="utsav-card__open" aria-label={`${event.name}: ${badge.text}. See details`} onClick={onOpen} />
      <div className="utsav-card__head">
        <div className="utsav-card__tile" aria-hidden="true">
          <span className="utsav-card__tile-top">{tile.top}</span>
          <span className="utsav-card__tile-big">{tile.big}</span>
          <span className="utsav-card__tile-bottom">{tile.bottom}</span>
        </div>
        <div className="utsav-card__title">
          <span className={`utsav-card__badge${badge.soon ? ' utsav-card__badge--soon' : ''}`}>{badge.text}</span>
          <h3 className="utsav-card__name">{event.name}</h3>
          <p className="utsav-card__hindi" lang="hi">
            {event.nameHi}
          </p>
        </div>
      </div>
      <p className="utsav-card__fact">
        <img src={iconMapPin} alt="" width={12} height={12} />
        <span>{event.places[0]?.name}</span>
      </p>
      <p className="utsav-card__fact">
        <img src={iconClock} alt="" width={12} height={12} />
        <span>{event.time.label}</span>
      </p>
      {crowd && (
        <div className="utsav-card__crowd">
          <CrowdChip label={crowd.label} />
          <span className="utsav-card__plan">Plan around it</span>
        </div>
      )}
    </article>
  )
}
