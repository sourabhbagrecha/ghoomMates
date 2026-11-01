import { request } from './tripsService'

/* Types mirror backend/src/hospitality (views.ts, menu.ts, plan.ts). Weights are kg, distances km. */

export type Meal = 'lunch' | 'dinner'
export type Diet = 'veg' | 'jain' | 'vegan'
export type DietMix = Record<Diet, number>

export type GreenTier = 'Gold' | 'Silver' | 'Bronze' | 'Starter'
export type GreenPartId = 'local' | 'waste' | 'plastic' | 'water'

export type GreenPart = { id: GreenPartId; label: string; value: number; points: number; max: number; detail: string }

export type Green = {
  score: number
  tier: GreenTier
  parts: GreenPart[]
  /** The change that would add the most points */
  nextStep: { part: GreenPartId; text: string; points: number } | null
}

/** The seasonal ingredient a dish is known for and the partner farm it comes from */
export type Supply = { ingredient: string; farm: string; village: string; km: number } | null

export type HostCard = {
  id: string
  name: string
  kind: 'haveli' | 'homestay' | 'cafe'
  kindLabel: string
  area: string
  lat: number
  lng: number
  tagline: string
  image: string
  pricePerThali: number
  meals: Meal[]
  green: Green
  sourcing: { farms: number; localShare: number; avgKm: number; wholesaleKm: number }
  special: { id: string; name: string; hindi: string; supply: Supply }
}

/** What the farms are doing this month and what is coming off the fields */
export type Season = { month: number; monthName: string; season: string; thali: string; note: string; fresh: string[] }

export type HostList = { today: string; month: number; monthName: string; sample: boolean; season: Season; hosts: HostCard[] }

export type FarmView = {
  id: string
  name: string
  village: string
  km: number
  organic: boolean
  practice: string
  story: string
  image: string
  /** fresh = off the fields this month, stored = last harvest, off = not available now */
  produce: { id: string; name: string; status: 'fresh' | 'stored' | 'off' }[]
}

export type ThaliDish = { id: string; name: string; hindi: string; slot: string; peak: boolean; story: string; supply: Supply }

export type MealOption = { id: Meal; label: string; times: string[]; defaultTime: string }

export type HostDetail = HostCard & {
  sample: boolean
  /** Today in India (YYYY-MM-DD) */
  today: string
  story: string
  highlights: string[]
  squadNote: string
  capacity: number
  mealOptions: MealOption[]
  practices: { plasticFree: 'full' | 'partial' | 'no'; waterRefill: 'free' | 'paid' | 'none'; composts: boolean; wasteKgPerCover: number }
  farms: FarmView[]
  season: Season
  thali: { title: string; dishes: ThaliDish[]; zeroWasteTip: string }
  directionsUrl: string
  mapsUrl: string
}

export type Reservation = {
  id: string
  hostId: string
  hostName: string
  hostArea: string
  tripId: string
  group: string
  date: string
  /** "Mon, 2 Nov" */
  dateLabel: string
  meal: Meal
  mealLabel: string
  /** "08:00 PM" */
  time: string
  headcount: number
  dietary: DietMix
  note: string
  stopId: string | null
  dayNumber: number | null
}

export type ReserveInput = {
  tripId: string
  date: string
  meal: Meal
  time?: string
  headcount?: number
  dietary?: Partial<DietMix>
  note?: string
  /** For a trip with no dates yet: which day of the plan */
  dayNumber?: number
}

export type ReserveResult = {
  reservation: Reservation
  stop: { id: string; dayNumber: number } | null
  updated: boolean
  seatsLeft: number
}

export type SquadDiets = { members: number; diets: DietMix } | null

/* The host's side */

export type Booking = { id: string; group: string; headcount: number; meal: Meal; time: string; dietary: DietMix; note: string }

export type MealForecast = { booked: number; walkIn: number; covers: number; bookings: Booking[] }

