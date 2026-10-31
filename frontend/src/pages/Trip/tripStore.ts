import { useSyncExternalStore } from 'react'
import type { PersonId } from '../../data/people'
import { NOTIFICATION_SETTINGS, type ExpenseCategory, type NotificationSettingId } from './tripDetailData'

export type AddedExpense = {
  id: string
  title: string
  amount: number
  paidBy: PersonId
  category: ExpenseCategory
  /** Each person's share in rupees */
  shares: Partial<Record<PersonId, number>>
  receipt: string | null
}

// Device-only UI state for the trip screens. Trip data itself (members, expenses, photos,
// itinerary) comes from the backend through data/activeTrip.ts.
type TripState = {
  /** Expenses the voice assistant demo adds; not synced */
  expenses: AddedExpense[]
  guideJoined: boolean
  reelPicks: number[]
  notifications: Record<NotificationSettingId, boolean>
}

let state: TripState = {
  expenses: [],
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
  addExpense: (expense: AddedExpense) => update((s) => ({ expenses: [expense, ...s.expenses] })),
  joinGuide: () => update(() => ({ guideJoined: true })),
  toggleReelPick: (index: number) =>
    update((s) => ({
      reelPicks: s.reelPicks.includes(index) ? s.reelPicks.filter((i) => i !== index) : [...s.reelPicks, index],
    })),
  toggleNotification: (id: NotificationSettingId) =>
    update((s) => ({ notifications: { ...s.notifications, [id]: !s.notifications[id] } })),
}
