import { isoDate, tripDayLabel } from '../../data/activeTrip'
import type { ItineraryDay, TripDetail } from '../../services/tripsService'
import type { MakerSummary, PriceVerdict, Route, Workshop } from '../../services/makersService'

/** "6 min", "1 h 15 min", with non-breaking spaces so a number never wraps away from its unit */
export function minutesLabel(minutes: number) {
  if (minutes < 60) return `${minutes}\u00a0min`
  const rest = minutes % 60
  return rest ? `${Math.floor(minutes / 60)}\u00a0h ${rest}\u00a0min` : `${minutes / 60}\u00a0h`
}

/** "90 min", "2 hrs", "2.5 hrs" */
export const durationLabel = (minutes: number) => (minutes < 120 ? `${minutes} min` : `${minutes / 60} hrs`)

/** "6 min walk from City Palace" or "About 1 h 15 min by road from City Palace" (lower-case "about" when it follows other words) */
export const routeLabel = (route: Route, inline = false) =>
  route.mode === 'walk'
    ? `${minutesLabel(route.minutes)} walk from ${route.siteName}`
    : `${inline ? 'about' : 'About'} ${minutesLabel(route.minutes)} by road from ${route.siteName}`

/** Keyless Google Maps directions to the studio */
export const directionsUrl = (place: { lat: number; lng: number }, mode: Route['mode'] = 'walk') =>
  `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&travelmode=${mode === 'walk' ? 'walking' : 'driving'}`

export const openDirections = (place: { lat: number; lng: number }, mode: Route['mode'] = 'walk') =>
  window.open(directionsUrl(place, mode), '_blank', 'noopener')

export const firstName = (name: string) => name.split(' ')[0]

/** "2–8 people" */
export const groupLabel = (workshop: Pick<Workshop, 'minPeople' | 'maxPeople'>) => `${workshop.minPeople}–${workshop.maxPeople} people`

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// Weeks start on Monday for the "Mon–Sat" labels
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0]

/** "Mon–Sat" or "Tue–Sun", or the days spelled out when they aren't one run */
export function daysLabel(days: number[]) {
  const set = new Set(days)
  const places = MONDAY_FIRST.map((day, i) => (set.has(day) ? i : -1)).filter((i) => i >= 0)
  if (places.length === 7) return 'Every day'
  const name = (place: number) => WEEKDAYS[MONDAY_FIRST[place]]
  const oneRun = places.every((place, i) => i === 0 || place === places[i - 1] + 1)
  return oneRun && places.length > 2 ? `${name(places[0])}–${name(places[places.length - 1])}` : places.map(name).join(', ')
}

/** "Mon–Sat · 10:30 AM, 12:30 PM, 04:00 PM" */
export const scheduleLabel = (weekly: Workshop['weekly']) => weekly.map((w) => `${daysLabel(w.days)} · ${w.times.join(', ')}`).join(' · ')

/** The query part of the hash route: #/trip/explore/makers?near=city-palace */
export const hashParams = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '')

/** Where a screen was opened from (so Back returns there); only trip screens, never an arbitrary path */
export function backTarget(fallback: string) {
  const from = hashParams().get('from')
  return from && /^trip\/[\w/-]+$/.test(from) ? from : fallback
}

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const addDays = (iso: string, days: number) => {
  const date = parse(iso)
  date.setDate(date.getDate() + days)
  return isoDate(date)
}

export type PickableDay = { date: string; dayNumber: number | null; label: string; weekday: number }

/**
 * The days a squad can book a workshop on: every day of a dated trip, or the next week for a trip with no dates yet
 * (those go onto day 1 of the plan).
 */
export function bookableDays(trip: TripDetail, days: ItineraryDay[] | null): PickableDay[] {
  const weekday = (iso: string) => parse(iso).getDay()
  if (trip.startDate) {
    const length = Math.max(days?.length ?? 0, trip.endDate ? Math.round((parse(trip.endDate).getTime() - parse(trip.startDate).getTime()) / 86_400_000) + 1 : 1)
    return Array.from({ length: Math.min(length, 14) }, (_, i) => {
      const date = addDays(trip.startDate!, i)
      return { date, dayNumber: i + 1, label: `Day ${i + 1} · ${tripDayLabel(trip.startDate, i + 1)}`, weekday: weekday(date) }
    })
  }
  const tomorrow = addDays(isoDate(new Date()), 1)
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(tomorrow, i)
    const d = parse(date)
    return { date, dayNumber: null, label: `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`, weekday: d.getDay() }
  })
}

/** Why a workshop doesn't run on a day (a weekly day off, a festival, or it has gone), or null when it does */
export function offReason(day: PickableDay, workshop: Pick<Workshop, 'weekly'>, closedDates: { date: string; reason: string }[]) {
  const closed = closedDates.find((c) => c.date === day.date)
  if (closed) return closed.reason.split(':')[0]
  if (!workshop.weekly.some((w) => w.days.includes(day.weekday))) return 'Day off'
  if (day.date < isoDate(new Date())) return 'Passed'
  return null
}

/** The squad's next heritage stop, so “makers near your next stop” knows where to measure from */
export function nextHeritageStop(trip: TripDetail | null, days: ItineraryDay[] | null) {
  const stops = (days ?? []).flatMap((d) => d.stops.filter((s) => s.crowd?.siteId))
  if (!trip || !stops.length) return null
  const today = isoDate(new Date())
  const start = trip.startDate
  const end = trip.endDate ?? start
  // On a live trip, the first stop still ahead of us; before or after it, the first stop of the plan
  const live = start && end && today >= start && today <= end
  const upcoming = live ? stops.find((s) => addDays(start, s.dayNumber - 1) >= today) : null
  const stop = upcoming ?? stops[0]
  return { siteId: stop.crowd!.siteId, siteName: stop.crowd!.siteName, title: stop.title, dayNumber: stop.dayNumber }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "8 Nov" */
export const shortDate = (iso: string) => {
  const [, month, day] = iso.split('-').map(Number)
  return `${day} ${MONTHS[month - 1]}`
}

/** The days still to come when every maker is closed: "Diwali (8 Nov)" */
export function closedLabel(closedDates: { date: string; reason: string }[]) {
  const today = isoDate(new Date())
  return closedDates
    .filter((c) => c.date >= today)
    .map((c) => `${c.reason.split(':')[0]} (${shortDate(c.date)})`)
    .join(', ')
}

/** Where a maker is, in a line: “Jagdish Chowk · 6 min walk” when measured from a site, else from the nearest one */
export function whereLabel(maker: MakerSummary) {
  const route = maker.fromSite ?? maker.nearest
  const area = maker.area.split(',')[0]
  const time = route.mode === 'walk' ? `${minutesLabel(route.minutes)} walk` : `about ${minutesLabel(route.minutes)} by road`
  return maker.fromSite ? `${area} · ${time}` : `${area} · ${time} from ${route.siteName}`
}

export const VERDICT_TONE: Record<PriceVerdict, 'fair' | 'high' | 'tourist' | 'low'> = {
  fair: 'fair',
  'a-bit-high': 'high',
  'tourist-price': 'tourist',
  'too-low': 'low',
}
