import { useEffect, useSyncExternalStore } from 'react'
import {
  tripsApi,
  type Expense,
  type ItineraryDay,
  type TripDetail,
  type TripListItem,
  type TripPhotos,
  type TripSummary,
} from '../services/tripsService'
import { registerPeople } from './people'
import { formatDateRange } from './tripDates'

/**
 * The trip open in the trip tabs (#/trip/*), loaded from the backend and shared by every trip screen,
 * plus the signed-in user's trip list for Home. Routes stay `#/trip/<tab>`; the open trip id is kept
 * in localStorage so a reload lands back in the same trip.
 */

const ACTIVE_KEY = 'ghoommates:activeTrip'

type Loadable<T> = T | null

type State = {
  tripId: string | null
  trip: Loadable<TripDetail>
  summary: Loadable<TripSummary>
  expenses: Loadable<Expense[]>
  photos: Loadable<TripPhotos>
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

const fetchTrips = () =>
  tripsApi
    .list()
    .then((trips) => {
      trips.forEach((t) => registerPeople(t.members, t.memberId))
      set({ trips, tripsError: null })
    })
    .catch((err) => set({ tripsError: message(err) }))

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
        .then(forCurrent(id, (photos: TripPhotos) => ({ photos })))
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
    return once('trips', fetchTrips)
  },

  /**
   * The server saved new dates: the open trip, its itinerary (day labels, moved stops, crowd forecasts) and where the
   * trip sits on Home (live, upcoming, past) all follow. Fetched fresh, not shared with a request already in flight.
   */
  async applyDates(updated: TripDetail) {
    this.setTrip(updated)
    const [itinerary] = await Promise.all([tripsApi.itinerary(updated.id).catch(() => null), fetchTrips()])
    if (itinerary) this.setItinerary(updated.id, itinerary)
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

/* Display helpers. The date maths lives in tripDates.ts: days are counted in India time, whatever zone the device is set to. */

export const rupees = (paise: number) => paise / 100

export { daysUntil, tripDay, tripDayLabel, tripPhase, type TripPhase } from './tripDates'

/** "Sat 12 – Wed 16 Dec", or "Dates TBD" */
export const formatTripDates = (trip: { startDate: string | null; endDate: string | null }) =>
  formatDateRange(trip.startDate, trip.endDate)

/** YYYY-MM-DD for a Date, in local time */
export function isoDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
