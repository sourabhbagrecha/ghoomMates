// Pure helpers for the Mewar Utsav screens: grouping by week, date tiles, which days of a trip an event can go on, and the
// line CrowdPulse shows. No React, no CSS and no runtime imports beyond the date helpers, so the backend tests can run it.
import { MAX_TRIP_DAYS, addDays, daysBetween, formatDateRange, formatDay, partsOf, weekdayOf } from '../../data/tripDates.ts'
import type { CrowdLabel } from '../../services/heritageService.ts'
import type { AnyEvent, EventInstance, EventList, RecurringEvent, SiteCrowd } from '../../services/eventsService.ts'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type TripDates = { startDate: string | null; endDate: string | null }

/* Kinds of event, for the three lists */

export const isInstance = (event: AnyEvent): event is EventInstance => 'key' in event
export const isRecurring = (event: AnyEvent): event is RecurringEvent => 'recurring' in event

/* Weeks */

/** The Monday of the week a date is in */
export const weekStart = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7))

export type WeekGroup<T> = { key: string; label: string; items: T[] }

/**
 * Groups runs by when they start (a run already under way counts from today): the next seven days are “This week”, the
 * seven after that “Next week”, and later ones by calendar week (Monday to Sunday). Soonest first.
 */
export function groupByWeek<T extends { from: string }>(items: T[], today: string): WeekGroup<T>[] {
  const groups = new Map<string, WeekGroup<T>>()
  for (const item of items) {
    const start = item.from < today ? today : item.from
    const offset = daysBetween(today, start)
    const monday = weekStart(start)
    const [key, label] =
      offset < 7 ? ['0', 'This week'] : offset < 14 ? ['1', 'Next week'] : [monday, formatDateRange(monday, addDays(monday, 6))]
    const group = groups.get(key) ?? { key, label, items: [] }
    group.items.push(item)
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key))
}

/* Dates */

/** "Sun, 8 Nov", or "Fri 6 – Sun 8 Nov" for a run */
export const whenLabel = (from: string, to: string) => (from === to ? formatDay(from) : formatDateRange(from, to))

/** The little calendar tile: weekday, day and month; a short run shows its days, a long one where it starts */
export function dateTile(from: string, to: string) {
  const start = partsOf(from)
  const end = partsOf(to)
  if (from === to) return { top: WEEKDAYS[weekdayOf(from)], big: String(start.day), bottom: MONTHS[start.month] }
  if (daysBetween(from, to) <= 6) {
    return {
      top: `${WEEKDAYS[weekdayOf(from)]}–${WEEKDAYS[weekdayOf(to)]}`,
      big: `${start.day}–${end.day}`,
      bottom: start.month === end.month ? MONTHS[start.month] : `${MONTHS[start.month]}–${MONTHS[end.month]}`,
    }
  }
  return { top: 'From', big: String(start.day), bottom: MONTHS[start.month] }
}

