import { useSyncExternalStore } from 'react'
import { NOTIFICATION_SETTINGS, type NotificationSettingId } from './tripDetailData'

// Device-only UI state for the trip screens. Trip data itself (members, expenses, photos,
// itinerary) comes from the backend through data/activeTrip.ts.
type TripState = {
  guideJoined: boolean
  reelPicks: number[]
  notifications: Record<NotificationSettingId, boolean>
}

let state: TripState = {
  guideJoined: false,
  reelPicks: [],
  notifications: Object.fromEntries(NOTIFICATION_SETTINGS.map((n) => [n.id, n.id !== 'photos'])) as Record<
    NotificationSettingId,
    boolean
  >,
}

const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const update = (patch: (s: TripState) => Partial<TripState>) => {
  state = { ...state, ...patch(state) }
  listeners.forEach((l) => l())
}

export const useTripStore = () => useSyncExternalStore(subscribe, () => state)

export const tripActions = {
  joinGuide: () => update(() => ({ guideJoined: true })),
  toggleReelPick: (index: number) =>
    update((s) => ({
      reelPicks: s.reelPicks.includes(index) ? s.reelPicks.filter((i) => i !== index) : [...s.reelPicks, index],
    })),
  toggleNotification: (id: NotificationSettingId) =>
    update((s) => ({ notifications: { ...s.notifications, [id]: !s.notifications[id] } })),
}
