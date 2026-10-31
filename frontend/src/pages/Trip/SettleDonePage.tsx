import iconCheckBig from '../../assets/figma/icon-check-big-primary.svg'
import iconCheck from '../../assets/figma/icon-check-success.svg'
import { Button } from '../../components/Button'
import { TopSafeArea } from '../../components/TopSafeArea'
import { personOf } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import { formatINR } from './tripFormat'
import { lastSettlement } from './settleResult'
import './SettleDonePage.css'

export function SettleDonePage() {
  const navigate = useNavigate()
  const result = lastSettlement()
  const transfers = result?.transfers ?? []
  const total = transfers.reduce((sum, t) => sum + t.amountPaise, 0) / 100

  return (
    <div className="settle-done">
      <TopSafeArea />
      <main className="settle-done__body">
        <div className="settle-done__hero">
          <span className="settle-done__check">
            <img src={iconCheckBig} alt="" width={44} height={44} />
          </span>
          <p className="settle-done__eyebrow">Payment recorded</p>
          <h1 className="settle-done__amount">{formatINR(total)}</h1>
          <p className="settle-done__via">via {result?.via ?? 'UPI'} · You’re all squared up</p>
        </div>

        {transfers.length > 0 && (
          <ul className="card settle-done__summary">
            {transfers.map((t) => (
              <li key={t.toMemberId}>
                <img src={iconCheck} alt="" width={14} height={14} />
                <span>{personOf(t.toMemberId).name} settled</span>
                <span className="settle-done__value">{formatINR(t.amountPaise / 100)}</span>
              </li>
            ))}
          </ul>
        )}
      </main>
      <footer className="settle-done__actions">
        <Button variant="highlight" onClick={() => navigate('trip/expenses')}>
          Back to expenses
        </Button>
        <span className="home-indicator home-indicator--light" aria-hidden="true" />
      </footer>
    </div>
  )
}
