import { useEffect, useSyncExternalStore } from 'react'
import { request } from './tripsService'

/* Types mirror backend/src/makers. Prices are whole rupees. */

export type ItemSize = 'small' | 'medium' | 'large'

export type PriceBand = { size: ItemSize; item: string; min: number; max: number }

export type Craft = {
  id: string
  name: string
  hindi: string
  origin: string
  tagline: string
  history: string
  steps: string[]
  /** Only crafts the GI Registry confirms */
  gi: { name: string; year: number | null; source: string } | null
  authentic: string[]
  machineMade: string[]
  prices: PriceBand[]
  priceNote: string
  care: string
  /** Generated cover art in public/makers */
  cover: string
  makerCount?: number
}

/** From a heritage site to a maker's door */
export type Route = { siteId: string; siteName: string; km: number; mode: 'walk' | 'drive'; minutes: number }

export type MakerSummary = {
  id: string
  name: string
  craftIds: string[]
  crafts: { id: string; name: string; hindi: string; cover: string }[]
  studio: string
  area: string
  lat: number
  lng: number
  tagline: string
  generation: number
  yearsWorking: number
  languages: string[]
  womenLed: boolean
  tags: string[]
  workshop: { title: string; durationMin: number; pricePerPerson: number; minPeople: number; maxPeople: number }
  nearest: Route
  fromSite: Route | null
}

export type Workshop = MakerSummary['workshop'] & {
  blurb: string
  minAge: number
  makes: string
  weekly: { days: number[]; times: string[] }[]
}

export type MakerDetail = Omit<MakerSummary, 'workshop'> & {
  story: string
  workshop: Workshop
  craftDetails: Craft[]
  questions: string[]
  closedDates: { date: string; reason: string }[]
}

export type MakerList = {
  items: MakerSummary[]
  near: { id: string; name: string; lat: number; lng: number } | null
  craft: { id: string; name: string } | null
}

export type SlotInfo = { time: string; spotsLeft: number; available: boolean; reason: 'past' | 'full' | null }
export type DayAvailability = { date: string; open: boolean; closedReason: string | null; slots: SlotInfo[] }

export type PriceVerdict = 'fair' | 'a-bit-high' | 'tourist-price' | 'too-low'

export type PriceCheck = {
  craftId: string
  craftName: string
  size: ItemSize
  item: string
  quoted: number
  fair: { min: number; max: number }
  verdict: PriceVerdict
  headline: string
  advice: string
  counter: number | null
  walkAway: number
  overBy: number
  multiple: number
  antiqueNote: string | null
}

export type Answer = { answer: string; source: 'gemini' | 'faq'; matched: string | null }

export type Booking = {
  id: string
  tripId: string
  makerId: string
  makerName: string
  studio: string
  area: string
  lat: number
  lng: number
  workshopTitle: string
  craftId: string
  craftName: string
  /** The craft's cover art */
  cover: string
  /** The itinerary stop added for it; null if the squad deleted the stop */
  stopId: string | null
  dayNumber: number
  date: string
  slot: string
  people: number
  pricePerPerson: number
  total: number
  status: 'confirmed' | 'cancelled'
  note: string
}

export type NewBooking = { tripId: string; date: string; slot: string; people: number; note?: string; dayNumber?: number }

const qs = (params: Record<string, string | number | null | undefined>) => {
  const entries = Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== '')
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}` : ''
}

let craftsRequest: Promise<Craft[]> | null = null

export const makersApi = {
  /** The 14 crafts. Fetched once; a failure isn't remembered, so the next screen tries again. */
  crafts(): Promise<Craft[]> {
    craftsRequest ??= request<{ items: Craft[] }>('/api/makers/crafts')
      .then((r) => r.items)
      .catch((err) => {
        craftsRequest = null
        throw err
      })
    return craftsRequest
  },
  list: (options: { craft?: string | null; near?: string | null; maxKm?: number } = {}) =>
    request<MakerList>(`/api/makers${qs({ craft: options.craft, near: options.near, maxKm: options.maxKm })}`),
  get: (id: string, near?: string | null) =>
    request<{ maker: MakerDetail }>(`/api/makers/${encodeURIComponent(id)}${qs({ near })}`).then((r) => r.maker),
  slots: (id: string, date: string) => request<DayAvailability>(`/api/makers/${encodeURIComponent(id)}/slots${qs({ date })}`),
  priceCheck: (input: { craftId: string; size: ItemSize; quoted: number; antique?: boolean }) =>
    request<PriceCheck>('/api/makers/price-check', { body: input }),
  ask: (id: string, question: string) => request<Answer>(`/api/makers/${encodeURIComponent(id)}/ask`, { body: { question } }),
  book: (id: string, input: NewBooking) => request<Booking & { stop: { id: string; dayNumber: number; time: string } }>(`/api/makers/${encodeURIComponent(id)}/bookings`, { body: input }),
  bookings: (tripId: string) => request<{ items: Booking[] }>(`/api/makers/bookings${qs({ tripId })}`).then((r) => r.items),
}

/* A trip's workshop bookings, shared by the maker page and the stop screen */

const bookingsByTrip = new Map<string, Booking[]>()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const emit = () => listeners.forEach((l) => l())
// useSyncExternalStore needs a snapshot that only changes when the data does
let version = 0
const snapshot = () => version

export const tripBookings = {
  /** Loads (or reloads) the trip's bookings. Quiet on failure: the screens just show nothing. */
  async load(tripId: string) {
    try {
      bookingsByTrip.set(tripId, await makersApi.bookings(tripId))
    } catch {
      if (!bookingsByTrip.has(tripId)) bookingsByTrip.set(tripId, [])
    }
    version++
    emit()
  },
  add(booking: Booking) {
    bookingsByTrip.set(booking.tripId, [...(bookingsByTrip.get(booking.tripId) ?? []), booking])
    version++
    emit()
  },
}

/** The workshops booked for a trip, or null until they have loaded */
export function useTripBookings(tripId: string | undefined) {
  useSyncExternalStore(subscribe, snapshot)
  useEffect(() => {
    if (tripId && !bookingsByTrip.has(tripId)) void tripBookings.load(tripId)
  }, [tripId])
  return tripId ? (bookingsByTrip.get(tripId) ?? null) : null
}
