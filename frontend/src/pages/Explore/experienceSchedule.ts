// Guide experiences run on weekly schedules, so the next date is worked out from today rather than stored.
// The agent does the same in backend/src/voice/experiences.ts (in IST).

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export type Weekday = (typeof WEEKDAYS)[number]

export const EVERY_DAY: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const PLURAL: Record<Weekday, string> = {
  Sun: 'Sundays',
  Mon: 'Mondays',
  Tue: 'Tuesdays',
  Wed: 'Wednesdays',
  Thu: 'Thursdays',
  Fri: 'Fridays',
  Sat: 'Saturdays',
}

const TIME = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i

/** "05:30 PM" → minutes after midnight */
export function minutesOf(time: string) {
  const match = TIME.exec(time.trim())
  if (!match) return 0
  return ((Number(match[1]) % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(match[2])
}

/** Next start on one of `days` at `startTime` that hasn't begun yet, within the coming week */
export function nextRun(experience: { days: Weekday[]; startTime: string }, now = new Date()) {
  const minutes = minutesOf(experience.startTime)
  for (let offset = 0; offset < 8; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, Math.floor(minutes / 60), minutes % 60)
    if (day > now && experience.days.includes(WEEKDAYS[day.getDay()])) return day
  }
  return null
}

/** "Today", "Tomorrow" or "Wed, 4 Nov" */
export function dayLabel(date: Date, now = new Date()) {
  const days = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000,
  )
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** The next run as "Today", "Tomorrow" or "Wed, 4 Nov" */
export const nextRunLabel = (experience: { days: Weekday[]; startTime: string }, now = new Date()) => {
  const run = nextRun(experience, now)
  return run ? dayLabel(run, now) : 'Not running this week'
}

/** "Every day", "Mon–Sat", "Wednesdays" or "Tue, Thu, Sat" */
export function formatDays(days: Weekday[]) {
  if (days.length === 7) return 'Every day'
  if (days.length === 1) return PLURAL[days[0]]
  const order = EVERY_DAY.filter((d) => days.includes(d))
  const consecutive = order.every((d, i) => i === 0 || EVERY_DAY.indexOf(d) === EVERY_DAY.indexOf(order[i - 1]) + 1)
  return consecutive && order.length > 2 ? `${order[0]}–${order[order.length - 1]}` : order.join(', ')
}
