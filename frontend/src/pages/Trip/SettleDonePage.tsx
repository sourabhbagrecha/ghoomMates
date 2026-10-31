import iconCheckBig from '../../assets/figma/icon-check-big-primary.svg'
import iconCheck from '../../assets/figma/icon-check-success.svg'
import { Button } from '../../components/Button'
import { StatusBar } from '../../components/StatusBar'
import { PEOPLE } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import { DUES, INCOMING, NET_PAYMENT, UPI_APPS } from './tripDetailData'
import { formatINR } from './tripFormat'
import { useTripStore } from './tripStore'
import './SettleDonePage.css'

export function SettleDonePage() {
  const navigate = useNavigate()
  const { settledVia } = useTripStore()
  const appName = UPI_APPS.find((a) => a.id === settledVia)?.name ?? 'UPI'

  return (
    <div className="settle-done">
      <StatusBar />
      <main className="settle-done__body">
        <div className="settle-done__hero">
          <span className="settle-done__check">
            <img src={iconCheckBig} alt="" width={44} height={44} />
          </span>
          <p className="settle-done__eyebrow">Payment sent</p>
          <h1 className="settle-done__amount">{formatINR(NET_PAYMENT)}</h1>
          <p className="settle-done__via">via {appName} · You’re all squared up</p>
        </div>

        <ul className="card settle-done__summary">
          {DUES.map((d) => (
            <li key={d.id}>
              <img src={iconCheck} alt="" width={14} height={14} />
              <span>{PEOPLE[d.to].name} settled</span>
              <span className="settle-done__value">{d.amount}</span>
            </li>
          ))}
          {INCOMING.map((d) => (
            <li key={d.id}>
              <img src={iconCheck} alt="" width={14} height={14} />
              <span>{PEOPLE[d.from].name}’s share netted off</span>
              <span className="settle-done__value settle-done__value--incoming">{d.amount}</span>
            </li>
          ))}
        </ul>
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
