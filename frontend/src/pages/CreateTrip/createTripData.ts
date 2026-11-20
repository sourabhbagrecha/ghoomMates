import { DESTINATION_PHOTOS } from '../../data/destinationPhotos'
import { addDays, daysBetween, todayISO, type IsoDate } from '../../data/tripDates'

export const CREATE_STEPS = ['destination', 'dates', 'squad', 'vibe', 'generating', 'draft'] as const
export type CreateStep = (typeof CREATE_STEPS)[number]

export const isCreateStep = (value: string | undefined): value is CreateStep =>
  CREATE_STEPS.includes(value as CreateStep)

/* Destinations: one card per researched guide in backend/src/places (tests/places/parity.test.ts keeps them in step) */

type DestinationSeed = {
  /** The backend guide id */
  id: string
  name: string
  region: string
  tag: string
  /** Ideal trip length, fewest to most days */
  days: [number, number]
  /** Cheapest sensible day per person, in rupees */
  fromPerDay: number
  /** Months 1–12 when it's at its best */
  bestMonths: number[]
  /** Suggested trip name when this place is picked */
  tripName: string
  /** Yellow badge on the cover, e.g. "Squad pick" */
  badge?: string
  /** Other names it goes by (towns, valleys, landmarks), lower case, for search and matching typed destinations */
  aliases: string[]
}

export type Destination = DestinationSeed & {
  /** e.g. "3–5 days · from ₹2.5k a day" */
  details: string
  photo: string
}