export type ForecastDay = {
  date: string
  weekday: string
  /** "Mon, 2 Nov" */
  label: string
  dayNote: string | null
  booked: number
  walkIn: number
  covers: number
  meals: Record<Meal, MealForecast>
  diets: { booked: DietMix; walkIn: DietMix; total: DietMix }
}

export type PlanItem = {
  ingredientId: string
  name: string
  kg: number
  squadKg: number
  orderKg: number
  fresh: boolean
  reason?: 'out-of-season' | 'no-partner' | 'pantry'
}

export type FarmOrder = {
  farmId: string
  name: string
  village: string
  organic: boolean
  km: number
  items: PlanItem[]
  totalKg: number
  whatsapp: { text: string; url: string }
}

export type Forecast = {
  host: { id: string; name: string; area: string; kind: string; capacity: number; image: string }
  from: string
  to: string
  days: ForecastDay[]
  totals: { covers: number; booked: number; walkIn: number; squads: number; diets: DietMix }
  menu: { title: string; intro: string; season: string; dishes: { id: string; name: string; hindi: string; slot: string; peak: boolean }[]; zeroWasteTip: string }
  procurement: { totalKg: number; localKg: number; localShare: number; farms: FarmOrder[]; market: PlanItem[] }
  foodMiles: { avgKm: number; baselineKm: number; savedPercent: number; savedTonneKm: number; co2eSavedKg: number }
  waste: { bookedCovers: number; overproductionKg: number; spoilageKg: number; avoidedKg: number; kgPerBookedCover: number; assumptions: { openBuffetSurplus: number } }
  green: Green
}

export type WasteDay = { date: string; label: string; leftoverKg: number; covers: number; perCoverKg: number; source: 'logged' | 'estimate' }

export type WasteTrend = {
  hostId: string
  days: WasteDay[]
  summary: {
    loggedDays: number
    totalLoggedKg: number
    avgPerCoverKg: number | null
    reportedPerCoverKg: number
    buffetPerCoverKg: number
    savedVsBufferKg: number
  }
}

export type MenuIngredient = {
  ingredientId: string
  name: string
  gramsPerServing: number
  kg: number
  farm: { id: string; name: string; village: string; km: number; organic: boolean } | null
}

export type MenuDish = {
  id: string
  name: string
  hindi: string
  slot: string
  peak: boolean
  story: string
  ingredients: MenuIngredient[]
  dietNotes: string[]
}

export type Menu = {
  source: 'gemini' | 'curated'
  model: string | null
  hostId: string
  date: string
  month: number
  season: string
  covers: number
  dietary: DietMix
  title: string
  intro: string
  dishes: MenuDish[]
  zeroWasteTip: string
  totalKg: number
  localShare: number
}

export type MenuInput = { hostId: string; date?: string; covers?: number; dietary?: Partial<DietMix> }

const base = '/api/hospitality'
const host = (id: string) => `${base}/hosts/${encodeURIComponent(id)}`

export const hospitalityApi = {
  hosts: () => request<HostList>(`${base}/hosts`),
  host: (id: string) => request<HostDetail>(host(id)),
  reserve: (hostId: string, input: ReserveInput) => request<ReserveResult>(`${host(hostId)}/reservations`, { body: input }),
  reservations: (tripId: string) =>
    request<{ items: Reservation[]; squad: SquadDiets }>(`${base}/reservations?tripId=${encodeURIComponent(tripId)}`),
  cancel: (id: string) => request<null>(`${base}/reservations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  forecast: (hostId: string, days = 7) => request<Forecast>(`${host(hostId)}/forecast?days=${days}`),
  waste: (hostId: string, days = 7) => request<WasteTrend>(`${host(hostId)}/waste?days=${days}`),
  logWaste: (hostId: string, input: { leftoverKg: number; covers?: number; date?: string; note?: string }) =>
    request<WasteTrend & { log: unknown }>(`${host(hostId)}/waste`, { body: input }),
  menu: (input: MenuInput) => request<Menu>(`${base}/menu`, { body: input }),
}
