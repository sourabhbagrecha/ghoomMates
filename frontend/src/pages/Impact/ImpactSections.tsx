import { useState, type CSSProperties } from 'react'
import iconCheck from '../../assets/figma/icon-check-white-bold.svg'
import iconChevronDown from '../../assets/figma/icon-chevron-down-muted.svg'
import { iconUrl } from '../../assets/icons'
import { AvatarStack } from '../../components/Avatar'
import { CrowdChip } from '../../components/crowd/Crowd'
import { EmptyState } from '../../components/states/EmptyState'
import { useNavigate } from '../../hooks/navigation'
import type { CrowdSmart, ImpactReport, LocalSpend, PledgeSummary, Swap } from '../../services/impactService'
import { CLASS_COLOURS, fmtHours, fmtRupees, fmtRupeesFull } from './impactData'
import { impactStore } from './useImpact'

/** Icon tile + title + one line, the head of every section card */
function Head({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="impact-head">
      <span className="impact-head__icon">
        <img src={iconUrl(icon, 'primary')} alt="" width={20} height={20} />
      </span>
      <div className="impact-head__text">
        <h2 className="impact-head__title">{title}</h2>
        {sub && <p className="impact-head__sub">{sub}</p>}
      </div>
    </div>
  )
}

const SWAP_ICONS: Record<Swap['kind'], string> = { walk: 'footprints', erickshaw: 'erickshaw', boat: 'sailboat', crowd: 'hourglass', local: 'hand-coins' }
const swapIcon = (swap: Swap, colour: 'primary' | 'white') => iconUrl(SWAP_ICONS[swap.kind], colour)