const SEEDS: DestinationSeed[] = [
  {
    id: 'udaipur',
    name: 'Udaipur',
    region: 'Rajasthan',
    tag: 'Lakes',
    days: [3, 5],
    fromPerDay: 2500,
    bestMonths: [9, 10, 11, 12, 1, 2, 3],
    tripName: 'Udaipur Lake Escape',
    badge: 'Squad pick',
    aliases: ['udaipur', 'lake city', 'city of lakes', 'mewar', 'lake pichola', 'fateh sagar'],
  },
  {
    id: 'chettinad',
    name: 'Chettinad',
    region: 'Tamil Nadu',
    tag: 'Heritage',
    days: [2, 4],
    fromPerDay: 2500,
    bestMonths: [11, 12, 1, 2, 3],
    tripName: 'Chettinad Mansions Trail',
    aliases: ['chettinad', 'chettinadu', 'karaikudi', 'kanadukathan', 'athangudi', 'pallathur', 'devakottai', 'thirumayam', 'pillaiyarpatti'],
  },
  {
    id: 'orchha',
    name: 'Orchha',
    region: 'Madhya Pradesh',
    tag: 'Heritage',
    days: [2, 4],
    fromPerDay: 2500,
    bestMonths: [10, 11, 12, 1, 2, 3],
    tripName: 'Orchha Riverside Escape',
    aliases: ['orchha', 'orccha', 'orcha', 'niwari', 'betwa', 'bundelkhand'],
  },
  {
    id: 'majuli',
    name: 'Majuli',
    region: 'Assam',
    tag: 'Culture',
    days: [2, 4],
    fromPerDay: 1500,
    bestMonths: [10, 11, 12, 1, 2, 3],
    tripName: 'Majuli Island Drift',
    aliases: ['majuli', 'garamur', 'kamalabari', 'nimati', 'neamati', 'jorhat', 'sivasagar', 'sibsagar', 'charaideo'],
  },
  {
    id: 'hampi',
    name: 'Hampi',
    region: 'Karnataka',
    tag: 'Ruins',
    days: [2, 4],
    fromPerDay: 2000,
    bestMonths: [10, 11, 12, 1, 2],
    tripName: 'Hampi Boulder Run',
    aliases: ['hampi', 'hampe', 'vijayanagara', 'hosapete', 'hospet', 'anegundi', 'anegondi', 'kamalapura', 'virupapur gadde', 'hippie island', 'hanumanahalli', 'sanapur'],
  },
  {
    id: 'varanasi',
    name: 'Varanasi',
    region: 'Uttar Pradesh',
    tag: 'Spiritual',
    days: [2, 4],
    fromPerDay: 2000,
    bestMonths: [10, 11, 12, 1, 2, 3],
    tripName: 'Varanasi Ghats Walk',
    aliases: ['varanasi', 'banaras', 'benaras', 'benares', 'kashi', 'sarnath'],
  },
  {
    id: 'agra',
    name: 'Agra',
    region: 'Uttar Pradesh',
    tag: 'Heritage',
    days: [2, 4],
    fromPerDay: 2500,
    bestMonths: [10, 11, 12, 1, 2, 3],
    tripName: 'Agra Taj Weekend',
    aliases: ['agra', 'taj mahal', 'fatehpur sikri', 'sikandra', 'mathura', 'vrindavan', 'bharatpur', 'keoladeo'],
  },
  {
    id: 'tawang',
    name: 'Tawang',
    region: 'Arunachal Pradesh',
    tag: 'Mountains',
    days: [4, 8],
    fromPerDay: 2500,
    bestMonths: [3, 4, 5, 10, 11],
    tripName: 'Tawang Monastery Road Trip',
    aliases: ['tawang', 'sela pass', 'bum la', 'bumla', 'dirang', 'bomdila', 'zemithang', 'west kameng', 'monyul'],
  },
  {
    id: 'gurez',
    name: 'Gurez Valley',
    region: 'Jammu and Kashmir',
    tag: 'Offbeat',
    days: [3, 5],
    fromPerDay: 2500,
    bestMonths: [5, 6, 7, 8, 9, 10],
    tripName: 'Gurez Valley Escape',
    aliases: ['gurez', 'gurais', 'dawar', 'tulail', 'tulel', 'tilel', 'kishanganga', 'habba khatoon', 'razdan', 'bandipora', 'bandipore', 'wular'],
  },
  {
    id: 'chopta-tungnath',
    name: 'Chopta–Tungnath',
    region: 'Uttarakhand',
    tag: 'Trek',
    days: [3, 6],
    fromPerDay: 1500,
    bestMonths: [3, 4, 5, 9, 10, 11],
    tripName: 'Tungnath Trek',
    aliases: ['chopta', 'tungnath', 'chandrashila', 'deoria tal', 'deoriatal', 'devariyatal', 'sari village', 'ukhimath', 'makkumath', 'kartik swami'],
  },
  {
    id: 'spiti-valley',
    name: 'Spiti Valley',
    region: 'Himachal Pradesh',
    tag: 'Road trip',
    days: [7, 12],
    fromPerDay: 2500,
    bestMonths: [5, 6, 7, 8, 9, 10],
    tripName: 'Spiti Road Trip',
    aliases: ['spiti', 'spiti valley', 'kaza', 'key monastery', 'kibber', 'langza', 'komic', 'hikkim', 'dhankar', 'tabo', 'pin valley', 'chandratal', 'chandra taal', 'nako', 'kalpa', 'kinnaur'],
  },
  {
    id: 'kullu-manali',
    name: 'Kullu-Manali',
    region: 'Himachal Pradesh',
    tag: 'Mountains',
    days: [4, 9],
    fromPerDay: 2000,
    bestMonths: [3, 4, 5, 6, 9, 10, 11],
    tripName: 'Manali Mountain Escape',
    aliases: ['manali', 'kullu', 'kulu', 'old manali', 'kasol', 'parvati valley', 'solang', 'naggar', 'jibhi', 'tirthan', 'kheerganga', 'tosh', 'vashisht', 'sissu'],
  },
  {
    id: 'leh-ladakh',
    name: 'Leh-Ladakh',
    region: 'Ladakh',
    tag: 'Road trip',
    days: [6, 12],
    fromPerDay: 3500,
    bestMonths: [5, 6, 7, 8, 9],
    tripName: 'Ladakh High Passes',
    aliases: ['leh', 'ladakh', 'leh-ladakh', 'leh ladakh', 'nubra', 'pangong', 'tso moriri', 'hanle', 'turtuk', 'khardung la'],
  },
  {
    id: 'rishikesh',
    name: 'Rishikesh',
    region: 'Uttarakhand',
    tag: 'Adventure',
    days: [3, 5],
    fromPerDay: 2000,
    bestMonths: [2, 3, 4, 9, 10, 11],
    tripName: 'Rishikesh Rapids Run',
    aliases: ['rishikesh', 'tapovan', 'laxman jhula', 'lakshman jhula', 'ram jhula', 'muni ki reti', 'swarg ashram', 'shivpuri'],
  },
  {
    id: 'dzukou-valley',
    name: 'Dzükou Valley and Kohima',
    region: 'Nagaland',
    tag: 'Trek',
    days: [3, 6],
    fromPerDay: 2000,
    bestMonths: [2, 3, 4, 6, 7, 10, 11, 12],
    tripName: 'Dzükou Valley Trek',
    aliases: ['dzukou', 'dzükou', 'dzuko', 'dzükou valley', 'dzukou valley', 'kohima', 'khonoma', 'viswema', 'jakhama', 'zakhama', 'kisama', 'japfu'],
  },
  {
    id: 'ziro-valley',
    name: 'Ziro Valley',
    region: 'Arunachal Pradesh',
    tag: 'Offbeat',
    days: [3, 5],
    fromPerDay: 1800,
    bestMonths: [3, 4, 5, 9, 10, 11],
    tripName: 'Ziro Valley Slow Days',
    aliases: ['ziro', 'ziro valley', 'hapoli', 'old ziro', 'apatani', 'lower subansiri', 'talley valley', 'talle valley'],
  },
  {
    id: 'gandikota',
    name: 'Gandikota',
    region: 'Andhra Pradesh',
    tag: 'Canyon',
    days: [2, 4],
    fromPerDay: 1500,
    bestMonths: [10, 11, 12, 1, 2],
    tripName: 'Gandikota Canyon Camp',
    aliases: ['gandikota', 'gandikota fort', 'grand canyon of india', 'jammalamadugu', 'belum', 'kadapa', 'cuddapah', 'proddatur'],
  },
  {
    id: 'meghalaya',
    name: 'Meghalaya',
    region: 'Northeast India',
    tag: 'Waterfalls',
    days: [5, 8],
    fromPerDay: 2500,
    bestMonths: [10, 11, 12, 1, 2, 3, 4],
    tripName: 'Meghalaya Root Bridges Trip',
    aliases: ['meghalaya', 'shillong', 'cherrapunji', 'cherrapunjee', 'sohra', 'mawlynnong', 'dawki', 'nongriat', 'mawsynram', 'jowai', 'shnongpdeng', 'laitlum', 'khasi hills', 'jaintia hills', 'garo hills', 'umiam'],
  },
  {
    id: 'rann-of-kutch',
    name: 'Rann of Kutch',
    region: 'Gujarat',
    tag: 'Desert',
    days: [3, 6],
    fromPerDay: 2500,
    bestMonths: [11, 12, 1, 2],
    tripName: 'White Rann Escape',
    aliases: ['rann of kutch', 'kutch', 'kachchh', 'white rann', 'rann utsav', 'dhordo', 'bhuj', 'little rann', 'dholavira', 'mandvi'],
  },
  {
    id: 'jaisalmer',
    name: 'Jaisalmer',
    region: 'Rajasthan',
    tag: 'Desert',
    days: [2, 4],
    fromPerDay: 2500,
    bestMonths: [10, 11, 12, 1, 2, 3],
    tripName: 'Jaisalmer Desert Nights',
    aliases: ['jaisalmer', 'jaisalmer fort', 'sonar quila', 'golden city', 'sam sand dunes', 'sam dunes', 'khuri', 'kuldhara', 'tanot', 'longewala', 'thar desert'],
  },
  {
    id: 'lakshadweep',
    name: 'Lakshadweep',
    region: 'Arabian Sea islands',
    tag: 'Islands',
    days: [4, 7],
    fromPerDay: 5000,
    bestMonths: [10, 11, 12, 1, 2, 3, 4],
    tripName: 'Lakshadweep Lagoon Escape',
    aliases: ['lakshadweep', 'lakshwadeep', 'lakshadeep', 'laccadive', 'agatti', 'bangaram', 'thinnakara', 'kavaratti', 'kadmat', 'minicoy', 'kalpeni'],
  },
  {
    id: 'gokarna',
    name: 'Gokarna',
    region: 'Karnataka',
    tag: 'Beaches',
    days: [2, 4],
    fromPerDay: 1500,
    bestMonths: [10, 11, 12, 1, 2, 3],
    tripName: 'Gokarna Beach Trail',
    aliases: ['gokarna', 'gokarn', 'om beach', 'kudle', 'kumta', 'honnavar', 'murudeshwar', 'murdeshwar'],
  },
  {
    id: 'goa',
    name: 'Goa',
    region: 'Konkan coast',
    tag: 'Beaches',
    days: [4, 8],
    fromPerDay: 2500,
    bestMonths: [11, 12, 1, 2, 3],
    tripName: 'Goa Beach Break',
    aliases: ['goa', 'south goa', 'north goa', 'panaji', 'panjim', 'margao', 'madgaon', 'palolem', 'agonda', 'canacona', 'benaulim', 'colva', 'old goa', 'fontainhas', 'anjuna', 'baga', 'calangute', 'arambol', 'assagao', 'vagator', 'mapusa'],
  },
  {
    id: 'satpura',
    name: 'Satpura',
    region: 'Madhya Pradesh',
    tag: 'Wildlife',
    days: [3, 6],
    fromPerDay: 3000,
    bestMonths: [10, 11, 12, 1, 2, 3],
    tripName: 'Satpura Wild Escape',
    aliases: ['satpura', 'satpura tiger reserve', 'satpura national park', 'satpuda', 'madhai', 'madai', 'pachmarhi', 'panchmarhi', 'pachmadhi', 'denwa', 'churna', 'bori sanctuary', 'narmadapuram', 'hoshangabad', 'pipariya', 'tawa dam'],
  },
  {
    id: 'kaziranga',
    name: 'Kaziranga',
    region: 'Assam',
    tag: 'Wildlife',
    days: [2, 4],
    fromPerDay: 3000,
    bestMonths: [11, 12, 1, 2, 3, 4],
    tripName: 'Kaziranga Rhino Safari',
    aliases: ['kaziranga', 'kaziranga national park', 'kaziranga national park and tiger reserve', 'kaziranga tiger reserve', 'kohora', 'bokakhat', 'bagori', 'agaratoli', 'burapahar', 'panbari', 'kaziranga assam'],
  },
]

