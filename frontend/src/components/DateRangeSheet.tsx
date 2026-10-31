import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import iconClose from '../assets/figma/icon-x-ink.svg'
import { describeRange, type IsoDate } from '../data/tripDates'
import { Button } from './Button'
import { DateRangeCalendar, RangeSummary, type DateRange } from './DateRangeCalendar'
import './DateRangeSheet.css'

type DateRangeSheetProps = {
  title: string
  subtitle?: string
  start: IsoDate | null
  end: IsoDate | null
  /** The trip has begun: its first day stays and only the last day can move */
  lockStart?: boolean
  /** What the picked dates will do to the plan, shown under the summary */
  hint?: (range: { start: IsoDate; end: IsoDate }) => string | null
  saveLabel?: string
  /** Saves the dates and returns; a rejection keeps the sheet open and shows its message */
  onSave: (range: { start: IsoDate; end: IsoDate }) => Promise<void>
  onClose: () => void
}

/** Bottom sheet for picking a date range with the shared calendar: opens over the trip screen, saves, then goes away. */
export function DateRangeSheet({ title, subtitle, start, end, lockStart, hint, saveLabel = 'Save dates', onSave, onClose }: DateRangeSheetProps) {
  const [range, setRange] = useState<DateRange>({ start, end })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sheetRef = useRef<HTMLElement>(null)

  useEffect(() => sheetRef.current?.focus(), [])

  const picked = range.start && range.end ? { start: range.start, end: range.end } : null
  const changed = range.start !== start || range.end !== end
  const summary = describeRange(range.start, range.end)
  const note = picked && hint ? hint(picked) : null

  const save = async () => {
    if (!picked || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSave(picked)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the dates. Try again?')
    } finally {
      setBusy(false)
    }
  }

  // Esc closes; Tab stays inside the sheet
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !busy) {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !sheetRef.current) return
    const focusable = sheetRef.current.querySelectorAll<HTMLElement>('button:not(:disabled)')
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === sheetRef.current)) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return (
    <div className="date-sheet" onKeyDown={onKeyDown}>
      <button type="button" className="date-sheet__scrim" tabIndex={-1} aria-hidden="true" onClick={() => !busy && onClose()} />
      <section ref={sheetRef} tabIndex={-1} className="date-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="date-sheet-title">
        <span className="date-sheet__grabber" aria-hidden="true" />
        <header className="date-sheet__top">
          <div>
            <h2 id="date-sheet-title" className="date-sheet__title">
              {title}
            </h2>
            {subtitle && <p className="date-sheet__subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="date-sheet__close" aria-label="Close" disabled={busy} onClick={onClose}>
            <img src={iconClose} alt="" width={16} height={16} />
          </button>
        </header>

        <DateRangeCalendar start={range.start} end={range.end} lockStart={lockStart} disabled={busy} onChange={setRange} />

        <RangeSummary value={summary.value} detail={summary.detail} />
        {note && <p className="date-sheet__note">{note}</p>}
        {error && (
          <p className="date-sheet__error" role="alert">
            {error}
          </p>
        )}

        <Button variant="primary" disabled={!picked || !changed || busy} aria-busy={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : saveLabel}
        </Button>
      </section>
    </div>
  )
}
