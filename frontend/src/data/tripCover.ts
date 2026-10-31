import photoVagator from '../assets/figma/photo-vagator.svg'
import { findDestination } from '../pages/CreateTrip/createTripData'

/** Cover image for a trip: its destination's photo from the create flow, or a beach by default */
export const tripCover = (trip: { cover: string }) => findDestination(trip.cover)?.photo ?? photoVagator
