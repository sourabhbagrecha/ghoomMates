import { useSyncExternalStore } from 'react'

// What the user does after a trip (settling up, rating). Shared by Home and the
// past-trip screens; resets on reload until there's a backend.
type PastTripState = {
  settled: ReadonlySet<string>
  ratings: Readonly<Record<string, number>>
}

let state: PastTripState = { settled: new Set(), ratings: {} }
const listeners = new Set<() => void>()

const set = (next: PastTripState) => {
  state = next
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const usePastTrips = () => useSyncExternalStore(subscribe, () => state)

export const pastTripActions = {
  settle: (tripId: string) => set({ ...state, settled: new Set(state.settled).add(tripId) }),
  rate: (tripId: string, stars: number) => set({ ...state, ratings: { ...state.ratings, [tripId]: stars } }),
}
