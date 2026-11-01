import { useEffect, useRef, useState } from 'react'
import iconSparkles from '../../assets/icons/icon-sparkles-white.svg'
import iconClose from '../../assets/figma/icon-x-ink.svg'
import { Button } from '../../components/Button'
import { CrowdChip } from '../../components/crowd/Crowd'
import { Skeleton } from '../../components/states/Skeleton'
import {
  opsApi, type AdvisoryDraft, type NewAdvisory, type OpsForecast, type OpsSite, type PartnerAdvisory, type Reach,
} from '../../services/opsService'
import { AdvisoryComposer } from './AdvisoryComposer'
import { OpsBars } from './OpsBars'
import { dayLabel, formatClock, formatWindow, numberText, peopleText, squadsText } from './opsData'
import './SiteSheet.css'

type SiteSheetProps = {
  forecast: OpsForecast
  site: OpsSite
  /** The hour whose numbers are shown */
  hour: number
  /** Count the simulated squads when estimating reach */
  sample: boolean
  /** Advisories already live for this site on this day */
  advisories: PartnerAdvisory[]
  /** Open straight into drafting, for the "Draft advisory" buttons */
  startDraft: boolean
  onHour: (hour: number) => void
  onClose: () => void
  onPublished: (reach: Reach) => void
  onWithdraw: (id: string) => Promise<void>
}

type Phase = 'idle' | 'drafting' | 'editing' | 'failed'

/**
 * A site's day in a bottom sheet: the hour-by-hour bars (modelled against with squads), the numbers for the chosen
 * hour, and the advisory flow: draft with GhoomMate, edit, publish.
 */
