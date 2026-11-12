/**
 * Trip dates are plain YYYY-MM-DD strings, and "today" is the date in India (UTC+5:30), where every
 * GhoomMates trip happens. Everything here counts whole days from those strings instead of building
 * local-midnight Dates, so a laptop set to another time zone (or crossing a daylight-saving change)
 * still agrees on which day of the trip it is. No imports: the backend tests load this file too.
 */

export type IsoDate = string

/** The itinerary holds at most this many days (MAX_DAYS in backend/src/trips/itinerary.ts) */
export const MAX_TRIP_DAYS = 14

const DAY_MS = 86_400_000
const IST_OFFSET_MS = 330 * 60_000
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS = MONTH_NAMES.map((m) => m.slice(0, 3))
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Today's date in India, e.g. "2026-11-01" */
export function todayISO(now: Date = new Date()): IsoDate {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** Whole days since 1970-01-01, or NaN when the text isn't a real YYYY-MM-DD date */
export function dayIndex(date: IsoDate): number {
  const match = ISO_DATE.exec(date)
  if (!match) return Number.NaN
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const at = new Date(Date.UTC(year, month - 1, day))
  // Date.UTC rolls 2026-02-31 over into March; a real date comes back unchanged
  const real = at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === day
  return real ? at.getTime() / DAY_MS : Number.NaN
}

export const fromDayIndex = (index: number): IsoDate => new Date(index * DAY_MS).toISOString().slice(0, 10)

export const addDays = (date: IsoDate, days: number): IsoDate => fromDayIndex(dayIndex(date) + days)

/** Days from `from` to `to`: negative when `to` is earlier */
export const daysBetween = (from: IsoDate, to: IsoDate) => dayIndex(to) - dayIndex(from)

/** 0 = Sunday */
export const weekdayOf = (date: IsoDate) => new Date(dayIndex(date) * DAY_MS).getUTCDay()

/** Year, month (0–11) and day of month */
export function partsOf(date: IsoDate) {
  const [year, month, day] = date.split('-').map(Number)
  return { year, month: month - 1, day }
}

export const isoOf = (year: number, month: number, day: number): IsoDate => new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)

/* Display */

/** "Sat, 12 Dec" */
export function formatDay(date: IsoDate) {
  const { month, day } = partsOf(date)
  return `${WEEKDAYS[weekdayOf(date)]}, ${day} ${MONTHS[month]}`
}

/** "Sat 12 – Wed 16 Dec", "Sat 12 Dec" for one day, or "Dates TBD" */
export function formatDateRange(start: IsoDate | null, end: IsoDate | null) {
  if (!start) return 'Dates TBD'
  const last = end ?? start
  const [s, e] = [partsOf(start), partsOf(last)]
  const day = (date: IsoDate, d: number) => `${WEEKDAYS[weekdayOf(date)]} ${d}`
  if (start === last) return `${day(start, s.day)} ${MONTHS[s.month]}`
  if (s.year === e.year && s.month === e.month) return `${day(start, s.day)} – ${day(last, e.day)} ${MONTHS[e.month]}`
  return `${day(start, s.day)} ${MONTHS[s.month]} – ${day(last, e.day)} ${MONTHS[e.month]}`
}

/** Date of day N (1-based) of a trip: "Sat, 12 Dec", or "Day 2" while the trip has no dates */
export const tripDayLabel = (startDate: IsoDate | null, dayNumber: number) =>
  startDate ? formatDay(addDays(startDate, dayNumber - 1)) : `Day ${dayNumber}`

const nights = (days: number) => `${days - 1} night${days - 1 === 1 ? '' : 's'}`

/** The "Trip length" summary under the calendar */
export function describeRange(start: IsoDate | null, end: IsoDate | null): { value: string; detail: string } {
  if (start && end) {
    const days = daysBetween(start, end) + 1
    return {
      value: days === 1 ? 'A day trip' : `${days} days · ${nights(days)}`,
      detail: days === 1 ? formatDay(start) : `${formatDay(start)} → ${formatDay(end)}`,
    }
  }
  return { value: 'Pick an end date', detail: start ? `Starting ${formatDay(start)}` : 'Tap your first day' }
}

/* Where a trip is in time */

type TripDates = { startDate: IsoDate | null; endDate: IsoDate | null }

export type TripPhase = 'live' | 'upcoming' | 'past'

/** A trip is live on every day from its first to its last, both included; dateless trips count as upcoming */
export function tripPhase(trip: TripDates, today: IsoDate = todayISO()): TripPhase {
  const start = trip.startDate
  const end = trip.endDate ?? start
  if (end && end < today) return 'past'
  if (!start || start > today) return 'upcoming'
  return 'live'
}

/** Day N of M, e.g. { day: 2, total: 4 }. Meaningful while the trip is live. */
export function tripDay(trip: TripDates, today: IsoDate = todayISO()) {
  if (!trip.startDate) return null
  const end = trip.endDate ?? trip.startDate
  return { day: daysBetween(trip.startDate, today) + 1, total: daysBetween(trip.startDate, end) + 1 }
}

/** Whole days from today until `date`; null without a date */
export const daysUntil = (date: IsoDate | null, today: IsoDate = todayISO()) => (date ? daysBetween(today, date) : null)

/* Picking a range on a calendar */

export type DateRange = { start: IsoDate | null; end: IsoDate | null }

/** What tapping `date` does to a range: the first tap sets the start, the second the end, a third starts over. A locked start stays, and only the end moves. */
export function pickDate(range: DateRange, date: IsoDate, lockedStart: IsoDate | null = null): DateRange {
  if (lockedStart) return { start: lockedStart, end: date }
  const { start, end } = range
  if (!start || end || date < start) return { start: date, end: null }
  return { start, end: date }
}

type PickRules = { first: IsoDate; maxDays: number; lockedStart?: IsoDate | null }

/** Why a day can't be picked, or null when it can: it has passed, comes before a locked start, or would make the trip longer than `maxDays` */
export function unavailableReason(date: IsoDate, range: DateRange, { first, maxDays, lockedStart = null }: PickRules): string | null {
  if (date < first) return 'already passed'
  if (lockedStart && date < lockedStart) return 'before the first day'
  const from = lockedStart ?? (range.start && !range.end ? range.start : null)
  if (from && daysBetween(from, date) >= maxDays) return `beyond the ${maxDays}-day limit`
  return null
}

/* Month calendars */

export type Month = { year: number; month: number }

export const monthOf = (date: IsoDate): Month => {
  const { year, month } = partsOf(date)
  return { year, month }
}

/** Months since year 0, so two months compare with < and > */
export const monthNumber = (m: Month) => m.year * 12 + m.month

export function addMonths(m: Month, months: number): Month {
  const total = monthNumber(m) + months
  return { year: Math.floor(total / 12), month: total % 12 }
}

/** "November 2026" */
export const monthLabel = (m: Month) => `${MONTH_NAMES[m.month]} ${m.year}`

/** Days in the month, and the empty cells before the 1st in a Monday-first grid */
export function monthGrid(m: Month) {
  return {
    days: new Date(Date.UTC(m.year, m.month + 1, 0)).getUTCDate(),
    blanks: (weekdayOf(isoOf(m.year, m.month, 1)) + 6) % 7,
  }
}
