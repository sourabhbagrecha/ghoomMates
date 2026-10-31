import type { PersonId } from './people'

export type AppNotification = {
  id: string
  /** Who it's from: a squad member or GhoomMate itself */
  from: PersonId | 'ghoommate'
  message: string
  trip: string
  time: string
  group: 'today' | 'earlier'
  /** Inline action, e.g. pay a request or open a vote */
  action?: string
  unread: boolean
}

// Mock data until the notifications service exists
export const NOTIFICATIONS: AppNotification[] = [
  { id: 'n1', from: 'riya', message: 'requested ₹450 for Beach-shack dinner', trip: 'Goa Trip', time: '5 min ago', group: 'today', action: 'Pay ₹450', unread: true },
  { id: 'n2', from: 'ghoommate', message: 'Sunset cruise boards at 5:30 PM. Leave Fontainhas by 4:45 to make it.', trip: 'Goa Trip', time: '1 hr ago', group: 'today', unread: true },
  { id: 'n3', from: 'kabir', message: 'added 40 photos to Trip Memories', trip: 'Goa Trip', time: '3 hr ago', group: 'today', unread: true },
  { id: 'n4', from: 'meera', message: 'started a vote: where should we stay in Manali?', trip: 'Manali Snow Escape', time: 'Yesterday', group: 'earlier', action: 'Vote', unread: false },
  { id: 'n5', from: 'dev', message: 'joined Manali Snow Escape', trip: 'Manali Snow Escape', time: 'Yesterday', group: 'earlier', unread: false },
  { id: 'n6', from: 'dev', message: 'settled ₹1,500 with you via UPI', trip: 'Goa Trip', time: 'Thu', group: 'earlier', unread: false },
]
