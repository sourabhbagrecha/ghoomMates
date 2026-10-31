import { useSyncExternalStore } from 'react'
import { SQUAD, type PersonId } from '../../data/people'
import {
  NOTIFICATION_SETTINGS,
  SEED_STOPS,
  TRIP_INFO,
  type ExpenseCategory,
  type NotificationSettingId,
  type Rsvp,
  type TripStop,
  type UpiAppId,
} from './tripDetailData'

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

type TripState = {
  stops: TripStop[]
  rsvp: Record<string, Rsvp>
  expenses: AddedExpense[]
  settledVia: UpiAppId | null
  guideJoined: boolean
  reelPicks: number[]
  tripName: string
  notifications: Record<NotificationSettingId, boolean>
}

// In-memory mock store shared by the trip detail screens. Resets on reload.
// TODO: replace with the trips service once it exists.
let state: TripState = {
  stops: SEED_STOPS,
  rsvp: Object.fromEntries(SEED_STOPS.map((s) => [s.id, s.people.includes('you') ? 'going' : 'maybe'])),
  expenses: [],
  settledVia: null,
  guideJoined: false,
  reelPicks: [],
  tripName: TRIP_INFO.name,
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
  saveStop: (stop: TripStop) =>
    update((s) => ({
      stops: s.stops.some((x) => x.id === stop.id) ? s.stops.map((x) => (x.id === stop.id ? stop : x)) : [...s.stops, stop],
      rsvp: {
        ...s.rsvp,
        [stop.id]: stop.people.includes('you') ? 'going' : s.rsvp[stop.id] === 'skip' ? 'skip' : 'maybe',
      },
    })),
  // Keeps the stop's people in step with your RSVP
  setRsvp: (stopId: string, rsvp: Rsvp) =>
    update((s) => ({
      rsvp: { ...s.rsvp, [stopId]: rsvp },
      stops: s.stops.map((stop) =>
        stop.id !== stopId
          ? stop
          : {
              ...stop,
              people:
                rsvp === 'going'
                  ? SQUAD.filter((p) => p === 'you' || stop.people.includes(p))
                  : stop.people.filter((p) => p !== 'you'),
            },
      ),
    })),
  addExpense: (expense: AddedExpense) => update((s) => ({ expenses: [expense, ...s.expenses] })),
  settle: (via: UpiAppId) => update(() => ({ settledVia: via })),
  joinGuide: () => update(() => ({ guideJoined: true })),
  toggleReelPick: (index: number) =>
    update((s) => ({
      reelPicks: s.reelPicks.includes(index) ? s.reelPicks.filter((i) => i !== index) : [...s.reelPicks, index],
    })),
  setTripName: (tripName: string) => update(() => ({ tripName })),
  toggleNotification: (id: NotificationSettingId) =>
    update((s) => ({ notifications: { ...s.notifications, [id]: !s.notifications[id] } })),
}

/** Current snapshot, for non-component code such as route matching */
export const getTripState = () => state
