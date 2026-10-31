import grid1 from '../assets/figma/photo-grid-1.svg'
import grid3 from '../assets/figma/photo-grid-3.svg'
import grid4 from '../assets/figma/photo-grid-4.svg'
import grid5 from '../assets/figma/photo-grid-5.svg'
import grid6 from '../assets/figma/photo-grid-6.svg'
import photoVagator from '../assets/figma/photo-vagator.svg'
import type { PersonId } from './people'

export type TripStatus = 'live' | 'planning' | 'upcoming' | 'completed'

export type Trip = {
  id: string
  name: string
  group: string
  place: string
  dates: string
  status: TripStatus
  members: PersonId[]
  cover: string
  /** Short status line, e.g. "2 votes need you" or "412 pics" */
  note: string
  /** Countdown for planned trips, e.g. "In 42 days" */
  startsIn?: string
  /** Completed trips: what you still owe, if anything */
  balance?: string
}

export type LiveTrip = Trip & {
  day: number
  totalDays: number
  /** Id of the next stop in the itinerary data */
  nextStopId: string
}

// Mock data until the trips service exists. "Today" is Sat 31 Oct, Day 2 of the Goa trip.
export const LIVE_TRIP: LiveTrip = {
  id: 'goa',
  name: 'Goa Trip',
  group: 'Goa Gang',
  place: 'North Goa',
  dates: 'Fri 30 Oct – Mon 2 Nov',
  status: 'live',
  members: ['you', 'riya', 'kabir', 'meera', 'dev'],
  cover: photoVagator,
  note: '3 of you picked the sunset cruise',
  day: 2,
  totalDays: 4,
  nextStopId: 'mandovi-cruise',
}

export const UPCOMING_TRIPS: Trip[] = [
  {
    id: 'manali',
    name: 'Manali Snow Escape',
    group: 'Mountain Crew',
    place: 'Manali',
    dates: 'Sat 12 – Wed 16 Dec',
    status: 'planning',
    members: ['you', 'riya', 'meera', 'dev'],
    cover: grid1,
    note: '2 votes need you',
    startsIn: 'In 42 days',
  },
  {
    id: 'pondicherry',
    name: 'Pondicherry Long Weekend',
    group: 'Café Hoppers',
    place: 'Pondicherry',
    dates: 'Fri 22 – Mon 25 Jan',
    status: 'upcoming',
    members: ['you', 'kabir', 'riya'],
    cover: grid4,
    note: 'Stays booked',
    startsIn: 'In 83 days',
  },
]

export const PAST_TRIPS: Trip[] = [
  {
    id: 'rishikesh',
    name: 'Rishikesh Rafting',
    group: 'Lake City Squad',
    place: 'Rishikesh',
    dates: 'Aug 2026',
    status: 'completed',
    members: ['you', 'riya', 'kabir', 'meera', 'dev'],
    cover: grid3,
    note: '412 pics',
  },
  {
    id: 'jaipur',
    name: 'Jaipur Pink City',
    group: 'Café Hoppers',
    place: 'Jaipur',
    dates: 'Mar 2026',
    status: 'completed',
    members: ['you', 'kabir', 'riya'],
    cover: grid5,
    note: '288 pics',
  },
  {
    id: 'hampi',
    name: 'Hampi Ruins',
    group: 'Mountain Crew',
    place: 'Hampi',
    dates: 'Dec 2025',
    status: 'completed',
    members: ['you', 'meera', 'dev'],
    cover: grid6,
    note: '196 pics',
    balance: '₹320',
  },
]

export const TODAY = 'Sat, 31 Oct'
