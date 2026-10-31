import { useState } from 'react'
import headerBg from '../../assets/figma/expenses-header-bg.svg'
import iconArrowSky from '../../assets/figma/icon-arrow-sky.svg'
import iconCheck from '../../assets/figma/icon-check.svg'
import iconZap from '../../assets/figma/icon-zap.svg'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { activeTrip, useActiveTrip } from '../../data/activeTrip'
import { personOf } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import { tripsApi, type Transfer } from '../../services/tripsService'
import { myDues } from '../Expenses/expensesData'
import { UPI_APPS, type UpiAppId } from './tripDetailData'
import { formatINR, listNames } from './tripFormat'
import { recordSettlement } from './settleResult'
import './SettleUpPage.css'

const transferKey = (t: Transfer) => `${t.fromMemberId}-${t.toMemberId}`

/**
 * Pays your suggested transfers in one go, or marks money owed to you as received.
 * Payments are recorded as manually confirmed settlements (no UPI provider integration yet).
 */
export function SettleUpPage() {
  const navigate = useNavigate()
  const { trip, summary } = useActiveTrip()
  const [app, setApp] = useState<UpiAppId>('gpay')
  const [paying, setPaying] = useState(false)
  const [received, setReceived] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // One key per transfer and screen visit, so a double tap or retry never records a payment twice
  const [keys] = useState(() => new Map<string, string>())
  const keyFor = (t: Transfer) => {
    const k = transferKey(t)
    if (!keys.has(k)) keys.set(k, crypto.randomUUID())
    return keys.get(k)!
  }

  const appName = UPI_APPS.find((a) => a.id === app)?.name ?? 'UPI'
  const dues = summary ? myDues(summary) : null
  const owe = dues?.owe ?? []
  const owed = (dues?.owed ?? []).filter((t) => !received.has(transferKey(t)))
  const back = () => navigate('trip/expenses')

  const pay = async () => {
    if (!trip || !owe.length) return
    setPaying(true)
    setError(null)
    try {
      for (const t of owe) await tripsApi.settle(trip.id, { ...t, note: `Paid via ${appName}` }, keyFor(t))
      recordSettlement({ via: appName, transfers: owe })
      void activeTrip.refreshMoney()
      navigate('trip/expenses/settle/done', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment could not be recorded')
      setPaying(false)
      void activeTrip.refreshMoney()
    }
  }

  const markReceived = async (t: Transfer) => {
    if (!trip) return
    setBusy(transferKey(t))
    setError(null)
    try {
      await tripsApi.settle(trip.id, { ...t, note: 'Marked received' }, keyFor(t))
      setReceived((prev) => new Set(prev).add(transferKey(t)))
      void activeTrip.refreshMoney()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark it received')
    } finally {
      setBusy(null)
    }
  }

  const total = owe.reduce((sum, t) => sum + t.amountPaise, 0) / 100
  const settled = summary !== null && owe.length === 0 && owed.length === 0

  return (
    <OnboardingLayout
      eyebrow={`${trip?.groupName ?? 'Trip'} · Expenses`}
      title="Settle up"
      subtitle={owe.length ? `${owe.length} ${owe.length === 1 ? 'due' : 'dues'} → 1 smart payment` : owed.length ? 'Money coming your way' : undefined}
      onBack={back}
      headerBg={headerBg}
      headerHeight={210}
      bodyClassName="settle__body"
      actions={
        owe.length ? (
          <Button variant="primary" disabled={paying} onClick={pay}>
            {paying ? `Recording ${appName} payment…` : `Pay ${formatINR(total)} via ${appName}`}
          </Button>
        ) : (
          <Button variant="primary" onClick={back}>
            {settled ? 'All squared up · Back to expenses' : 'Back to expenses'}
          </Button>
        )
      }
    >
      {owe.length > 0 && (
        <section className="card settle__dues">
          <h2 className="overline">Your dues</h2>
          <ul>
            {owe.map((t) => (
              <li key={transferKey(t)} className="settle__due">
                <span className="settle__pair">
                  <Avatar person={t.fromMemberId} size={34} />
                  <img src={iconArrowSky} alt="" width={16} height={16} />
                  <Avatar person={t.toMemberId} size={34} />
                </span>
                <span className="settle__due-text">
                  <span className="settle__due-title">
                    {personOf(t.fromMemberId).name} → {personOf(t.toMemberId).name}
                  </span>
                  <span className="settle__due-note">Auto-simplified</span>
                </span>
                <span className="settle__due-amount">{formatINR(t.amountPaise / 100)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {owed.length > 0 && (
        <section className="card settle__dues">
          <h2 className="overline">Owed to you</h2>
          <ul>
            {owed.map((t) => (
              <li key={transferKey(t)} className="settle__due">
                <span className="settle__pair">
                  <Avatar person={t.fromMemberId} size={34} />
                  <img src={iconArrowSky} alt="" width={16} height={16} />
                  <Avatar person={t.toMemberId} size={34} />
                </span>
                <span className="settle__due-text">
                  <span className="settle__due-title">
                    {personOf(t.fromMemberId).name} → You · {formatINR(t.amountPaise / 100)}
                  </span>
                  <span className="settle__due-note">Got it in cash or UPI? Mark it received.</span>
                </span>
                <button type="button" className="pill-button" disabled={busy !== null} onClick={() => void markReceived(t)}>
                  {busy === transferKey(t) ? 'Saving…' : 'Received'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {settled && (
        <section className="settle__net">
          <span className="settle__net-icon">
            <img src={iconCheck} alt="" width={22} height={22} />
          </span>
          <span className="settle__net-text">
            <span className="overline settle__net-overline">All squared up</span>
            <span className="settle__net-note">Nothing to pay or collect right now.</span>
          </span>
        </section>
      )}

      {owe.length > 0 && (
        <>
          <section className="settle__net">
            <span className="settle__net-icon">
              <img src={iconZap} alt="" width={22} height={22} />
            </span>
            <span className="settle__net-text">
              <span className="overline settle__net-overline">1 smart payment</span>
              <span className="settle__net-amount">{formatINR(total)}</span>
              <span className="settle__net-note">
                GhoomMate simplified the squad’s spends so you only pay {listNames(owe.map((t) => personOf(t.toMemberId).name))}.
              </span>
            </span>
          </section>

          <section className="settle__apps-section">
            <h2 className="settle__label">Pay with</h2>
            <div className="settle__apps" role="group" aria-label="UPI app">
              {UPI_APPS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`settle__app${a.id === app ? ' settle__app--selected' : ''}`}
                  aria-pressed={a.id === app}
                  disabled={paying}
                  onClick={() => setApp(a.id)}
                >
                  <span className="settle__app-tile">
                    {a.initial}
                    {a.id === app && (
                      <span className="settle__app-check">
                        <img src={iconCheck} alt="" width={10} height={10} />
                      </span>
                    )}
                  </span>
                  <span className="settle__app-name">{a.name}</span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {error && (
        <p className="settle__error" role="alert">
          {error}
        </p>
      )}
    </OnboardingLayout>
  )
}
