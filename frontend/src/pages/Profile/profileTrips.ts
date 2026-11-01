import { daysUntil, formatTripDates, tripPhase } from '../../data/activeTrip'
import type { TripListItem } from '../../services/tripsService'
import { SQUADS, STATS } from './profileData'

/**
 * Profile's squads and counts, from the trips you are really in. The sample ones in profileData stay until you are in a
 * trip, so a fresh account still has a profile to look at, but a real trip never sits next to a made-up "Mewar Mates".
 */

const mates = (count: number) => `${count} ${count === 1 ? 'mate' : 'mates'}`

function whenOf(trip: TripListItem) {
  const phase = tripPhase(trip)
  if (phase === 'live') return 'live now'
  if (phase === 'past') return formatTripDates(trip)
  const days = daysUntil(trip.startDate)
  if (days === null) return 'dates to pick'
  return days <= 0 ? 'starts today' : days === 1 ? 'tomorrow' : `in ${days} days`
}

export function squadsOf(trips: TripListItem[] | null): typeof SQUADS {
  if (!trips?.length) return SQUADS
  return trips.map((trip) => ({
    id: trip.id,
    name: trip.groupName || trip.name,
    members: trip.members.map((m) => m.memberId),
    detail: `${mates(trip.memberCount)} · ${trip.destination || trip.name} ${whenOf(trip)}`,
  }))
}

export function statsOf(trips: TripListItem[] | null, meId?: string): typeof STATS {
  if (!trips?.length) return STATS
  const places = new Set(trips.map((t) => (t.destination || t.name).trim().toLowerCase()))
  const squad = new Set(trips.flatMap((t) => t.members.map((m) => m.userId)).filter((id) => id !== meId))
  const photos = trips.reduce((total, t) => total + t.photoCount, 0)
  return [
    { label: 'Trips', value: String(trips.length) },
    { label: 'Places', value: String(places.size) },
    { label: 'Photos', value: photos.toLocaleString('en-IN') },
    { label: 'Mates', value: String(squad.size) },
  ]
}
