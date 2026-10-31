import { useState } from 'react'
import { iconUrl } from '../assets/icons'
import {
  MAX_TRIP_DAYS,
  addMonths,
  daysBetween,
  formatDay,
  isoOf,
  monthGrid,
  monthLabel,
  monthNumber,
  monthOf,
  todayISO,
  type IsoDate,
} from '../data/tripDates'
import './DateRangeCalendar.css'

export type DateRange = { start: IsoDate | null; end: IsoDate | null }

type DateRangeCalendarProps = {
  start: IsoDate | null
  end: IsoDate | null
  onChange: (range: DateRange) => void
  /** First day you can pick; earlier days are greyed out. Defaults to today in India, so a trip can start today. */
  min?: IsoDate
  /** The trip has begun: its first day stays put and a tap only moves the last day */
  lockStart?: boolean
  /** Longest trip in days. The itinerary holds 14. */
  maxDays?: number
  disabled?: boolean
}

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
/** How far ahead you can page */
const MONTHS_AHEAD = 18

/**
 * Month calendar for picking a trip's dates. First tap sets the start, the second the end, and tapping
 * again starts a new range. Opens on the start's month (or this month) and pages month by month.
 */
export function DateRangeCalendar({ start, end, onChange, min, lockStart = false, maxDays = MAX_TRIP_DAYS, disabled = false }: DateRangeCalendarProps) {
  const today = todayISO()
  const first = min ?? today
  // Opens on the start's month, or this month when the start is already behind us
  const [shown, setShown] = useState(() => monthOf(start && start > first ? start : first))
  const { days, blanks } = monthGrid(shown)
  const earliest = monthOf(first)
  const canGoBack = monthNumber(shown) > monthNumber(earliest)
  const canGoOn = monthNumber(shown) < monthNumber(earliest) + MONTHS_AHEAD

  const fixedStart = lockStart && start ? start : null

  // Greyed out: the past, days before a locked start, and days that would make the trip longer than maxDays
  const unavailable = (date: IsoDate) => {
    if (date < first) return 'already passed'
    if (fixedStart && date < fixedStart) return 'before the first day'
    const from = fixedStart ?? (start && !end ? start : null)
    if (from && daysBetween(from, date) >= maxDays) return `beyond the ${maxDays}-day limit`
    return null
  }

  const pick = (date: IsoDate) => {
    if (fixedStart) onChange({ start: fixedStart, end: date })
    else if (!start || end || date < start) onChange({ start: date, end: null })
    else onChange({ start, end: date })
  }

  return (
    <div className={`date-range${disabled ? ' date-range--disabled' : ''}`}>
      <div className="date-range__head">
        <h2 className="date-range__month" aria-live="polite">
          {monthLabel(shown)}
        </h2>
        <div className="date-range__nav">
          <button
            type="button"
            className="date-range__step"
            aria-label="Previous month"
            disabled={disabled || !canGoBack}
            onClick={() => setShown((m) => addMonths(m, -1))}
          >
            <img src={iconUrl('chevron-left', 'primary')} alt="" width={18} height={18} />
          </button>
          <button
            type="button"
            className="date-range__step"
            aria-label="Next month"
            disabled={disabled || !canGoOn}
            onClick={() => setShown((m) => addMonths(m, 1))}
          >
            <img src={iconUrl('chevron-right', 'primary')} alt="" width={18} height={18} />
          </button>
        </div>
      </div>
      <div className="date-range__grid">
        {WEEKDAY_INITIALS.map((w, i) => (
          <span key={i} className="date-range__weekday" aria-hidden="true">
            {w}
          </span>
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const date = isoOf(shown.year, shown.month, i + 1)
          const isStart = date === start
          const isEnd = date === end
          const inRange = !!start && !!end && date > start && date < end
          const why = unavailable(date)
          const off = why !== null
          const className = [
            'date-range__day',
            inRange && 'date-range__day--in-range',
            (isStart || isEnd) && 'date-range__day--edge',
            isStart && end && end !== start && 'date-range__day--start',
            isEnd && end !== start && 'date-range__day--end',
            off && 'date-range__day--off',
            date === today && 'date-range__day--today',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={date}
              type="button"
              className={className}
              // A locked start stays shown as picked even though it can't be tapped
              disabled={disabled || off || date === fixedStart}
              aria-pressed={isStart || isEnd || inRange}
              aria-current={date === today ? 'date' : undefined}
              aria-label={`${formatDay(date)}${date === today ? ', today' : ''}${isStart ? ', trip starts' : ''}${isEnd ? ', trip ends' : ''}${why ? `, ${why}` : ''}`}
              onClick={() => pick(date)}
            >
              <span>{i + 1}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** The tinted "Trip length" panel under a calendar */
export function RangeSummary({ value, detail }: { value: string; detail: string }) {
  return (
    <div className="range-summary" aria-live="polite">
      <p className="overline">Trip length</p>
      <p className="range-summary__value">{value}</p>
      <p className="range-summary__detail">{detail}</p>
    </div>
  )
}
