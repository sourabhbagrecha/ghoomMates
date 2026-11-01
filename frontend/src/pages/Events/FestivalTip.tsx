import { tripPhase } from '../../data/tripDates'
import { GhoomMateTip } from '../../components/GhoomMate'
import { useNavigate } from '../../hooks/navigation'
import type { TripDetail } from '../../services/tripsService'
import { experienceCityFor } from '../Explore/experiencesData'
import { tipText, tripOverlaps } from './eventsLogic'
import { useEventList } from './useEventList'
import './FestivalTip.css'

/**
 * On the itinerary: when the trip's dates overlap a festival, GhoomMate says so and what it means for that day
 * (“Your Day 2 is Diwali…”). Renders nothing for a trip without dates, a trip that is over, or a quiet few days.
 */
export function FestivalTip({ trip }: { trip: TripDetail }) {
  const navigate = useNavigate()
  const { list } = useEventList()
  // The calendar is Udaipur's: a trip to another city has nothing to say about it
  if (!list || !trip.startDate || tripPhase(trip) === 'past' || experienceCityFor(trip.destination) !== 'Udaipur') return null

  const [first, ...rest] = tripOverlaps(list.items, trip).filter((o) => o.item.tripTip)
  if (!first) return null

  return (
    <GhoomMateTip>
      {tipText(first.item.tripTip!, first.dayNumber)}{' '}
      <button type="button" className="text-link festival-tip__more" onClick={() => navigate(`trip/explore/events?e=${first.item.id}`)}>
        {rest.length ? `See this and ${rest.length} more` : 'See what’s on'}
      </button>
    </GhoomMateTip>
  )
}