const thousands = (rupees: number) => `₹${Number((rupees / 1000).toFixed(1))}k`

export const DESTINATIONS: Destination[] = SEEDS.map((seed) => ({
  ...seed,
  details: `${seed.days[0]}–${seed.days[1]} days · from ${thousands(seed.fromPerDay)} a day`,
  photo: DESTINATION_PHOTOS[seed.id].src,
}))

export const DEFAULT_DESTINATION = 'udaipur'

/** This month in India, 1–12 */
export const currentMonth = () => Number(todayISO().slice(5, 7))

export const inSeason = (d: Destination, month = currentMonth()) => d.bestMonths.includes(month)

// What “Surprise us” cycles through, best fit for the squad's vibe first (only the ones in season right now are offered)
export const SURPRISES = [
  { destination: 'udaipur', reason: 'Sunset boats on Pichola, pottery and folk nights in the old city, and a horse ride into the Aravallis. Very you lot.' },
  { destination: 'hampi', reason: 'Sunrise from Matanga Hill, coracles on the Tungabhadra and boulder scrambles between the ruins.' },
  { destination: 'jaisalmer', reason: 'A fort people still live in, havelis carved like lace and a night of folk music on the Sam dunes.' },
  { destination: 'gokarna', reason: 'A cliff walk between quiet coves, beach-shack dinners and sunsets without the Goa crowds.' },
  { destination: 'rann-of-kutch', reason: 'Full-moon nights on the white salt desert and craft villages full of embroiderers and block printers.' },
  { destination: 'kaziranga', reason: 'Jeep safaris among one-horned rhinos at dawn, then long Assamese thalis.' },
  { destination: 'meghalaya', reason: 'Living root bridges, the clear water at Dawki and Shillong cafés with live music.' },
  { destination: 'rishikesh', reason: 'Rafting by day, riverside cafés by night. Adventure and food, sorted.' },
  { destination: 'kullu-manali', reason: 'Snow at Solang, cosy Old Manali cafés and one big adventure a day.' },
  { destination: 'ziro-valley', reason: 'Rice-fish paddies, Apatani villages and the slowest, coolest days in the Northeast.' },
  { destination: 'spiti-valley', reason: 'Cliff-top monasteries, fossil villages above 4,000 m and the road trip of a lifetime.' },
  { destination: 'leh-ladakh', reason: 'High passes, Pangong’s blues and monasteries above the Indus. One for the adventurers.' },
]

