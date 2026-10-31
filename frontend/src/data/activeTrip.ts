import { useEffect, useSyncExternalStore } from 'react'
import {
  tripsApi,
  type Expense,
  type ItineraryDay,
  type TripDetail,
  type TripListItem,
  type TripPhoto,
  type TripSummary,
} from '../services/tripsService'
import { registerPeople } from './people'

/**
 * The trip open in the trip tabs (#/trip/*), loaded from the backend and shared by every trip screen,
 * plus the signed-in user's trip list for Home. Routes stay `#/trip/<tab>`; the open trip id is kept
 * in localStorage so a reload lands back in the same trip.
 */

const ACTIVE_KEY = 'ghoomates:activeTrip'

type Loadable<T> = T | null

type State = {
  tripId: string | null
  trip: Loadable<TripDetail>
  summary: Loadable<TripSummary>
  expenses: Loadable<Expense[]>
  photos: Loadable<{ items: TripPhoto[]; total: number }>
  itinerary: Loadable<ItineraryDay[]>
  error: string | null
  trips: Loadable<TripListItem[]>
  tripsError: string | null
}

const readActive = () => {
  try {
    return localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

let state: State = {
  tripId: readActive(),
  trip: null,
  summary: null,
  expenses: null,
  photos: null,
  itinerary: null,
  error: null,
  trips: null,
  tripsError: null,
}

const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

const message = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong')

// Requests for a trip that is no longer open are dropped when they return
const forCurrent = <T,>(tripId: string, apply: (value: T) => Partial<State>) => (value: T) => {
  if (state.tripId === tripId) set(apply(value))
}

const inflight = new Map<string, Promise<unknown>>()
const once = <T,>(key: string, run: () => Promise<T>) => {
  const existing = inflight.get(key) as Promise<T> | undefined
  if (existing) return existing
  const promise = run().finally(() => inflight.delete(key))
  inflight.set(key, promise)
  return promise
}

export const activeTrip = {
  get: () => state,

  /** Opens a trip in the trip tabs. Pass the detail when you already have it (e.g. right after create/join). */
  open(tripId: string, detail?: TripDetail) {
    try {
      localStorage.setItem(ACTIVE_KEY, tripId)
    } catch {
      // Blocked storage: the trip stays open until reload
    }
    if (tripId !== state.tripId) {
      set({ tripId, trip: null, summary: null, expenses: null, photos: null, itinerary: null, error: null })
    }
    if (detail) {
      registerPeople(detail.members, detail.memberId)
      set({ trip: detail })
    }
    void this.loadAll()
  },

  close() {
    try {
      localStorage.removeItem(ACTIVE_KEY)
    } catch {
      // ignore
    }
    set({ tripId: null, trip: null, summary: null, expenses: null, photos: null, itinerary: null, error: null })
  },

  loadTrip() {
    const id = state.tripId
    if (!id) return Promise.resolve()
    return once(`trip:${id}`, () =>
      tripsApi
        .get(id)
        .then(
          forCurrent(id, (trip: TripDetail) => {
            registerPeople(trip.members, trip.memberId)
            return { trip, error: null }
          }),
        )
        .catch((err) => {
          // The trip was deleted or you were removed: forget it
          if (err?.status === 404) activeTrip.close()
          else if (state.tripId === id) set({ error: message(err) })
        }),
    )
  },

  loadMoney() {
    const id = state.tripId
    if (!id) return Promise.resolve()
    return once(`money:${id}`, () =>
      Promise.all([tripsApi.summary(id), tripsApi.expenses(id)])
        .then(forCurrent(id, ([summary, expenses]: [TripSummary, Expense[]]) => ({ summary, expenses })))
        .catch((err) => state.tripId === id && set({ error: message(err) })),
    )
  },

  loadPhotos() {
    const id = state.tripId
    if (!id) return Promise.resolve()
    return once(`photos:${id}`, () =>
      tripsApi
        .photos(id)
        .then(forCurrent(id, (photos: { items: TripPhoto[]; total: number }) => ({ photos })))
        .catch((err) => state.tripId === id && set({ error: message(err) })),
    )
  },

  loadItinerary() {
    const id = state.tripId
    if (!id) return Promise.resolve()
    return once(`itinerary:${id}`, () =>
      tripsApi
        .itinerary(id)
        .then(forCurrent(id, (itinerary: ItineraryDay[]) => ({ itinerary })))
        .catch((err) => state.tripId === id && set({ error: message(err) })),
    )
  },

  setItinerary(tripId: string, itinerary: ItineraryDay[]) {
    if (tripId === state.tripId) set({ itinerary })
  },

  loadAll() {
    return Promise.all([this.loadTrip(), this.loadMoney(), this.loadPhotos(), this.loadItinerary()])
  },

  /** Members' balances change with every expense, so money refreshes the member list too */
  refreshMoney() {
    return Promise.all([this.loadMoney(), this.loadTrip()])
  },

  setTrip(trip: TripDetail) {
    if (trip.id !== state.tripId) return
    registerPeople(trip.members, trip.memberId)
    set({ trip })
  },

  loadTrips() {
    return once('trips', () =>
      tripsApi
        .list()
        .then((trips) => {
          trips.forEach((t) => registerPeople(t.members, t.memberId))
          set({ trips, tripsError: null })
        })
        .catch((err) => set({ tripsError: message(err) })),
    )
  },

  /** Signing out clears everything that belonged to the previous user */
  reset() {
    this.close()
    set({ trips: null, tripsError: null })
  },
}

/** The open trip; loads it on first use. */
export function useActiveTrip() {
  const snapshot = useSyncExternalStore(subscribe, () => state)
  const { tripId, trip } = snapshot
  useEffect(() => {
    if (tripId && !trip) void activeTrip.loadAll()
  }, [tripId, trip])
  return snapshot
}

/** The signed-in user's trips, for Home. */
export function useMyTrips(enabled: boolean) {
  const snapshot = useSyncExternalStore(subscribe, () => state)
  useEffect(() => {
    if (enabled) void activeTrip.loadTrips()
  }, [enabled])
  return { trips: snapshot.trips, error: snapshot.tripsError }
}

/* Display helpers */

export const rupees = (paise: number) => paise / 100

const DAY = 24 * 60 * 60 * 1000
const parseDate = (value: string) => {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const today = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export type TripPhase = 'live' | 'upcoming' | 'past'

export function tripPhase(trip: { startDate: string | null; endDate: string | null }): TripPhase {
  const now = today().getTime()
  const start = trip.startDate ? parseDate(trip.startDate).getTime() : null
  const end = trip.endDate ? parseDate(trip.endDate).getTime() : start
  if (end !== null && end < now) return 'past'
  if (start === null || start > now) return 'upcoming'
  return 'live'
}

/** Day N of M while live, e.g. { day: 2, total: 4 } */
export function tripDay(trip: { startDate: string | null; endDate: string | null }) {
  if (!trip.startDate) return null
  const start = parseDate(trip.startDate).getTime()
  const end = trip.endDate ? parseDate(trip.endDate).getTime() : start
  return { day: Math.floor((today().getTime() - start) / DAY) + 1, total: Math.round((end - start) / DAY) + 1 }
}

export function daysUntil(date: string | null) {
  if (!date) return null
  return Math.round((parseDate(date).getTime() - today().getTime()) / DAY)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Sat 12 – Wed 16 Dec", or "Dates TBD" */
export function formatTripDates(trip: { startDate: string | null; endDate: string | null }) {
  if (!trip.startDate) return 'Dates TBD'
  const s = parseDate(trip.startDate)
  const e = trip.endDate ? parseDate(trip.endDate) : s
  const day = (d: Date) => `${WEEKDAYS[d.getDay()]} ${d.getDate()}`
  if (s.getTime() === e.getTime()) return `${day(s)} ${MONTHS[s.getMonth()]}`
  if (s.getMonth() === e.getMonth()) return `${day(s)} – ${day(e)} ${MONTHS[e.getMonth()]}`
  return `${day(s)} ${MONTHS[s.getMonth()]} – ${day(e)} ${MONTHS[e.getMonth()]}`
}

/** Date of day N (1-based) of the trip: "Sat, 12 Dec" */
export function tripDayLabel(startDate: string | null, dayNumber: number) {
  if (!startDate) return `Day ${dayNumber}`
  const d = new Date(parseDate(startDate).getTime() + (dayNumber - 1) * DAY)
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** YYYY-MM-DD for a Date, in local time */
export function isoDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
