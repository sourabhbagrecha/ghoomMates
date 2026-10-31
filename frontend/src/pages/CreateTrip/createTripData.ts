import grid1 from '../../assets/figma/photo-grid-1.svg'
import grid2 from '../../assets/figma/photo-grid-2.svg'
import grid3 from '../../assets/figma/photo-grid-3.svg'
import grid4 from '../../assets/figma/photo-grid-4.svg'
import grid5 from '../../assets/figma/photo-grid-5.svg'
import grid6 from '../../assets/figma/photo-grid-6.svg'
import photoCruise from '../../assets/figma/photo-cruise.svg'
import photoDinner from '../../assets/figma/photo-dinner.svg'
import photoScooter from '../../assets/figma/photo-scooter.svg'
import photoScuba from '../../assets/figma/photo-scuba.svg'
import photoSeafood from '../../assets/figma/photo-seafood.svg'
import photoSunrise from '../../assets/figma/photo-sunrise.svg'
import photoVagator from '../../assets/figma/photo-vagator.svg'
import type { PersonId } from '../../data/people'

export const CREATE_STEPS = ['destination', 'dates', 'squad', 'vibe', 'generating', 'draft'] as const
export type CreateStep = (typeof CREATE_STEPS)[number]

export const isCreateStep = (value: string | undefined): value is CreateStep =>
  CREATE_STEPS.includes(value as CreateStep)

/* Destinations */

export type Destination = {
  id: string
  name: string
  region: string
  /** e.g. "5 days · from ₹18k" */
  details: string
  tag: string
  photo: string
  /** Suggested trip name when this place is picked */
  tripName: string
  /** Yellow badge on the cover, e.g. "Squad pick" */
  badge?: string
}

export const DESTINATIONS: Destination[] = [
  {
    id: 'manali',
    name: 'Manali',
    region: 'Himachal Pradesh',
    details: '5 days · from ₹18k',
    tag: 'Snow',
    photo: grid1,
    tripName: 'Manali Snow Escape',
    badge: 'Squad pick',
  },
  {
    id: 'rishikesh',
    name: 'Rishikesh',
    region: 'Uttarakhand',
    details: '3 days · from ₹9k',
    tag: 'Adventure',
    photo: grid3,
    tripName: 'Rishikesh Rapids Run',
  },
  {
    id: 'goa',
    name: 'Goa',
    region: 'North Goa',
    details: '4 days · from ₹12k',
    tag: 'Beaches',
    photo: photoVagator,
    tripName: 'Goa Beach Break',
  },
  {
    id: 'coorg',
    name: 'Coorg',
    region: 'Karnataka',
    details: '3 days · from ₹11k',
    tag: 'Chill',
    photo: grid2,
    tripName: 'Coorg Coffee Trail',
  },
  {
    id: 'jaipur',
    name: 'Jaipur',
    region: 'Rajasthan',
    details: '3 days · from ₹10k',
    tag: 'Culture',
    photo: grid6,
    tripName: 'Jaipur Royal Weekend',
  },
  {
    id: 'pondicherry',
    name: 'Pondicherry',
    region: 'Puducherry',
    details: '3 days · from ₹9k',
    tag: 'Food',
    photo: grid4,
    tripName: 'Pondy Café Crawl',
  },
]

export const DEFAULT_DESTINATION = 'manali'

// What “Surprise us” cycles through, best fit for the squad's vibe first
export const SURPRISES = [
  { destination: 'manali', reason: 'Snow at Solang, cosy Old Manali cafés and one big adventure a day. Very you lot.' },
  { destination: 'rishikesh', reason: 'Rafting by day, riverside cafés by night. Adventure and food, sorted.' },
  { destination: 'coorg', reason: 'Waterfall hikes and coffee estates, with a slower pace for the chill ones.' },
]

/* Dates and budget: the calendar shows December 2026 (1 Dec is a Tuesday) */

export const CALENDAR = { year: 2026, month: 11, label: 'December 2026', short: 'Dec' }

export const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const daysInMonth = () => new Date(CALENDAR.year, CALENDAR.month + 1, 0).getDate()

/** Empty cells before the 1st in a Monday-first grid */
export const leadingBlanks = () => (new Date(CALENDAR.year, CALENDAR.month, 1).getDay() + 6) % 7

/** 12 → "Sat, 12 Dec" */
export const formatDay = (day: number) =>
  `${dayNames[new Date(CALENDAR.year, CALENDAR.month, day).getDay()]}, ${day} ${CALENDAR.short}`

/** 12 → "Sat 12" (compact, for day pills) */
export const formatDayShort = (day: number) =>
  `${dayNames[new Date(CALENDAR.year, CALENDAR.month, day).getDay()]} ${day}`

