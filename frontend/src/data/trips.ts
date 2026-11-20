import { EXPERIENCE_PHOTOS } from '../pages/Explore/experiencePhotos'
import { DESTINATION_PHOTOS } from './destinationPhotos'
import type { PersonId } from './people'
import { daysUntil, formatDateRange } from './tripDates'

export type TripStatus = 'live' | 'planning' | 'upcoming' | 'completed'

export type Trip = {
  id: string
  name: string
  group: string
  place: string
  dates: string
  /** First day, YYYY-MM-DD, for trips that haven't started */
  startDate?: string
  status: TripStatus
  members: PersonId[]
  cover: string
  /** Short status line, e.g. "2 votes need you" or "412 pics" */
  note: string
  /** Countdown for planned trips, e.g. "In 19 days" */
  startsIn?: string
  /** Completed trips: what you still owe, if anything */
  balance?: string
}

/** "In 19 days", counted from today in India so it stays right whenever the demo runs */
const countdown = (start: string) => {
  const days = daysUntil(start)
  if (days === null) return undefined
  return days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`
}

// Sample trips for the planning and recap screens, which aren't backed by real data yet (your real trips come from
// the trips service). The Mewar Mates' Udaipur weekend is the one planned in src/pages/Plan.
const UDAIPUR_WEEKEND = { start: '2026-11-20', end: '2026-11-23' }
const GOKARNA_LONG_WEEKEND = { start: '2027-01-22', end: '2027-01-25' }

export const UPCOMING_TRIPS: Trip[] = [
  {
    id: 'udaipur-heritage',
    name: 'Udaipur Heritage',
    group: 'Mewar Mates',
    place: 'Udaipur',
    dates: formatDateRange(UDAIPUR_WEEKEND.start, UDAIPUR_WEEKEND.end),
    startDate: UDAIPUR_WEEKEND.start,
    status: 'planning',
    members: ['you', 'riya', 'meera', 'dev'],
    cover: EXPERIENCE_PHOTOS.cityPalace[1].src,
    note: '2 votes need you',
    startsIn: countdown(UDAIPUR_WEEKEND.start),
  },
  {
    id: 'gokarna',
    name: 'Gokarna Long Weekend',
    group: 'Café Hoppers',
    place: 'Gokarna',
    dates: formatDateRange(GOKARNA_LONG_WEEKEND.start, GOKARNA_LONG_WEEKEND.end),
    startDate: GOKARNA_LONG_WEEKEND.start,
    status: 'upcoming',
    members: ['you', 'kabir', 'riya'],
    cover: DESTINATION_PHOTOS.gokarna.src,
    note: 'Stays booked',
    startsIn: countdown(GOKARNA_LONG_WEEKEND.start),
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
    cover: DESTINATION_PHOTOS.rishikesh.src,
    note: '412 pics',
  },
  {
    id: 'jaisalmer',
    name: 'Jaisalmer Golden City',
    group: 'Café Hoppers',
    place: 'Jaisalmer',
    dates: 'Mar 2026',
    status: 'completed',
    members: ['you', 'kabir', 'riya'],
    cover: DESTINATION_PHOTOS.jaisalmer.src,
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
    cover: DESTINATION_PHOTOS.hampi.src,
    note: '196 pics',
    balance: '₹320',
  },
]