/** "7 PM", "6:30 PM" */
export function startClock(minutes: number) {
  const hour = Math.floor(minutes / 60) % 24
  const minute = minutes % 60
  return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hour < 12 ? 'AM' : 'PM'}`
}

/** The tile on an event's card: its date, "Every day" for a nightly show, or "Dates TBA" while they aren't out */
export function tileFor(event: AnyEvent) {
  if (isInstance(event)) return dateTile(event.from, event.to)
  if (isRecurring(event)) return { top: 'Every day', big: startClock(event.time.from), bottom: 'Show' }
  return { top: 'Dates', big: 'TBA', bottom: 'Soon' }
}

/** "Today", "Tomorrow", "In 5 days", "On now" and how soon it is */
export function relativeLabel(event: Pick<EventInstance, 'status' | 'daysAway'>) {
  switch (event.status) {
    case 'today':
      return { text: 'Today', soon: true }
    case 'tomorrow':
      return { text: 'Tomorrow', soon: true }
    case 'ongoing':
      return { text: 'On now', soon: true }
    case 'past':
      return { text: 'Ended', soon: false }
    default:
      return { text: event.daysAway <= 60 ? `In ${event.daysAway} days` : `In ${Math.round(event.daysAway / 30)} months`, soon: event.daysAway <= 7 }
  }
}

/* The Explore row */

export type ExploreRow = { title: string; instances: EventInstance[]; recurring: RecurringEvent[] }

/** “This week” is today and the six days after it */
const SOON_DAYS = 6

/**
 * What the Explore tab shows: the festivals starting this week (or already under way), else the next few that are
 * coming, then the nightly shows. Never empty while the calendar has anything ahead.
 */
export function exploreRow(list: EventList, today: string): ExploreRow {
  const live = list.items.filter((i) => i.to >= today)
  const soon = live.filter((i) => i.from <= addDays(today, SOON_DAYS))
  if (soon.length) return { title: 'This week in Mewar', instances: soon.slice(0, 4), recurring: list.recurring }
  return { title: 'Coming up in Mewar', instances: live.slice(0, 3), recurring: list.recurring }
}

/** Keyless Google Maps walking directions to a place */
export const directionsUrl = (place: { lat: number; lng: number }) =>
  `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&travelmode=walking`

/* A trip's days */

/** The days of the plan that already have a stop with this title */
export const daysWithStop = (days: { number: number; stops: { title: string }[] }[] | null, title: string) =>
  (days ?? []).filter((d) => d.stops.some((s) => s.title.trim().toLowerCase() === title.trim().toLowerCase())).map((d) => d.number)


/** The festivals that fall on days of the trip: each with the trip day it falls on, preferring the event's main day */
export function tripOverlaps(items: EventInstance[], trip: TripDates) {
  if (!trip.startDate) return []
  const end = trip.endDate ?? trip.startDate
  const last = Math.min(daysBetween(trip.startDate, end) + 1, MAX_TRIP_DAYS)
  const found: { item: EventInstance; dayNumber: number; date: string }[] = []
  for (const item of items) {
    const days = Array.from({ length: last }, (_, i) => ({ dayNumber: i + 1, date: addDays(trip.startDate!, i) })).filter(
      (d) => d.date >= item.from && d.date <= item.to,
    )
    if (!days.length) continue
    const day = days.find((d) => item.peak.includes(d.date)) ?? days[0]
    found.push({ item, ...day })
  }
  return found.sort((a, b) => a.date.localeCompare(b.date))
}

/** “Your {day} is Diwali…” with the trip day filled in */
export const tipText = (tripTip: string, dayNumber: number) => tripTip.replace('{day}', `Day ${dayNumber}`)

export type PickableDay = { dayNumber: number; date: string | null; label: string; enabled: boolean; note: string | null }

/** The days of the trip an event can be added to; a day the event isn't on is shown but off */
export function pickableDays(event: AnyEvent, trip: TripDates & { flexibleDays?: number }): PickableDay[] {
  if (!trip.startDate) {
    const length = Math.min(MAX_TRIP_DAYS, Math.max(1, trip.flexibleDays ?? 3))
    return Array.from({ length }, (_, i) => ({ dayNumber: i + 1, date: null, label: `Day ${i + 1}`, enabled: true, note: null }))
  }
  const end = trip.endDate ?? trip.startDate
  const length = Math.min(MAX_TRIP_DAYS, daysBetween(trip.startDate, end) + 1)
  return Array.from({ length }, (_, i) => {
    const date = addDays(trip.startDate!, i)
    const runs = !isInstance(event) || (date >= event.from && date <= event.to)
    return { dayNumber: i + 1, date, label: `Day ${i + 1} · ${formatDay(date)}`, enabled: runs, note: runs ? null : 'Not on' }
  })
}

/** The day to start on: the event's main day if the trip has it, else the first day it can go on */
export function startingDay(event: AnyEvent, days: PickableDay[]) {
  const open = days.filter((d) => d.enabled)
  if (isInstance(event)) {
    const main = open.find((d) => d.date !== null && event.peak.includes(d.date))
    if (main) return main
  }
  return open[0] ?? null
}

/* CrowdPulse */

/** The crowd said in words */
export const crowdPhrase = (label: CrowdLabel) =>
  ({ packed: 'very heavy crowds', busy: 'heavy crowds', moderate: 'busier than usual', quiet: 'calm', closed: 'closed' })[label]

/** “Jagannath Rath Yatra: very heavy crowds at Jagdish Temple, 2–7:30 PM” */
export const festivalLine = (name: string, site: Pick<SiteCrowd, 'siteName' | 'windowLabel' | 'peak'>) =>
  `${name}: ${crowdPhrase(site.peak.label)} at ${site.siteName}, ${site.windowLabel}`

export type SiteFestival = {
  item: EventInstance
  site: SiteCrowd
  date: string
  when: 'today' | 'tomorrow' | 'trip'
  /** Which day of the squad's trip, when it is one */
  dayNumber: number | null
}

/**
 * The festival to mention on a site: one that touches it today, else tomorrow, else on a day of the squad's trip.
 * Quiet-label impacts (a calm festival) are skipped: the line is a warning.
 */
export function festivalForSite(items: EventInstance[], siteId: string, today: string, trip: TripDates | null): SiteFestival | null {
  const tomorrow = addDays(today, 1)
  const matches: SiteFestival[] = []
  for (const item of items) {
    const site = item.crowd.sites.find((s) => s.siteId === siteId)
    if (!site || site.peak.label === 'quiet') continue
    for (const date of site.dates) {
      const dayNumber = trip?.startDate && date >= trip.startDate && date <= (trip.endDate ?? trip.startDate) ? daysBetween(trip.startDate, date) + 1 : null
      const when = date === today ? 'today' : date === tomorrow ? 'tomorrow' : dayNumber !== null && date > today ? 'trip' : null
      if (when) matches.push({ item, site, date, when, dayNumber })
    }
  }
  const order = { today: 0, tomorrow: 1, trip: 2 }
  return matches.sort((a, b) => order[a.when] - order[b.when] || a.date.localeCompare(b.date))[0] ?? null
}