export const FLEXIBLE_LENGTHS = [
  { days: 3, label: 'Long weekend' },
  { days: 5, label: '5 days' },
  { days: 7, label: 'A week' },
]

export const BUDGETS = [
  { id: 'under-10', label: 'Under ₹10k' },
  { id: '10-20', label: '₹10–20k' },
  { id: '20-plus', label: '₹20k+' },
] as const

export type BudgetId = (typeof BUDGETS)[number]['id']

export const budgetLabel = (id: BudgetId) => BUDGETS.find((b) => b.id === id)?.label ?? ''

/* Squad */

export const MATES: { id: Exclude<PersonId, 'you'>; note: string }[] = [
  { id: 'riya', note: '6 trips together' },
  { id: 'kabir', note: '4 trips together' },
  { id: 'meera', note: '3 trips together' },
  { id: 'dev', note: '3 trips together' },
]

export const INVITE_HOST = 'ghoomate.app/t/'

/** "Manali Snow Escape" → "manali-snow-escape" */
export const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'new-trip'

/* Blended vibe */

export const VIBE = {
  persona: 'The Thrill-Seeking Foodies',
  summary: 'Snow thrills by day, great food by night. Nobody’s fussed about clubbing.',
  priorities: [
    { title: 'One big adventure a day', detail: 'Solang slopes, Sissu snow and the Jogini Falls trek' },
    { title: 'Local food over tourist traps', detail: 'Old Manali cafés, momos and a proper Lahauli thali' },
    { title: 'Easy evenings', detail: 'Bonfires and cafés, home before midnight' },
  ],
  tweaks: [
    { id: 'more-adventure', label: 'More adventure' },
    { id: 'more-food', label: 'More food stops' },
    { id: 'slow-mornings', label: 'Slower mornings' },
    { id: 'nightlife', label: 'Some nightlife' },
    { id: 'short-drives', label: 'Shorter drives' },
    { id: 'budget-stays', label: 'Budget stays' },
  ],
}

// Same order and positions as the Itinerary vibe card, scaled up 1.5× (see VibeStep.css)
export const SPIDERWEB_LABELS = [
  { label: 'Adventure', x: 126, y: 25.5, anchor: 'middle' },
  { label: 'Food', x: 194.5, y: 66.75, anchor: 'start' },
  { label: 'Nightlife', x: 194.5, y: 149.25, anchor: 'start' },
  { label: 'Culture', x: 126, y: 190.5, anchor: 'middle' },
  { label: 'Chill', x: 57.5, y: 149.25, anchor: 'end' },
  { label: 'Shops', x: 57.5, y: 66.75, anchor: 'end' },
] as const

/* Generating */

export const generatingSteps = (budget: string, destination: string) => [
  `Finding stays that fit ${budget}`,
  'Matching stops to your vibe',
  `Checking travel times around ${destination}`,
  'Saving room for snow days',
]

/* Draft itinerary: Manali, Sat 12 – Wed 16 Dec */

export type DraftStop = {
  id: string
  time: string
  title: string
  tag: string
  photo: string
}

export type DraftDay = {
  id: string
  date: number
  title: string
  /** The planned stop first, then what “Swap” cycles through */
  stops: DraftStop[][]
}

const stop = (id: string, time: string, title: string, tag: string, photo: string): DraftStop => ({
  id,
  time,
  title,
  tag,
  photo,
})

export const DRAFT = {
  dates: 'Sat 12 – Wed 16 Dec',
  tip: 'Day 3 has the longest drive. Say “start later” and I’ll shift it.',
}

