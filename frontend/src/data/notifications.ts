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
  { id: 'n1', from: 'riya', message: 'requested ₹450 for Rooftop thali dinner', trip: 'Udaipur Lake Escape', time: '5 min ago', group: 'today', action: 'Pay ₹450', unread: true },
  { id: 'n2', from: 'ghoommate', message: 'Pichola sunset boat leaves Lal Ghat at 4:45 PM. Leave City Palace by 4:20 to make it.', trip: 'Udaipur Lake Escape', time: '1 hr ago', group: 'today', unread: true },
  { id: 'n3', from: 'kabir', message: 'added 40 photos to Trip Memories', trip: 'Udaipur Lake Escape', time: '3 hr ago', group: 'today', unread: true },
  { id: 'n4', from: 'meera', message: 'started a vote: which haveli should we stay in?', trip: 'Udaipur Heritage', time: 'Yesterday', group: 'earlier', action: 'Vote', unread: false },
  { id: 'n5', from: 'dev', message: 'joined Udaipur Heritage', trip: 'Udaipur Heritage', time: 'Yesterday', group: 'earlier', unread: false },
  { id: 'n6', from: 'dev', message: 'settled ₹1,500 with you via UPI', trip: 'Udaipur Lake Escape', time: 'Thu', group: 'earlier', unread: false },
]
