import type { CrowdLabel } from '../../services/heritageService'
import type { Shown } from '../../services/opsService'

/** Copy and small helpers for the Heritage Ops console */

export const DAYS = [
  { id: 'today', label: 'Today', offset: 0 },
  { id: 'tomorrow', label: 'Tomorrow', offset: 1 },
] as const
export type DayId = (typeof DAYS)[number]['id']

export const HEAT_MODES = [
  { id: 'squads', label: 'With squads' },
  { id: 'baseline', label: 'Modelled' },
] as const
export type HeatMode = (typeof HEAT_MODES)[number]['id']

/** How often the console refreshes itself while it's open */
export const REFRESH_MS = 45_000

export const COPY = {
  eyebrow: 'Partner tools · Udaipur',
  title: 'Heritage Ops',
  preview: 'Partner preview',
  sampleTitle: 'Include sample squads',
  sampleText: 'Simulated squads fill out the city for the demo. Real plans from the app are always counted.',
  privacy: 'Aggregates only. Counts under 3 squads show as <3, and no trip names or members are ever shown.',
  method:
    'Forecast = the modelled crowd for a typical day plus the squads’ own plans: each planned person adds load against the site’s hourly capacity, for as long as the squad stays.',
}

/** Short names so the heatmap's first column stays narrow; the sheet and screen readers use the full name */
const SHORT_NAMES: Record<string, string> = {
  'pichola-boat': 'Pichola boats',
  'bagore-ki-haveli': 'Bagore Haveli',
  sajjangarh: 'Sajjangarh',
  'saheliyon-ki-bari': 'Saheliyon Bari',
  'lok-kala-mandal': 'Lok Kala',
  shilpgram: 'Shilpgram',
  'vintage-cars': 'Vintage cars',
  'neemach-mata': 'Neemach Mata',
  'karni-mata': 'Karni Mata',
  'hathi-pol': 'Hathi Pol',
}
export const shortName = (site: { id: string; name: string }) => SHORT_NAMES[site.id] ?? site.name

/** Worse crowds rank higher, so a cell can tell when the squads tipped it over */
export const LEVEL_RANK: Record<CrowdLabel, number> = { closed: 0, quiet: 1, moderate: 2, busy: 3, packed: 4 }

/* Dates and times (India, where the sites are) */

const IST_OFFSET_MS = 330 * 60_000
const DAY_MS = 86_400_000

/** YYYY-MM-DD in India, `offset` days from today */
export function istDate(offset = 0, now = new Date()) {
  return new Date(now.getTime() + IST_OFFSET_MS + offset * DAY_MS).toISOString().slice(0, 10)
}

/** The hour of the day in India right now */
export const istHour = (now = new Date()) => new Date(now.getTime() + IST_OFFSET_MS).getUTCHours()

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Mon 2 Nov" */
export function dayLabel(date: string) {
  const day = new Date(`${date}T00:00:00Z`)
  return `${WEEKDAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`
}

/** "Today", "Tomorrow", else "Sat 7 Nov" */
export function relativeDay(date: string, now = new Date()) {
  if (date === istDate(0, now)) return 'Today'
  if (date === istDate(1, now)) return 'Tomorrow'
  return dayLabel(date)
}

const clock = (minutes: number) => {
  const hour = Math.floor(minutes / 60) % 24
  return { hour12: hour % 12 || 12, minute: minutes % 60, pm: hour >= 12 }
}
const digits = (c: ReturnType<typeof clock>) => `${c.hour12}${c.minute ? `:${String(c.minute).padStart(2, '0')}` : ''}`

/** "9:30 AM", "12 PM" */
export function formatClock(minutes: number) {
  const c = clock(minutes)
  return `${digits(c)} ${c.pm ? 'PM' : 'AM'}`
}

/** "10 AM–12 PM", or "10–11 AM" when both ends share AM or PM */
export function formatWindow(startMinutes: number, endMinutes: number) {
  const a = clock(startMinutes)
  const b = clock(endMinutes)
  return a.pm === b.pm ? `${digits(a)}–${digits(b)} ${a.pm ? 'PM' : 'AM'}` : `${formatClock(startMinutes)}–${formatClock(endMinutes)}`
}

/** 9a, 12p, 6p: the compact hour used on chart axes */
export const shortHour = (hour: number) => `${hour % 12 || 12}${hour < 12 ? 'a' : 'p'}`

/** Half-hour steps for the advisory window pickers */
export function timeOptions(from: number, to: number, step = 30) {
  const options: number[] = []
  for (let m = from; m <= to; m += step) options.push(m)
  return options
}

/* Numbers */

export const countText = (value: Shown) => String(value)
export const peopleText = (people: number | null) => (people === null ? '' : `about ${people.toLocaleString('en-IN')} people`)
export const numberText = (value: number) => value.toLocaleString('en-IN')

/** "41 squads", "<3 squads", "1 squad" is never shown */
export const squadsText = (squads: Shown) => `${squads} ${squads === 1 ? 'squad' : 'squads'}`
