import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { activeTrip, formatTripDates } from '../../data/activeTrip'
import { useNavigate } from '../../hooks/navigation'
import { getStoredUser } from '../../services/authService'
import { tripsApi, type DraftPlan, type DraftStop, type NewTrip, type TripDetail } from '../../services/tripsService'
import {
  DEFAULT_DESTINATION,
  VIBE,
  budgetLabel,
  destinationName,
  findDestination,
  generatingSteps,
  initialTrip,
  isCreateStep,
  suggestedTripName,
  type CreateStep,
  type TripDetails,
} from './createTripData'
import { DatesStep } from './DatesStep'
import { DestinationStep } from './DestinationStep'
import { DraftStep } from './DraftStep'
import { GeneratingStep } from './GeneratingStep'
import { SquadStep } from './SquadStep'
import { VibeStep } from './VibeStep'

/** What the backend stores for the details entered in the flow */
function toNewTrip(trip: TripDetails): NewTrip {
  const tweaks = trip.tweaks.map((id) => VIBE.tweaks.find((t) => t.id === id)?.label ?? id)
  return {
    name: trip.name.trim() || suggestedTripName(trip.destination),
    groupName: trip.group.trim() || undefined,
    destination: destinationName(trip.destination),
    startDate: trip.flexible ? null : trip.start,
    endDate: trip.flexible ? null : (trip.end ?? trip.start),
    budget: budgetLabel(trip.budget),
    cover: findDestination(trip.destination)?.id ?? '',
    details: { tweaks, flexibleDays: trip.flexible ? trip.flexibleDays : undefined, budgetLabel: budgetLabel(trip.budget) },
  }
}

/**
 * Create a trip: #/create/<step>
 *   destination → dates → squad → vibe → generating → draft → #/trip/members
 * Holds what the user enters so it survives moving back and forth between steps. The trip is saved
 * when the plan is built (and updated if you go back and change details); sharing the draft saves
 * it as the trip's itinerary and opens the invite screen.
 */
export function CreateTripRoutes({ path }: { path: string[] }): JSX.Element {
  const navigate = useNavigate()
  const [trip, setTrip] = useState<TripDetails>(initialTrip)
  const [created, setCreated] = useState<TripDetail | null>(null)
  const [plan, setPlan] = useState<DraftPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const update = (patch: Partial<TripDetails>) => setTrip((t) => ({ ...t, ...patch }))

  const step: CreateStep = isCreateStep(path[0]) ? path[0] : 'destination'
  const go = (next: CreateStep, options?: { replace?: boolean }) => navigate(`create/${next}`, options)

  // Keep the trip name in step with the place, unless the user typed their own
  const pickDestination = (id: string) =>
    setTrip((t) => {
      const autoName = !t.name.trim() || t.name === suggestedTripName(t.destination ?? DEFAULT_DESTINATION)
      return { ...t, destination: id, name: autoName ? suggestedTripName(id) : t.name }
    })

  // Saves the trip (creating it the first time) and asks GhoomMate for a draft plan
  const createdRef = useRef(created)
  createdRef.current = created
  const build = useCallback(async () => {
    setError(null)
    setPlan(null)
    try {
      const input = toNewTrip(trip)
      const saved = createdRef.current ? await tripsApi.update(createdRef.current.id, input) : await tripsApi.create(input)
      setCreated(saved)
      setPlan(await tripsApi.draft(saved.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the plan')
    }
  }, [trip])

  const building = step === 'generating'
  useEffect(() => {
    if (building) void build()
    // Only when arriving on the generating step
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building])

  const regenerateDay = async (index: number) => {
    if (!created) return null
    try {
      const fresh = await tripsApi.draft(created.id, { day: index + 1 })
      return fresh.days[0] ?? null
    } catch {
      return null
    }
  }

  const share = async (days: { title: string; stops: DraftStop[] }[]) => {
    if (!created) return
    setSharing(true)
    setShareError(null)
    try {
      const itinerary = await tripsApi.saveItinerary(created.id, days)
      activeTrip.open(created.id, created)
      activeTrip.setItinerary(created.id, itinerary)
      void activeTrip.loadTrips()
      // Straight to the invite link and QR, so the squad can join the plan
      navigate('trip/members', { replace: true })
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Could not save the plan')
      setSharing(false)
    }
  }

  const place = destinationName(trip.destination)
  const userName = getStoredUser()?.name ?? ''

  switch (step) {
    case 'destination':
      return (
        <DestinationStep
          destination={trip.destination}
          onPick={pickDestination}
          onBack={() => navigate('')}
          onContinue={() => go('dates')}
        />
      )
    case 'dates':
      return <DatesStep trip={trip} onChange={update} onBack={() => go('destination')} onContinue={() => go('squad')} />
    case 'squad':
      return <SquadStep trip={trip} userName={userName} onChange={update} onBack={() => go('dates')} onContinue={() => go('vibe')} />
    case 'vibe':
      return <VibeStep trip={trip} onChange={update} onBack={() => go('squad')} onBuild={() => go('generating')} />
    case 'generating':
      return (
        <GeneratingStep
          destination={place}
          steps={generatingSteps(budgetLabel(trip.budget), place)}
          ready={!!plan}
          error={error}
          onRetry={() => void build()}
          onCancel={() => go('vibe', { replace: true })}
          // Replace, so Back from the draft doesn't land on the loader again
          onDone={() => go('draft', { replace: true })}
        />
      )
    case 'draft': {
      if (!created || !plan) {
        // Reloaded on the draft: the in-progress plan is gone, so start again from the details
        return <DatesStep trip={trip} onChange={update} onBack={() => go('destination')} onContinue={() => go('squad')} />
      }
      const mates = created.members.length
      return (
        <DraftStep
          key={created.id + plan.days.length}
          tripName={created.name}
          dates={formatTripDates(created)}
          startDate={created.startDate}
          summary={`${mates} ${mates === 1 ? 'traveller' : 'mates'} · ${budgetLabel(trip.budget)} each`}
          plan={plan}
          sharing={sharing}
          error={shareError}
          onBack={() => go('vibe')}
          onEditDetails={() => go('dates')}
          onRegenerateDay={regenerateDay}
          onShare={(days) => void share(days)}
        />
      )
    }
  }
}