/** Three suggestions with exact numbers; a ride swap applies in one tap and the footprint drops on the spot */
export function SwapsSection({ swaps, tripId }: { swaps: Swap[]; tripId: string }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)

  const apply = async (swap: Swap) => {
    const action = swap.action
    if (action.type === 'stop') return navigate(`trip/itinerary/stop/${action.stopId}`)
    if (action.type === 'expense') return navigate('trip/expenses/add')
    setBusy(swap.id)
    await impactStore.setLegMode(tripId, action, action.mode)
    setBusy(null)
  }

  return (
    <section className="card">
      <Head icon="recycle" title="Three swaps" sub={swaps.length ? 'Small changes, real kilos' : undefined} />
      {swaps.length === 0 ? (
        <p className="impact-callout impact-callout--plain">You’re on the greenest option for every ride and visit. Share the card and nudge another squad.</p>
      ) : (
        <ul className="swaps">
          {swaps.map((swap) => (
            <li key={swap.id} className="swap">
              <span className="swap__icon">
                <img src={swapIcon(swap, 'primary')} alt="" width={18} height={18} />
              </span>
              <p className="swap__line">{swap.text}</p>
              <button type="button" className="pill-button" disabled={busy !== null} onClick={() => void apply(swap)}>
                {busy === swap.id ? 'Swapping…' : swap.actionLabel}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Heritage visits at quiet hours, and the crowd-hours the squad dodged by planning them so */
export function QuietHoursSection({ crowd, squad }: { crowd: CrowdSmart; squad: number }) {
  const [all, setAll] = useState(false)
  const shown = all ? crowd.visits : crowd.visits.slice(0, 4)
  return (
    <section className="card">
      <Head
        icon="hourglass"
        title="Quiet hours"
        sub={crowd.heritageStops > 0 ? `${crowd.offPeakVisits} of ${crowd.heritageStops} heritage visits off-peak` : undefined}
      />
      {crowd.heritageStops === 0 ? (
        <p className="impact-callout impact-callout--plain">
          Give heritage stops a time and GhoomMate counts the crowd you dodge. Mornings at the City Palace and the ghats are the easy wins.
        </p>
      ) : (
        <>
          <div className="stat">
            <p className="stat__value">
              {fmtHours(crowd.crowdHoursAvoided)}
              <span> crowd-hours</span>
            </p>
            <p className="stat__note">
              Person-hours {squad === 1 ? 'you' : `your ${squad} mates`} spent away from each site’s busiest hour.
            </p>
          </div>
          <ul className="visits">
            {shown.map((v) => (
              <li key={v.stopId} className="visit">
                <div className="visit__text">
                  <p className="visit__time">
                    Day {v.dayNumber} · {v.time}
                  </p>
                  <p className="visit__name">{v.siteName}</p>
                </div>
                <div className="visit__side">
                  <CrowdChip label={v.label} />
                  <p className="visit__gain">{v.avoidedPct > 0 ? `${v.avoidedPct}% under the peak` : v.label === 'closed' ? 'Closed then' : 'At the peak'}</p>
                </div>
              </li>
            ))}
          </ul>
          {crowd.visits.length > 4 && (
            <button type="button" className="text-link impact-more" onClick={() => setAll((v) => !v)}>
              {all ? 'Show fewer' : `Show all ${crowd.visits.length} visits`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

/** ₹ kept with makers, cooks, hosts and drivers, by kind of spend */
export function KeptLocalSection({ local }: { local: LocalSpend }) {
  const navigate = useNavigate()
  if (local.expenseCount === 0) {
    return (
      <EmptyState
        headingLevel={2}
        size="compact"
        title="Where will your rupees land?"
        text="Log what you spend and GhoomMate shows how much stays with local makers, cooks, hosts and drivers."
        action={{ label: 'Add an expense', onClick: () => navigate('trip/expenses/add') }}
      />
    )
  }
  const total = local.byClass.reduce((sum, c) => sum + c.paise, 0) || 1
  return (
    <section className="card">
      <Head icon="hand-coins" title="Kept local" sub={`${fmtRupeesFull(local.trackedPaise)} tracked across ${local.expenseCount} ${local.expenseCount === 1 ? 'expense' : 'expenses'}`} />
      <div className="stat">
        <p className="stat__value">
          {fmtRupees(local.keptPaise)}
          <span> with local people · {local.sharePct}%</span>
        </p>
      </div>
      <div className="spend-bar" role="img" aria-label={`${local.sharePct}% of the spend stayed with local people`}>
        {local.byClass.map((c) => (
          <span key={c.id} className="spend-bar__seg" style={{ width: `${(c.paise / total) * 100}%`, background: CLASS_COLOURS[c.id] }} />
        ))}
      </div>
      <ul className="spend-list">
        {local.byClass.map((c) => (
          <li key={c.id} className="spend-row">
            <span className="spend-row__dot" style={{ background: CLASS_COLOURS[c.id] } as CSSProperties} aria-hidden="true" />
            <div className="spend-row__text">
              <p className="spend-row__label">{c.label}</p>
              <p className="spend-row__note">{c.id === 'transport' && c.keptPaise < c.paise ? 'Autos and cabs count; apps and trains don’t' : c.note}</p>
            </div>
            <p className="spend-row__amount">{fmtRupeesFull(c.paise)}</p>
          </li>
        ))}
      </ul>
      <p className="impact-foot">
        {local.estimated > 0
          ? `${local.estimated} of ${local.expenseCount} expenses were sorted by ${local.byGemini > 0 ? 'GhoomMate’s best guess' : 'assumption'}, so treat the share as an estimate.`
          : 'Sorted by what each expense says. An estimate, not an audit.'}
      </p>
    </section>
  )
}

/** Eight Udaipur pledges; each mate ticks their own, and the squad's progress feeds the score */
export function PledgesSection({ pledges, tripId, me }: { pledges: PledgeSummary; tripId: string; me: string }) {
  return (
    <section className="card">
      <Head icon="droplets" title="Squad pledges" sub={`${pledges.ticks} of ${pledges.possible} promises made`} />
      <div className="progress" role="progressbar" aria-label="Squad pledge progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pledges.pct}>
        <span className="progress__fill" style={{ width: `${pledges.pct}%` }} />
      </div>
      <ul className="pledges">
        {pledges.items.map((p) => (
          <li key={p.id} className="pledge">
            <span className="pledge__icon">
              <img src={iconUrl(p.icon, 'primary')} alt="" width={18} height={18} />
            </span>
            <div className="pledge__text">
              <p className="pledge__title">{p.title}</p>
              <p className="pledge__why">{p.why}</p>
              {p.ticks.length > 0 && (
                <p className="pledge__who">
                  <AvatarStack people={p.ticks} size={18} overlap={6} />
                  <span>{p.mine && p.ticks.length === 1 ? 'Just you' : `${p.ticks.length} in`}</span>
                </p>
              )}
            </div>
            <button
              type="button"
              className={`pledge__tick${p.mine ? ' pledge__tick--on' : ''}`}
              aria-pressed={p.mine}
              aria-label={`${p.mine ? 'Drop' : 'Take'} the pledge: ${p.title}`}
              onClick={() => void impactStore.setPledge(tripId, p.id, !p.mine, me)}
            >
              {p.mine && <img src={iconCheck} alt="" width={14} height={14} />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The factors and sources behind every number, for anyone who asks "says who?" */
export function HowWeCount({ method }: { method: ImpactReport['method'] }) {
  const modes = Object.entries(method.factors)
  return (
    <details className="card method">
      <summary className="method__summary">
        <img src={iconUrl('info', 'primary')} alt="" width={18} height={18} />
        <span className="method__label">How we count</span>
        <img className="method__chevron" src={iconChevronDown} alt="" width={16} height={16} />
      </summary>
      <p className="method__text">
        Every number is an estimate. Rides are the straight line between stops plus a road factor, priced per vehicle (a squad fills as few as it can) using India’s own emission factors. Crowd-hours compare each visit with the site’s busiest hour. Rupees count as local when they reach a maker, cook, host, guide or driver.
      </p>
      <table className="method__table">
        <thead>
          <tr>
            <th scope="col">Mode</th>
            <th scope="col">kg CO₂e per vehicle-km</th>
            <th scope="col">Seats</th>
          </tr>
        </thead>
        <tbody>
          {modes.map(([mode, f]) => (
            <tr key={mode}>
              <th scope="row">{f.label}</th>
              <td>{f.kgPerVehicleKm === 0 ? '0' : f.kgPerVehicleKm.toFixed(3)}</td>
              <td>{f.seats === 1 && mode === 'walk' ? '–' : f.seats}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="method__sources">
        {method.sources.map((s) => (
          <li key={s.id}>
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </details>
  )
}
