import { useState, type JSX } from 'react'
import { useNavigate } from '../../hooks/navigation'
import {
  DEFAULT_DESTINATION,
  INITIAL_TRIP,
  budgetLabel,
  destinationName,
  generatingSteps,
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

/**
 * Create a trip: #/create/<step>
 *   destination → dates → squad → vibe → generating → draft → #/plan
 * Holds what the user enters so it survives moving back and forth between steps.
 */
export function CreateTripRoutes({ path }: { path: string[] }): JSX.Element {
  const navigate = useNavigate()
  const [trip, setTrip] = useState<TripDetails>(INITIAL_TRIP)
  const update = (patch: Partial<TripDetails>) => setTrip((t) => ({ ...t, ...patch }))

  const step: CreateStep = isCreateStep(path[0]) ? path[0] : 'destination'
  const go = (next: CreateStep, options?: { replace?: boolean }) => navigate(`create/${next}`, options)

  // Keep the trip name in step with the place, unless the user typed their own
  const pickDestination = (id: string) =>
    setTrip((t) => {
      const autoName = !t.name.trim() || t.name === suggestedTripName(t.destination ?? DEFAULT_DESTINATION)
      return { ...t, destination: id, name: autoName ? suggestedTripName(id) : t.name }
    })

  const place = destinationName(trip.destination)
  const mates = trip.mates.length + 1

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
      return <SquadStep trip={trip} onChange={update} onBack={() => go('dates')} onContinue={() => go('vibe')} />
    case 'vibe':
      return <VibeStep trip={trip} onChange={update} onBack={() => go('squad')} onBuild={() => go('generating')} />
    case 'generating':
      return (
        <GeneratingStep
          destination={place}
          steps={generatingSteps(budgetLabel(trip.budget), place)}
          onCancel={() => go('vibe', { replace: true })}
          // Replace, so Back from the draft doesn't land on the loader again
          onDone={() => go('draft', { replace: true })}
        />
      )
    case 'draft':
      return (
        <DraftStep
          // TODO: the draft is Manali mock data until plan generation is wired up
          tripName={trip.name.trim() || suggestedTripName(trip.destination)}
          summary={`${mates} ${mates === 1 ? 'traveller' : 'mates'} · ${budgetLabel(trip.budget)} each`}
          onBack={() => go('vibe')}
          onEditDetails={() => go('dates')}
          // TODO: actually share the plan with the squad before handing over to planning
          onShare={() => navigate('plan')}
        />
      )
  }
}
