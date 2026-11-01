import { useEffect, useState } from 'react'
import iconMegaphone from '../../assets/icons/icon-megaphone-white.svg'
import { Button, LinkButton } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { opsApi, type AdvisoryDraft, type AdvisoryLevel, type NewAdvisory, type Reach } from '../../services/opsService'
import { formatClock, formatWindow, numberText, squadsText, timeOptions } from './opsData'
import './AdvisoryComposer.css'

type Draft = AdvisoryDraft['draft']

type AdvisoryComposerProps = {
  draft: Draft
  source: AdvisoryDraft['source']
  /** Count the simulated squads in the reach */
  sample: boolean
  /** Writes a fresh draft for another window */
  onRedraft: (range: { startMinutes: number; endMinutes: number }) => Promise<AdvisoryDraft>
  onPublish: (advisory: NewAdvisory) => Promise<void>
  onDiscard: () => void
}

const MAX_EN = 300
const MAX_HI = 420
const REACH_DEBOUNCE_MS = 250
/** Windows run from 5 AM to the last half hour of the evening, at most 12 hours long */
const START_OPTIONS = timeOptions(5 * 60, 22 * 60 + 30)

/**
 * Edit what GhoomMate drafted, then publish: the window, how crowded it will be, the English and Hindi messages and
 * the calmer options. It shows who the advisory would reach, live, as the window changes.
 */
