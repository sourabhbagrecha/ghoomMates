import { useEffect, useRef, useState } from 'react'
import headerBg from '../../assets/figma/expenses-header-bg.svg'
import iconArrowSky from '../../assets/figma/icon-arrow-sky.svg'
import iconCheck from '../../assets/figma/icon-check.svg'
import iconZap from '../../assets/figma/icon-zap.svg'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { PEOPLE } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import { DUES, INCOMING, NET_PAYMENT, UPI_APPS, type UpiAppId } from './tripDetailData'
import { formatINR, listNames } from './tripFormat'
import { tripActions, useTripStore } from './tripStore'
import './SettleUpPage.css'

export function SettleUpPage() {
  const navigate = useNavigate()
  const { settledVia } = useTripStore()
  const [app, setApp] = useState<UpiAppId>('gpay')
  const [paying, setPaying] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const appName = UPI_APPS.find((a) => a.id === app)?.name
  const payees = listNames(DUES.map((d) => PEOPLE[d.to].name))
  const payers = listNames(INCOMING.map((d) => PEOPLE[d.from].name))

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const pay = () => {
    setPaying(true)
    // TODO: hand off to the UPI intent / collect flow and wait for the callback
    timer.current = window.setTimeout(() => {
      tripActions.settle(app)
      navigate('trip/expenses/settle/done', { replace: true })
    }, 1200)
  }

  return (
    <OnboardingLayout
      eyebrow="Goa Gang · Expenses"
      title="Settle up"
      subtitle={`${DUES.length + INCOMING.length} dues → 1 smart payment`}
      onBack={() => navigate('trip/expenses')}
      headerBg={headerBg}
      headerHeight={210}
      bodyClassName="settle__body"
      actions={
        settledVia ? (
          <Button variant="primary" onClick={() => navigate('trip/expenses')}>
            All squared up · Back to expenses
          </Button>
        ) : (
          <Button variant="primary" disabled={paying} onClick={pay}>
            {paying ? `Opening ${appName}…` : `Pay ${formatINR(NET_PAYMENT)} via ${appName}`}
          </Button>
        )
      }
    >
      <section className="card settle__dues">
        <h2 className="overline">Your dues</h2>
        <ul>
          {DUES.map((d) => (
            <li key={d.id} className="settle__due">
              <span className="settle__pair">
                <Avatar person={d.from} size={34} />
                <img src={iconArrowSky} alt="" width={16} height={16} />
                <Avatar person={d.to} size={34} />
              </span>
              <span className="settle__due-text">
                <span className="settle__due-title">
                  {PEOPLE[d.from].name} → {PEOPLE[d.to].name}
                </span>
                <span className="settle__due-note">{settledVia ? 'Paid' : d.note}</span>
              </span>
              <span className="settle__due-amount">{d.amount}</span>
            </li>
          ))}
          {INCOMING.map((d) => (
            <li key={d.id} className="settle__due">
              <span className="settle__pair">
                <Avatar person={d.from} size={34} />
                <img src={iconArrowSky} alt="" width={16} height={16} />
                <Avatar person={d.to} size={34} />
              </span>
              <span className="settle__due-text">
                <span className="settle__due-title">
                  {PEOPLE[d.from].name} → {PEOPLE[d.to].name}
                </span>
                <span className="settle__due-note">Netted off your payment</span>
              </span>
              <span className="settle__due-amount settle__due-amount--incoming">{d.amount}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="settle__net">
        <span className="settle__net-icon">
          <img src={iconZap} alt="" width={22} height={22} />
        </span>
        <span className="settle__net-text">
          <span className="overline settle__net-overline">1 smart payment</span>
          <span className="settle__net-amount">{formatINR(NET_PAYMENT)}</span>
          <span className="settle__net-note">
            GhoomMate routes it so {payees} are paid in full, with {payers}’s {INCOMING.length > 1 ? 'shares' : 'share'} netted off.
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
              disabled={paying || !!settledVia}
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
    </OnboardingLayout>
  )
}
