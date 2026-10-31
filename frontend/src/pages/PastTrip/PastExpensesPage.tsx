import { useEffect, useRef, useState, type CSSProperties } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import iconArrow from '../../assets/figma/icon-arrow-sky.svg'
import iconCheck from '../../assets/figma/icon-check-success.svg'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { SectionHeader } from '../../components/SectionHeader'
import { PEOPLE } from '../../data/people'
import { pastTripActions, usePastTrips } from '../../data/pastTripStore'
import { useNavigate } from '../../hooks/navigation'
import { formatINR } from '../Trip/tripFormat'
import { CATEGORY_COLOURS, type Category, type PastTripDetails } from './pastTripData'
import './PastExpensesPage.css'

const CATEGORIES = Object.keys(CATEGORY_COLOURS) as Category[]

/** Final tally of a finished trip, plus paying off whatever's still owed. */
export function PastExpensesPage({ details }: { details: PastTripDetails }) {
  const navigate = useNavigate()
  const { settled } = usePastTrips()
  const [paying, setPaying] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const { trip } = details
  const total = details.expenses.reduce((sum, e) => sum + e.amount, 0)
  const owed = settled.has(trip.id) ? [] : details.balances.filter((b) => b.from === 'you')
  const owedTotal = owed.reduce((sum, b) => sum + b.amount, 0)
  const byCategory = CATEGORIES.map((c) => ({
    category: c,
    amount: details.expenses.filter((e) => e.category === c).reduce((sum, e) => sum + e.amount, 0),
  })).filter((c) => c.amount > 0)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const pay = () => {
    // TODO: hand off to the UPI app and confirm the payment
    setPaying(true)
    timer.current = window.setTimeout(() => {
      pastTripActions.settle(trip.id)
      setPaying(false)
    }, 1200)
  }

  return (
    <OnboardingLayout
      eyebrow={`${trip.name} · Expenses`}
      title="Final tally"
      onBack={() => navigate(`past/${trip.id}`)}
      headerBg={headerBg}
      headerHeight={170}
      bodyClassName="past-expenses__body"
      actions={
        owed.length > 0 && (
          <Button variant="primary" disabled={paying} onClick={pay}>
            {paying ? 'Opening your UPI app…' : `Pay ${formatINR(owedTotal)} via UPI`}
          </Button>
        )
      }
    >
      <section className="card past-expenses__total">
        <p className="overline">Trip total</p>
        <p className="past-expenses__amount">{formatINR(total)}</p>
        <p className="past-expenses__per-person">
          {formatINR(total / trip.members.length)} per person · {trip.members.length} mates
        </p>
        <div className="past-expenses__bar" aria-hidden="true">
          {byCategory.map((c) => (
            <span key={c.category} style={{ flexGrow: c.amount, background: CATEGORY_COLOURS[c.category] }} />
          ))}
        </div>
        <ul className="past-expenses__legend">
          {byCategory.map((c) => (
            <li key={c.category} style={{ '--swatch': CATEGORY_COLOURS[c.category] } as CSSProperties}>
              {c.category} {Math.round((c.amount / total) * 100)}%
            </li>
          ))}
        </ul>
      </section>

      {owed.length > 0 ? (
        <section className="card past-expenses__owed">
          <p className="overline">Still to settle</p>
          {owed.map((b) => (
            <div key={b.to} className="past-expenses__balance">
              <span className="past-expenses__people">
                <Avatar person={b.from} size={34} />
                <img src={iconArrow} alt="" width={16} height={16} />
                <Avatar person={b.to} size={34} />
              </span>
              <span className="past-expenses__balance-text">
                <strong>You → {PEOPLE[b.to].name}</strong>
                <span>Left over after the last split</span>
              </span>
              <span className="past-expenses__balance-amount">{formatINR(b.amount)}</span>
            </div>
          ))}
        </section>
      ) : (
        <p className="list-card past-expenses__square">
          <img src={iconCheck} alt="" width={14} height={14} />
          Everyone’s square. Nothing left to settle.
        </p>
      )}

      <SectionHeader title="Every spend" />
      <ul className="past-expenses__list">
        {details.expenses.map((e) => (
          <li key={e.title} className="list-card past-expenses__item">
            <span className="past-expenses__item-text">
              <strong>{e.title}</strong>
              <span>
                {PEOPLE[e.paidBy].name} paid · {e.category}
              </span>
            </span>
            <span className="past-expenses__item-amount">{formatINR(e.amount)}</span>
          </li>
        ))}
      </ul>
    </OnboardingLayout>
  )
}