export function AdvisoryComposer({ draft: first, source: firstSource, sample, onRedraft, onPublish, onDiscard }: AdvisoryComposerProps) {
  const [drafted, setDrafted] = useState({ draft: first, source: firstSource })
  const draft = drafted.draft
  const [start, setStart] = useState(draft.startMinutes)
  const [end, setEnd] = useState(draft.endMinutes)
  const [level, setLevel] = useState<AdvisoryLevel>(draft.level)
  const [messageEn, setMessageEn] = useState(draft.messageEn)
  const [messageHi, setMessageHi] = useState(draft.messageHi)
  const [swap, setSwap] = useState(draft.alternative.site !== null)
  const [move, setMove] = useState(draft.alternative.time !== null)
  const [reachFor, setReachFor] = useState<{ key: string; reach: Reach | null } | null>(null)
  const [redrafting, setRedrafting] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const endOptions = timeOptions(start + 30, Math.min(start + 12 * 60, 24 * 60))
  const windowChanged = start !== draft.startMinutes || end !== draft.endMinutes
  const { site: altSite, time: altTime } = draft.alternative

  // Who the advisory reaches, for the window as it is now (the last answer stays up, dimmed, while the next one loads)
  const reachKey = `${draft.siteId}:${draft.date}:${start}:${end}:${sample}`
  const reaching = reachFor?.key !== reachKey
  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      opsApi
        .reach({ siteId: draft.siteId, date: draft.date, startMinutes: start, endMinutes: end, sample })
        .then(
          (reach) => !cancelled && setReachFor({ key: reachKey, reach }),
          () => !cancelled && setReachFor({ key: reachKey, reach: null }),
        )
    }, REACH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [reachKey, draft.siteId, draft.date, start, end, sample])

  const changeStart = (value: number) => {
    setStart(value)
    // Keep the window sensible: at least half an hour, at most twelve
    if (end <= value || end > value + 12 * 60) setEnd(Math.min(value + 2 * 60, 24 * 60))
  }

  const redraft = async () => {
    setRedrafting(true)
    setError(null)
    try {
      const next = await onRedraft({ startMinutes: start, endMinutes: end })
      setDrafted({ draft: next.draft, source: next.source })
      setLevel(next.draft.level)
      setMessageEn(next.draft.messageEn)
      setMessageHi(next.draft.messageHi)
      setSwap(next.draft.alternative.site !== null)
      setMove(next.draft.alternative.time !== null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'GhoomMate couldn’t redraft that. Try again.')
    } finally {
      setRedrafting(false)
    }
  }

  const publish = async () => {
    setPublishing(true)
    setError(null)
    try {
      await onPublish({
        siteId: draft.siteId,
        date: draft.date,
        startMinutes: start,
        endMinutes: end,
        level,
        messageEn: messageEn.trim(),
        messageHi: messageHi.trim(),
        altSiteId: swap && altSite ? altSite.id : null,
        altMinutes: move && altTime ? altTime.minutes : null,
        sample,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t publish. Try again.')
      setPublishing(false)
    }
  }

  const busy = publishing || redrafting

  return (
    <section className="ops-compose" aria-label="Advisory draft">
      <div className="ops-compose__head">
        <h3 className="overline">Advisory draft</h3>
        <span className="ops-compose__source">{drafted.source === 'gemini' ? 'Drafted by GhoomMate' : 'Template draft'}</span>
      </div>

      {draft.calm && (
        <p className="ops-compose__note">
          {draft.peakLevel === null ? 'The site is closed then.' : `That window looks calm (${draft.peakLevel}/100).`} A busier window may suit an
          advisory better.
        </p>
      )}

      <div className="ops-compose__row">
        <label className="ops-field">
          <span className="ops-field__label">From</span>
          <select className="ops-field__select" value={start} onChange={(e) => changeStart(Number(e.target.value))}>
            {START_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {formatClock(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="ops-field">
          <span className="ops-field__label">Until</span>
          <select className="ops-field__select" value={end} onChange={(e) => setEnd(Number(e.target.value))}>
            {endOptions.map((m) => (
              <option key={m} value={m}>
                {formatClock(m % 1440)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="ops-compose__group" role="group" aria-label="Expected crowd">
        <span className="ops-field__label">Expected crowd</span>
        <div className="ops-compose__chips">
          <Chip selected={level === 'busy'} onClick={() => setLevel('busy')}>
            Busy
          </Chip>
          <Chip selected={level === 'packed'} onClick={() => setLevel('packed')}>
            Packed
          </Chip>
        </div>
      </div>

      {windowChanged && (
        <div className="ops-compose__redraft">
          <span>The wording was written for {formatWindow(draft.startMinutes, draft.endMinutes)}.</span>
          <LinkButton onClick={() => void redraft()} disabled={busy}>
            {redrafting ? 'Redrafting…' : `Redraft for ${formatWindow(start, end)}`}
          </LinkButton>
        </div>
      )}

      <label className="ops-field">
        <span className="ops-field__label ops-field__label--split">
          English
          <span>{messageEn.length}/{MAX_EN}</span>
        </span>
        <textarea
          className="ops-field__textarea"
          rows={4}
          maxLength={MAX_EN}
          value={messageEn}
          onChange={(e) => setMessageEn(e.target.value)}
        />
      </label>
      <label className="ops-field">
        <span className="ops-field__label ops-field__label--split">
          <span lang="hi">हिन्दी</span>
          <span>{messageHi.length}/{MAX_HI}</span>
        </span>
        <textarea
          className="ops-field__textarea"
          lang="hi"
          rows={3}
          maxLength={MAX_HI}
          value={messageHi}
          onChange={(e) => setMessageHi(e.target.value)}
        />
      </label>

      {(altSite || altTime) && (
        <div className="ops-compose__group" role="group" aria-label="Offer travellers a calmer option">
          <span className="ops-field__label">Offer a calmer option</span>
          <div className="ops-compose__chips">
            {altSite && (
              <Chip selected={swap} onClick={() => setSwap(!swap)}>
                Swap to {altSite.name}
              </Chip>
            )}
            {altTime && (
              <Chip selected={move} onClick={() => setMove(!move)}>
                Come at {formatClock(altTime.minutes)}
              </Chip>
            )}
          </div>
          {altSite && (
            <p className="ops-compose__hint">
              {altSite.name} stays {altSite.label} then ({altSite.level}/100), about {altSite.km} km away
              {altSite.calmUntil ? `, calm until ${altSite.calmUntil}` : ''}.
            </p>
          )}
        </div>
      )}

      <div className={`ops-compose__reach${reaching ? ' ops-compose__reach--loading' : ''}`} role="status">
        <ReachSummary reach={reachFor?.reach ?? null} loading={reaching} windowText={formatWindow(start, end)} />
      </div>

      {error && (
        <p className="ops-compose__error" role="alert">
          {error}
        </p>
      )}

      <Button variant="primary" onClick={() => void publish()} disabled={busy || !messageEn.trim() || end <= start}>
        <img src={iconMegaphone} alt="" width={18} height={18} />
        <span className="ops-compose__publish-label">{publishing ? 'Publishing…' : 'Publish advisory'}</span>
      </Button>
      <LinkButton onClick={onDiscard} disabled={busy}>
        Discard draft
      </LinkButton>
    </section>
  )
}

/** Who a window reaches, in words: squads, people, and the relief if some of them swap */
export function ReachSummary({ reach, loading, windowText }: { reach: Reach | null; loading: boolean; windowText: string }) {
  if (!reach) {
    return <p className="ops-compose__reach-text">{loading ? 'Checking who this reaches…' : 'Reach isn’t available right now. You can still publish.'}</p>
  }
  if (reach.squads === '<3') {
    return <p className="ops-compose__reach-text">Fewer than 3 squads plan to be there {windowText} so far. It will reach each one that does.</p>
  }
  if (reach.squads === 0) {
    return <p className="ops-compose__reach-text">No squads plan to be there {windowText} yet. It will reach each one that does.</p>
  }
  return (
    <>
      <p className="ops-compose__reach-text">
        <strong>Reaches {squadsText(reach.squads)}</strong>
        {reach.people !== null && ` · about ${numberText(reach.people)} people`} starting a stop {windowText}.
      </p>
      {reach.relief !== null && (
        <p className="ops-compose__reach-sub">
          If {Math.round(reach.pickup * 10)} in 10 take the swap, about {numberText(reach.relief)} people leave the crunch.
          {reach.includesSample && ' Includes simulated squads.'}
        </p>
      )}
    </>
  )
}