/* Dates and budget: the calendar (components/DateRangeCalendar) starts at the current month */

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
  summary: 'Lake sunsets and hands-on culture by day, great food by night. Nobody’s fussed about clubbing.',
  priorities: [
    { title: 'One big adventure a day', detail: 'Aravalli horse safari, Badi lake kayaking and the Kumbhalgarh walls' },
    { title: 'Local food over tourist traps', detail: 'Old-city kachori, a haveli cooking class and a proper Mewari thali' },
    { title: 'Easy evenings', detail: 'Pichola sunsets and rooftop folk music, home before midnight' },
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
  /** YYYY-MM-DD */
  start: IsoDate | null
  end: IsoDate | null
  flexible: boolean
  flexibleDays: number
  budget: BudgetId
  tweaks: string[]
}

/** A fresh trip. It starts today for 4 days (Udaipur's usual length), so a squad that shares it goes live right away. */
export const initialTrip = (): TripDetails => {
  const today = todayISO()
  return {
    destination: null,
    name: 'Udaipur Lake Escape',
    group: 'Lake City Squad',
    start: today,
    end: addDays(today, 3),
    flexible: false,
    flexibleDays: 5,
    budget: '10-20',
    tweaks: [],
  }
}

const CUSTOM_PREFIX = 'custom:'

