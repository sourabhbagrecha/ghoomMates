import { useState, type CSSProperties } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import iconArrowWhite from '../../assets/figma/icon-arrow-white.svg'
import iconCheckBold from '../../assets/figma/icon-check-white-bold.svg'
import iconWallet from '../../assets/figma/icon-wallet-yellow.svg'
import { Avatar } from '../../components/Avatar'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { SectionHeader } from '../../components/SectionHeader'
import { PEOPLE, type PersonId } from '../../data/people'
import { CONFIRMED, PLAN, PLANNED_SPEND, PLANNED_TOTAL, rupees, TRIP, UPI_REF } from './planData'
import { ProgressBar, StatusTag } from './PlanParts'
import type { PlanState } from './planState'
import './BudgetPage.css'

type BudgetPageProps = {
  plan: PlanState
  onBack: () => void
}

export function BudgetPage({ plan, onBack }: BudgetPageProps) {
  const [paying, setPaying] = useState(false)

  const pay = () => {
    setPaying(true)
    // TODO: open a UPI intent and wait for the payment callback instead of pretending
    window.setTimeout(() => {
      plan.payDeposit()
      setPaying(false)
    }, 1200)
  }

  return (
    <OnboardingLayout
      eyebrow={`${TRIP.group} · Budget`}
      title="Deposits & budget"
      onBack={onBack}
      headerBg={headerBg}
      headerHeight={170}
      bodyClassName="plan-page__body"
    >
      <section className="card budget-pool" aria-label="Deposit pool">
        <p className="overline">Deposit pool</p>
        <p className="budget-pool__value">
          {rupees(plan.pool)} <span>of {rupees(plan.poolTarget)}</span>
        </p>
        <ProgressBar value={plan.pool} max={plan.poolTarget} label="Deposit pool collected" />
        <p className="budget-pool__meta">
          {rupees(PLAN.depositPerPerson)} each · Due {PLAN.depositDue} · {plan.paidCount} of {TRIP.members.length} paid
        </p>
      </section>

      {plan.depositPaid ? (
        <section className="card budget-paid" role="status">
          <span className="budget-paid__icon">
            <img src={iconCheckBold} alt="" width={18} height={18} />
          </span>
          <span className="budget-paid__text">
            <span className="budget-paid__title">Deposit paid. You’re locked in!</span>
            <span className="budget-paid__meta">
              {rupees(PLAN.depositPerPerson)} via UPI · Ref {UPI_REF}
            </span>
          </span>
        </section>
      ) : (
        <button type="button" className="budget-pay" onClick={pay} disabled={paying} aria-busy={paying}>
          <span className="budget-pay__inner">
            <span className="budget-pay__icon">
              <img src={iconWallet} alt="" width={22} height={22} />
            </span>
            <span className="budget-pay__text">
              <span className="budget-pay__title">Pay deposit via UPI</span>
              <span className="budget-pay__subtitle" role="status">
                {paying ? 'Opening your UPI app…' : `${rupees(PLAN.depositPerPerson)} to the pool · Due ${PLAN.depositDue}`}
              </span>
            </span>
            <span className="budget-pay__arrow">
              <img src={iconArrowWhite} alt="" width={18} height={18} />
            </span>
          </span>
        </button>
      )}

      <SectionHeader title="Squad deposits" />
      <ul className="budget-members">
        {TRIP.members.map((person) => (
          <MemberDeposit key={person} person={person} plan={plan} />
        ))}
      </ul>

      <SectionHeader title="Planned spend" />
      <PlannedSpend />
    </OnboardingLayout>
  )
}

function MemberDeposit({ person, plan }: { person: PersonId; plan: PlanState }) {
  const paidOn = plan.deposits[person]
  const isYou = person === 'you'
  const reminded = plan.reminded.includes(person)
  const meta = paidOn
    ? `Paid ${paidOn} · UPI`
    : !CONFIRMED[person]
      ? 'Not confirmed yet'
      : isYou
        ? `Due ${PLAN.depositDue}`
        : `Pending · due ${PLAN.depositDue}`

  return (
    <li className="list-card budget-member">
      <Avatar person={person} size={34} />
      <span className="budget-member__info">
        <span className="budget-member__name">{PEOPLE[person].name}</span>
        <span className="budget-member__meta">{meta}</span>
      </span>
      {paidOn ? (
        <StatusTag tone="done">Paid</StatusTag>
      ) : isYou ? (
        <StatusTag tone="action">Due</StatusTag>
      ) : reminded ? (
        <StatusTag tone="waiting">Reminded</StatusTag>
      ) : (
        <button
          type="button"
          className="pill-button"
          onClick={() => plan.remind(person)}
          aria-label={`Remind ${PEOPLE[person].name}`}
        >
          Remind
        </button>
      )}
    </li>
  )
}

function PlannedSpend() {
  return (
    <section className="card budget-spend" aria-label="Planned spend">
      <p className="budget-spend__total">
        {rupees(PLANNED_TOTAL)} <span>· {rupees(Math.round(PLANNED_TOTAL / TRIP.members.length))} each</span>
      </p>
      <div className="budget-spend__bar" aria-hidden="true">
        {PLANNED_SPEND.map((c) => (
          <span key={c.id} style={{ flexGrow: c.amount, background: c.color }} />
        ))}
      </div>
      <ul className="budget-spend__list">
        {PLANNED_SPEND.map((c) => (
          <li key={c.id} className="budget-spend__item" style={{ '--swatch': c.color } as CSSProperties}>
            <span className="budget-spend__label">
              {c.label}
              <span>{c.detail}</span>
            </span>
            <span className="budget-spend__amount">
              {rupees(c.amount)}
              <span>{Math.round((c.amount / PLANNED_TOTAL) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
