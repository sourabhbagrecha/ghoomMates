import { Fragment, useEffect, useMemo, useState } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import { Chip } from '../../components/Chip'
import { GhoomMateTip } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { SectionHeader } from '../../components/SectionHeader'
import { EmptyState } from '../../components/states/EmptyState'
import { ErrorState } from '../../components/states/ErrorState'
import { Skeleton } from '../../components/states/Skeleton'
import { useActiveTrip } from '../../data/activeTrip'
import { addDays } from '../../data/tripDates'
import { useNavigate } from '../../hooks/navigation'
import type { AnyEvent, EventCrowd, EventInstance } from '../../services/eventsService'
import { AddToTripSheet } from './AddToTripSheet'
import { EventCard } from './EventCard'
import { PlanAroundSheet } from './PlanAroundSheet'
import { daysWithStop, groupByWeek, tripOverlaps } from './eventsLogic'
import { useEventList } from './useEventList'
import './EventsPage.css'

type Filter = 'all' | 'week' | 'month' | 'trip'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Everything ahead' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'Next 30 days' },
  { id: 'trip', label: 'On our trip' },
]

/** The event a link points at: #/trip/explore/events?e=diwali */
const linkedEvent = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('e')

/**
 * Mewar Utsav: Udaipur's festivals, fairs and nightly shows, week by week. Each card says when, where, how crowded it gets
 * and how to join respectfully, and lets the squad put it in the plan or plan around the crowd.
 */
export function EventsPage() {
  const navigate = useNavigate()
  const { trip, itinerary } = useActiveTrip()
  const { list, error, today, reload } = useEventList()
  const [filter, setFilter] = useState<Filter>('all')
  const [planning, setPlanning] = useState<(AnyEvent & { crowd: EventCrowd }) | null>(null)
  const [adding, setAdding] = useState<AnyEvent | null>(null)
  const focusId = linkedEvent()

  const dated = !!trip?.startDate
  const overlaps = useMemo(() => (list && trip ? tripOverlaps(list.items, trip) : []), [list, trip])
  const tripDayOf = (event: AnyEvent) => overlaps.find((o) => o.item.key === ('key' in event ? event.key : ''))?.dayNumber ?? null

  const visible = useMemo(() => {
    if (!list) return []
    const inside = (i: EventInstance, days: number) => i.from <= addDays(today, days) && i.to >= today
    switch (filter) {
      case 'week':
        return list.items.filter((i) => inside(i, 6))
      case 'month':
        return list.items.filter((i) => inside(i, 30))
      case 'trip':
        return overlaps.map((o) => o.item)
      default:
        return list.items
    }
  }, [list, filter, today, overlaps])

  const groups = useMemo(() => groupByWeek(visible, today), [visible, today])
  const everyEvening = list?.recurring ?? []
  const undated = filter === 'all' ? (list?.undated ?? []) : []

  // A link to one event scrolls to it once the list is on screen
  useEffect(() => {
    if (!list || !focusId) return
    document.getElementById(`event-${focusId}`)?.scrollIntoView({ block: 'start' })
  }, [list, focusId])

  const card = (event: AnyEvent) => (
    <EventCard
      key={'key' in event ? event.key : event.id}
      event={event}
      tripDay={tripDayOf(event)}
      addedDays={event.stop ? daysWithStop(itinerary, event.stop.title) : []}
      canAdd={!!trip}
      focus={focusId === event.id}
      onAdd={() => setAdding(event)}
      onPlan={() => 'crowd' in event && setPlanning(event)}
    />
  )

  const evening = everyEvening.length > 0 && (
    <section className="events-group" aria-label="Every evening">
      <SectionHeader title="Every evening" />
      <div className="events-stack">{everyEvening.map(card)}</div>
    </section>
  )

  const nothing = !!list && groups.length === 0 && everyEvening.length === 0

  return (
    <>
      <OnboardingLayout
        eyebrow="Udaipur · living heritage"
        title="Mewar Utsav"
        onBack={() => navigate('trip/explore')}
        headerBg={headerBg}
        headerHeight={170}
        bodyClassName="events-page__body"
      >
        <GhoomMateTip>Join a festival with care and it becomes the best day of the trip. Tap Plan around it to dodge the crush.</GhoomMateTip>

        <div className="events-filters no-scrollbar" role="group" aria-label="Show">
          {FILTERS.filter((f) => f.id !== 'trip' || dated).map((f) => (
            <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </Chip>
          ))}
        </div>

        {error && !list && (
          <ErrorState
            title="Couldn’t load the festivals"
            text="Check your connection and give it another go."
            detail={error}
            onRetry={reload}
          />
        )}

        {!list && !error && (
          <div className="events-stack" aria-busy="true" aria-label="Loading the festivals">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="card" height={190} radius={22} />
            ))}
          </div>
        )}

        {nothing && (
          <EmptyState
            size="compact"
            headingLevel={3}
            title={filter === 'trip' ? 'No festival on your trip dates' : 'Nothing in that window'}
            text={filter === 'trip' ? 'The nightly shows are still on. Try “Everything ahead” for what’s coming.' : 'Try a wider window to see what’s coming.'}
            action={{ label: 'Show everything ahead', onClick: () => setFilter('all') }}
          />
        )}

        {list && (
          <>
            {groups[0]?.label !== 'This week' && evening}
            {groups.map((group, index) => (
              <Fragment key={group.key}>
                <section className="events-group" aria-label={group.label}>
                  <SectionHeader title={group.label} />
                  <div className="events-stack">{group.items.map(card)}</div>
                </section>
                {index === 0 && group.label === 'This week' && evening}
              </Fragment>
            ))}
            {undated.length > 0 && (
              <section className="events-group" aria-label="Dates not announced yet">
                <SectionHeader title="Dates announced closer to the time" />
                <div className="events-stack">{undated.map(card)}</div>
              </section>
            )}
            <p className="events-footnote">
              Dates come from the panchang and official Rajasthan Tourism listings, checked for 2026–27. Crowd levels are planning estimates from the same model as the
              heritage map. Festivals are for the people who keep them: join as a guest.
            </p>
          </>
        )}
      </OnboardingLayout>

      {planning && (
        <PlanAroundSheet
          event={planning}
          onClose={() => setPlanning(null)}
          onAdd={
            planning.stop && trip
              ? () => {
                  const event = planning
                  setPlanning(null)
                  setAdding(event)
                }
              : undefined
          }
        />
      )}
      {adding && trip && <AddToTripSheet event={adding} trip={trip} days={itinerary} onClose={() => setAdding(null)} />}
    </>
  )
}