export const DRAFT_DAYS: DraftDay[] = [
  {
    id: 'd1',
    date: 12,
    title: 'Arrive and settle in',
    stops: [
      [
        stop('homestay', '11:00 AM', 'Check in at your Old Manali homestay', 'Stay', grid2),
        stop('hotel-mall-road', '11:00 AM', 'Check in near Mall Road', 'Stay', grid5),
      ],
      [
        stop('riverside-cafe', '01:30 PM', 'Riverside café lunch in Old Manali', 'Food', photoSeafood),
        stop('siddu-lunch', '01:30 PM', 'Siddu and chai at a dhaba', 'Food', photoDinner),
      ],
      [
        stop('hadimba', '04:00 PM', 'Hadimba Temple and cedar forest walk', 'Culture', grid3),
        stop('manu-temple', '04:00 PM', 'Manu Temple and old village lanes', 'Culture', grid6),
      ],
      [
        stop('mall-road', '07:30 PM', 'Mall Road stroll and momos', 'Food', photoDinner),
        stop('tibetan-market', '07:30 PM', 'Tibetan market and thukpa', 'Food', photoSeafood),
      ],
    ],
  },
  {
    id: 'd2',
    date: 13,
    title: 'Snow day at Solang',
    stops: [
      [stop('solang-drive', '08:30 AM', 'Drive up to Solang Valley', 'Travel', photoScooter)],
      [
        stop('solang-ski', '10:00 AM', 'Skiing and snow tubing at Solang', 'Adventure', grid1),
        stop('solang-paragliding', '10:00 AM', 'Paragliding over Solang', 'Adventure', photoScuba),
      ],
      [stop('slope-maggi', '01:00 PM', 'Maggi and chai on the slopes', 'Food', photoDinner)],
      [
        stop('bonfire', '06:00 PM', 'Bonfire night at the homestay', 'Chill', photoSunrise),
        stop('jam-session', '06:00 PM', 'Guitar jam at a Vashisht café', 'Chill', photoCruise),
      ],
    ],
  },
  {
    id: 'd3',
    date: 14,
    title: 'Atal Tunnel and Sissu',
    stops: [
      [stop('atal-tunnel', '08:00 AM', 'Through the Atal Tunnel', 'Travel', grid2)],
      [
        stop('sissu', '10:30 AM', 'Sissu waterfall and snow fields', 'Adventure', grid1),
        stop('sissu-scooter', '10:30 AM', 'Snow scooter ride at Sissu', 'Adventure', photoScooter),
      ],
      [stop('lahauli-thali', '01:30 PM', 'Lahauli thali lunch', 'Food', photoSeafood)],
      [
        stop('hot-chocolate', '06:30 PM', 'Hot chocolate back in Old Manali', 'Chill', photoDinner),
        stop('stargazing', '07:00 PM', 'Stargazing by the Beas', 'Chill', photoCruise),
      ],
    ],
  },
  {
    id: 'd4',
    date: 15,
    title: 'Waterfalls and cafés',
    stops: [
      [
        stop('jogini', '09:00 AM', 'Jogini Falls trek from Vashisht', 'Adventure', grid3),
        stop('sethan', '09:00 AM', 'Snow walk at Sethan village', 'Adventure', grid1),
      ],
      [stop('hot-springs', '12:30 PM', 'Vashisht hot springs', 'Chill', photoScuba)],
      [
        stop('cafe-hop', '03:00 PM', 'Old Manali café hop', 'Food', photoSeafood),
        stop('bakery', '03:00 PM', 'German bakery and apple pie', 'Food', photoDinner),
      ],
      [stop('live-music', '08:00 PM', 'Live music at a riverside café', 'Nightlife', photoCruise)],
    ],
  },
  {
    id: 'd5',
    date: 16,
    title: 'Last bites, then home',
    stops: [
      [
        stop('monastery', '09:00 AM', 'Himalayan Nyingmapa monastery', 'Culture', grid5),
        stop('museum', '09:00 AM', 'Himachal culture museum', 'Culture', grid6),
      ],
      [stop('souvenirs', '11:30 AM', 'Shawls and souvenirs on Mall Road', 'Shops', grid4)],
      [stop('volvo', '04:00 PM', 'Overnight Volvo back to Delhi', 'Travel', photoSunrise)],
    ],
  },
]

/* What the flow collects, kept in CreateTripRoutes across steps */

export type TripDetails = {
  /** A DESTINATIONS id, or `custom:<Place>` for a searched place */
  destination: string | null
  name: string
  group: string
  /** Days of the month in CALENDAR */
  start: number | null
  end: number | null
  flexible: boolean
  flexibleDays: number
  budget: BudgetId
  mates: PersonId[]
  tweaks: string[]
}

export const INITIAL_TRIP: TripDetails = {
  destination: null,
  name: 'Manali Snow Escape',
  group: 'Mountain Crew',
  start: 12,
  end: 16,
  flexible: false,
  flexibleDays: 5,
  budget: '10-20',
  mates: ['riya', 'meera', 'dev'],
  tweaks: [],
}

const CUSTOM_PREFIX = 'custom:'

export const customDestinationId = (place: string) => `${CUSTOM_PREFIX}${place.trim()}`

export const findDestination = (id: string | null) => DESTINATIONS.find((d) => d.id === id)

export const destinationName = (id: string | null) =>
  id?.startsWith(CUSTOM_PREFIX) ? id.slice(CUSTOM_PREFIX.length) : (findDestination(id)?.name ?? 'Manali')

export const suggestedTripName = (id: string | null) =>
  findDestination(id)?.tripName ?? `${destinationName(id)} Trip`

/** Number of days in the trip, or null while the range is incomplete */
export const tripLength = (trip: TripDetails) =>
  trip.flexible ? trip.flexibleDays : trip.start && trip.end ? trip.end - trip.start + 1 : null
