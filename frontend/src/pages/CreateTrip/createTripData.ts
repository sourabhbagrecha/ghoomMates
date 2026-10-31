import grid1 from '../../assets/figma/photo-grid-1.svg'
import grid2 from '../../assets/figma/photo-grid-2.svg'
import grid3 from '../../assets/figma/photo-grid-3.svg'
import grid4 from '../../assets/figma/photo-grid-4.svg'
import grid6 from '../../assets/figma/photo-grid-6.svg'
import photoVagator from '../../assets/figma/photo-vagator.svg'

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
  'Blending the squad’s plans into one',
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
