import type { CrowdLabel } from './heritageService'
import { request } from './tripsService'

/* Types mirror backend/src/events. Dates are YYYY-MM-DD in India; times are minutes after midnight. */

export type EventKind = 'festival' | 'procession' | 'fair' | 'ritual' | 'performance' | 'season'

export type EventPlace = { name: string; siteId: string | null; lat: number | null; lng: number | null }

export type QuieterTime = { time: string; minutes: number; level: number; label: CrowdLabel; reason: string }
export type QuieterSite = { id: string; name: string; tag: string; level: number; label: CrowdLabel; reason: string }

export type SiteCrowd = {
  siteId: string
  siteName: string
  kind: string
  gem: boolean
  /** The span of hours the event touches this site, and each stretch of it (dawn and dusk, say) */
  from: number
  to: number
  windows: { from: number; to: number }[]
  /** "2–7:30 PM", or "5:30–8:30 AM, 5–9 PM" */
  windowLabel: string
  /** Days of the run on which the event touches this site */
  dates: string[]
  /** The day these numbers are for: today if the event touches the site today, else the next day it does */
  date: string
  note: string
  peak: { minutes: number; time: string; level: number; label: CrowdLabel }
  /** The same minute without the festival */
  usual: { level: number | null; label: CrowdLabel }
  forecast: { time: string; minutes: number; level: number | null; usual: number | null }[]
  quieterTime: QuieterTime | null
  quieterSite: QuieterSite | null
}

export type CalmSite = { id: string; name: string; kind: string; gem: boolean; level: number; label: CrowdLabel; km: number }

export type EventCrowd = {
  /** The day the busiest site's numbers are for */
  date: string
  label: CrowdLabel
  level: number | null
  headline: string
  /** From the heritage model (true) or the event's own curated note (false) */
  modelled: boolean
  sites: SiteCrowd[]
  calm: CalmSite[]
}

export type EventBase = {
  id: string
  name: string
  nameHi: string
  kind: EventKind
  time: { label: string; from: number; to: number }
  places: EventPlace[]
  significance: string
  join: { etiquette: string[]; dress: string; photography: string }
  tips: string[]
  price: string | null
  /** What “Add to our itinerary” adds; null when the event is a heads-up only */
  stop: { title: string; time: string; place: string } | null
  sources: { title: string; url: string }[]
}

export type EventInstance = EventBase & {
  key: string
  from: string
  to: string
  /** The main days of the run */
  peak: string[]
  datesBasis: string
  status: 'ongoing' | 'today' | 'tomorrow' | 'upcoming' | 'past'
  daysAway: number
  /** “Your {day} is Diwali…” */
  tripTip: string | null
  crowd: EventCrowd
}

export type RecurringEvent = EventBase & { recurring: 'daily'; crowd: EventCrowd }
export type UndatedEvent = EventBase & { datesNote: string }

export type AnyEvent = EventInstance | RecurringEvent | UndatedEvent

export type EventList = {
  city: string
  today: string
  from: string
  to: string
  items: EventInstance[]
  recurring: RecurringEvent[]
  undated: UndatedEvent[]
}

export type AddedEventStop = {
  stop: { id: string; dayNumber: number; date: string | null; time: string; title: string; place: string }
  event: { id: string; name: string }
  /** What the crowd model says about the new stop */
  crowd: { siteName: string; level: number | null; label: CrowdLabel | null; dayNote: string | null } | null
}

/** GhoomMate's answer to a question about an event: written by Gemini from the event's facts, or a curated note */
export type EventAnswer = { answer: string; source: 'gemini' | 'faq'; matched: string | null }

export type NewEventStop = { tripId: string; date?: string | null; time?: string; dayNumber?: number }

const TTL_MS = 5 * 60_000
const cache = new Map<string, { at: number; request: Promise<EventList> }>()

export const eventsApi = {
  /**
   * Events in a window. Several parts of the app ask for the same days within a screen's lifetime, so the answer is kept
   * for a few minutes and shared. A failure is never remembered.
   */
  list(from: string, to: string): Promise<EventList> {
    const key = `${from}|${to}`
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < TTL_MS) return hit.request
    const pending = request<EventList>(`/api/events?from=${from}&to=${to}`)
    cache.set(key, { at: Date.now(), request: pending })
    pending.catch(() => cache.delete(key))
    return pending
  },
  ask: (eventId: string, question: string) => request<EventAnswer>(`/api/events/${encodeURIComponent(eventId)}/ask`, { body: { question } }),
  addToTrip: (eventId: string, input: NewEventStop) =>
    request<AddedEventStop>(`/api/events/${encodeURIComponent(eventId)}/stops`, { body: input }),
}