export const customDestinationId = (place: string) => `${CUSTOM_PREFIX}${place.trim()}`

// Ids the create flow used before the guides, still stored as the cover of trips made then
const LEGACY_IDS: Record<string, string> = { manali: 'kullu-manali' }

export const findDestination = (id: string | null) => {
  const key = id && (LEGACY_IDS[id] ?? id)
  return DESTINATIONS.find((d) => d.id === key)
}

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Every name a destination answers to, longest first so "old manali" wins over "manali" (same rule as the backend's guideFor)
const MATCHERS = DESTINATIONS.flatMap((d) => [d.id.replace(/-/g, ' '), d.name.toLowerCase(), ...d.aliases].map((alias) => ({ d, alias })))
  .sort((a, b) => b.alias.length - a.alias.length)
  .map(({ d, alias }) => ({ d, re: new RegExp(`(^|[^a-z])${escapeRe(alias).replace(/[\s–-]+/g, '[\\s–-]*')}([^a-z]|$)`, 'i') }))

/** The destination a typed place like "Kasol" or "Hampi, Karnataka" belongs to, if we have one */
export const destinationFor = (text: string | null | undefined) => {
  const t = (text ?? '').trim()
  return t ? MATCHERS.find((m) => m.re.test(t))?.d : undefined
}

export const destinationName = (id: string | null) =>
  id?.startsWith(CUSTOM_PREFIX) ? id.slice(CUSTOM_PREFIX.length) : (findDestination(id)?.name ?? 'Udaipur')

export const suggestedTripName = (id: string | null) =>
  findDestination(id)?.tripName ?? `${destinationName(id)} Trip`

/** Number of days in the trip, or null while the range is incomplete */
export const tripLength = (trip: TripDetails) =>
  trip.flexible ? trip.flexibleDays : trip.start && trip.end ? daysBetween(trip.start, trip.end) + 1 : null