export function SiteSheet({ forecast, site, hour, sample, advisories, startDraft, onHour, onClose, onPublished, onWithdraw }: SiteSheetProps) {
  const [phase, setPhase] = useState<Phase>(startDraft ? 'drafting' : 'idle')
  const [draft, setDraft] = useState<AdvisoryDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const started = useRef(false)
  const cell = site.hours.find((c) => c.hour === hour) ?? site.hours.find((c) => c.level !== null) ?? site.hours[0]

  const fetchDraft = (range?: { startMinutes: number; endMinutes: number }) =>
    opsApi.draft({ siteId: site.id, date: forecast.date, sample, ...range })

  const writeDraft = async () => {
    setPhase('drafting')
    setError(null)
    try {
      setDraft(await fetchDraft())
      setPhase('editing')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'GhoomMate couldn’t draft that. Try again.')
      setPhase('failed')
    }
  }

  useEffect(() => {
    closeButton.current?.focus()
    if (startDraft && !started.current) {
      started.current = true
      void writeDraft()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // Opens once per site: the draft and the key handler don't depend on later renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const publish = async (advisory: NewAdvisory) => {
    const { reach } = await opsApi.publish(advisory)
    onPublished(reach)
  }

  return (
    <div className="ops-sheet" role="dialog" aria-modal="true" aria-labelledby="ops-sheet-title">
      <button type="button" className="ops-sheet__scrim" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className="ops-sheet__panel">
        <span className="ops-sheet__handle" aria-hidden="true" />
        <header className="ops-sheet__head">
          <div className="ops-sheet__title-group">
            <h2 id="ops-sheet-title" className="ops-sheet__title">
              {site.name}
            </h2>
            <p className="ops-sheet__sub">
              {site.kind}
              {site.gem ? ' · hidden gem' : ''} · {dayLabel(forecast.date)}
              {forecast.dayNote ? ` · ${forecast.dayNote}` : ''}
            </p>
          </div>
          <button ref={closeButton} type="button" className="ops-sheet__close" aria-label="Close" onClick={onClose}>
            <img src={iconClose} alt="" width={20} height={20} />
          </button>
        </header>

        <section className="ops-sheet__section" aria-label="Hour by hour">
          <div className="ops-sheet__section-head">
            <h3 className="overline">Hour by hour</h3>
            <ul className="ops-sheet__legend" aria-hidden="true">
              <li>
                <span className="ops-sheet__swatch ops-sheet__swatch--base" />
                Modelled
              </li>
              <li>
                <span className="ops-sheet__swatch ops-sheet__swatch--with" />
                With squads
              </li>
            </ul>
          </div>
          <OpsBars site={site} selectedHour={cell.hour} onSelect={onHour} />
          <HourFacts site={site} hour={cell.hour} />
        </section>

        <ul className="ops-sheet__tiles">
          <li className="ops-sheet__tile">
            <span className="overline">Peak</span>
            <strong>{site.peak ? `${site.peak.time} · ${site.peak.level}/100` : 'Closed'}</strong>
            {site.peak && <CrowdChip label={site.peak.label} />}
          </li>
          <li className="ops-sheet__tile">
            <span className="overline">Best alternative</span>
            <strong>{site.best ? `${formatClock(site.best.minutes)} · ${site.best.level}/100` : 'None'}</strong>
            {site.best && <CrowdChip label={site.best.label} />}
          </li>
        </ul>

        {advisories.length > 0 && (
          <section className="ops-sheet__section" aria-label="Live advisories here">
            <h3 className="overline">Live here</h3>
            <ul className="ops-sheet__live">
              {advisories.map((a) => (
                <LiveAdvisory key={a.id} advisory={a} onWithdraw={onWithdraw} />
              ))}
            </ul>
          </section>
        )}

        {phase === 'idle' && (
          <div className="ops-sheet__cta">
            <Button variant="primary" onClick={() => void writeDraft()}>
              <img src={iconSparkles} alt="" width={18} height={18} />
              Draft advisory
            </Button>
            <p className="ops-sheet__cta-text">GhoomMate writes it in English and Hindi from this forecast. You edit before anything goes out.</p>
          </div>
        )}

        {phase === 'drafting' && (
          <div className="ops-sheet__drafting" role="status" aria-live="polite">
            <p className="ops-sheet__drafting-text">GhoomMate is drafting…</p>
            <Skeleton variant="line" height={14} />
            <Skeleton variant="line" height={14} width="86%" />
            <Skeleton variant="line" height={14} width="64%" />
          </div>
        )}

        {phase === 'failed' && (
          <div className="ops-sheet__cta">
            <p className="ops-sheet__error" role="alert">
              {error}
            </p>
            <Button variant="primary" onClick={() => void writeDraft()}>
              Try again
            </Button>
          </div>
        )}

        {phase === 'editing' && draft && (
          <AdvisoryComposer
            // A new draft for the same site starts a fresh form
            key={`${draft.draft.siteId}:${draft.draft.date}`}
            draft={draft.draft}
            source={draft.source}
            sample={sample}
            onRedraft={fetchDraft}
            onPublish={publish}
            onDiscard={() => {
              setDraft(null)
              setPhase('idle')
            }}
          />
        )}
      </div>
    </div>
  )
}

/** The numbers behind one hour: the modelled level, what the squads add and how many are arriving */
function HourFacts({ site, hour }: { site: OpsSite; hour: number }) {
  const cell = site.hours.find((c) => c.hour === hour)
  if (!cell || cell.level === null) {
    return <p className="ops-sheet__facts">{site.name} is closed at {formatClock(hour * 60)}.</p>
  }
  const arriving = cell.squads
  return (
    <div className="ops-sheet__facts" aria-live="polite">
      <div className="ops-sheet__facts-head">
        <strong>{cell.time}</strong>
        <CrowdChip label={cell.label} detail={`${cell.level}/100`} />
      </div>
      <p>
        Modelled {cell.baseline}
        {cell.uplift > 0 ? <> · squads add <strong>+{cell.uplift}</strong></> : ' · no squads planned yet'}
        {cell.label !== cell.baselineLabel && ` · tips it from ${cell.baselineLabel} to ${cell.label}`}
      </p>
      {arriving !== 0 && (
        <p>
          {squadsText(arriving)} start a stop this hour
          {cell.people !== null && ` · ${peopleText(cell.people)}`}
        </p>
      )}
    </div>
  )
}

/** An advisory that is already live, with a way to withdraw it */
function LiveAdvisory({ advisory, onWithdraw }: { advisory: PartnerAdvisory; onWithdraw: (id: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <li className="ops-sheet__live-item">
      <div className="ops-sheet__live-text">
        <strong>{formatWindow(advisory.startMinutes, advisory.endMinutes)}</strong>
        <span>{advisory.messageEn}</span>
        {advisory.reach && (
          <span className="ops-sheet__live-reach">
            Reached {squadsText(advisory.reach.squads)}
            {advisory.reach.people !== null && ` · about ${numberText(advisory.reach.people)} people`}
          </span>
        )}
      </div>
      <button
        type="button"
        className="text-link"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void onWithdraw(advisory.id).finally(() => setBusy(false))
        }}
      >
        {busy ? 'Withdrawing…' : 'Withdraw'}
      </button>
    </li>
  )
}
