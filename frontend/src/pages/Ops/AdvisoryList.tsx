import { useState } from 'react'
import iconClock from '../../assets/figma/icon-clock-sky.svg'
import iconMapPin from '../../assets/figma/icon-map-pin-sky.svg'
import { CrowdChip } from '../../components/crowd/Crowd'
import { EmptyState } from '../../components/states/EmptyState'
import { Skeleton } from '../../components/states/Skeleton'
import type { PartnerAdvisory } from '../../services/opsService'
import { formatClock, formatWindow, numberText, relativeDay, squadsText } from './opsData'

type AdvisoryListProps = {
  /** null while loading */
  advisories: PartnerAdvisory[] | null
  onWithdraw: (id: string) => Promise<void>
}

/** Everything live now: what travellers see, the calmer options on offer, and how many squads each one reached */
export function AdvisoryList({ advisories, onWithdraw }: AdvisoryListProps) {
  if (!advisories) return <Skeleton variant="card" height={150} />
  if (!advisories.length) {
    return (
      <EmptyState
        size="compact"
        headingLevel={3}
        title="No advisories live"
        text="Draft one from a crunch above. Every squad planned into that window sees it in their app."
      />
    )
  }
  return (
    <ul className="ops-advisories">
      {advisories.map((a) => (
        <AdvisoryCard key={a.id} advisory={a} onWithdraw={onWithdraw} />
      ))}
    </ul>
  )
}

function AdvisoryCard({ advisory: a, onWithdraw }: { advisory: PartnerAdvisory; onWithdraw: (id: string) => Promise<void> }) {
  const [hindi, setHindi] = useState(false)
  const [busy, setBusy] = useState(false)
  const swap = a.alternative?.site
  const time = a.alternative?.time
  const showHindi = hindi && a.messageHi

  return (
    <li className="card ops-advisory">
      <div className="ops-advisory__head">
        <div className="ops-advisory__title">
          <p className="ops-advisory__when">
            <span className="tag">{relativeDay(a.date)}</span>
            {formatWindow(a.startMinutes, a.endMinutes)}
          </p>
          <h3 className="ops-advisory__site">{a.siteName}</h3>
        </div>
        <CrowdChip label={a.level} size="large" />
      </div>

      <p className="ops-advisory__message" lang={showHindi ? 'hi' : 'en'}>
        {showHindi ? a.messageHi : a.messageEn}
      </p>

      {(swap || time) && (
        <ul className="ops-advisory__options" aria-label="Calmer options on offer">
          {swap && (
            <li>
              <img src={iconMapPin} alt="" width={14} height={14} />
              Swap to {swap.name}
            </li>
          )}
          {time && (
            <li>
              <img src={iconClock} alt="" width={14} height={14} />
              Come at {formatClock(time.minutes)}
            </li>
          )}
        </ul>
      )}

      <div className="ops-advisory__foot">
        <p className="ops-advisory__reach">
          {a.reach ? (
            <>
              Reached <strong>{squadsText(a.reach.squads)}</strong>
              {a.reach.people !== null && ` · about ${numberText(a.reach.people)} people`}
            </>
          ) : (
            'Live for travellers'
          )}
        </p>
        <div className="ops-advisory__actions">
          {a.messageHi && (
            <button type="button" className="text-link" aria-pressed={hindi} onClick={() => setHindi(!hindi)}>
              {hindi ? 'English' : 'हिन्दी'}
            </button>
          )}
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void onWithdraw(a.id).finally(() => setBusy(false))
            }}
          >
            {busy ? 'Withdrawing…' : 'Withdraw'}
          </button>
        </div>
      </div>
    </li>
  )
}
