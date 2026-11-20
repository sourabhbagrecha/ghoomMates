import photoVagator from '../assets/figma/photo-vagator.svg'
import { destinationFor, findDestination } from '../pages/CreateTrip/createTripData'

/**
 * Cover image for a trip: its destination's real photo, found by the create-flow id stored as `cover` or else by the
 * destination's name ("Kasol" is Kullu-Manali). A beach illustration only for places we have no guide for.
 */
export const tripCover = (trip: { cover?: string; destination?: string }) =>
  (findDestination(trip.cover ?? null) ?? destinationFor(trip.destination))?.photo ?? photoVagator
