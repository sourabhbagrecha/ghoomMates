import { useState } from 'react'
import headerBg from '../../assets/figma/expenses-header-bg.svg'
import iconBed from '../../assets/figma/icon-bed-primary.svg'
import iconCheck from '../../assets/figma/icon-check-success.svg'
import iconLock from '../../assets/figma/icon-lock-sky.svg'
import iconVote from '../../assets/figma/icon-vote-primary.svg'
import iconWallet from '../../assets/figma/icon-wallet-primary.svg'
import { Avatar, AvatarStack } from '../../components/Avatar'
import { GhoomMateAvatar, GhoomMateFab } from '../../components/GhoomMate'
import { ScreenBackContext } from '../../components/screenBack'
import { ScreenLayout } from '../../components/ScreenLayout'
import { SectionHeader } from '../../components/SectionHeader'
import { PEOPLE } from '../../data/people'
import { useEntryRoute, useNavigate } from '../../hooks/navigation'
import {
  bookingIcon,
  CONFIRMED,
  PLAN,
  PLAN_DAYS,
  PLANNED_SPEND,
  PLANNED_TOTAL,
  rupees,
  STAY_HOLD,
  TRIP,
  VOTES,
  type PlanStop,
} from './planData'
import { ProgressBar, StatusTag } from './PlanParts'
import type { PlanState } from './planState'
import './PlanOverviewPage.css'

const SQUAD_SIZE = TRIP.members.length

type PlanProps = { plan: PlanState }

export function PlanOverviewPage({ plan }: PlanProps) {
  const navigate = useNavigate()
  // Back to Home or Profile; arriving from the create-trip flow goes Home rather than into the draft
  const entry = useEntryRoute('plan')
  const backTo = entry.startsWith('create') ? '' : entry
  const link = (label: string, to: string) => (
    <button type="button" className="text-link" onClick={() => navigate(to)}>
      {label}
    </button>
  )

  return (
    <div className="plan-overview">
      <ScreenBackContext.Provider value={() => navigate(backTo)}>
        {/* No header actions: the trip name needs the full width next to the back button */}
        <ScreenLayout headerBg={headerBg} headerHeight={210} eyebrow={PLAN.eyebrow} title={TRIP.name} actions={false}>
          <div className="screen__header-row">
            <p className="plan-overview__briefing" role="status">
              <GhoomMateAvatar size={32} ring={2} />
              {briefing(plan)}
            </p>
          </div>

          <main className="screen__body">
            <NeedsYou plan={plan} />

            <SectionHeader title="Squad" action={link('Deposits', 'plan/budget')} />
            <SquadReadiness plan={plan} />

            <DraftPlan plan={plan} />

            <SectionHeader title="Bookings" action={link('See all', 'plan/bookings')} />
            <BookingsSummary plan={plan} />

            <SectionHeader title="Checklist" action={link('Open', 'plan/checklist')} />
            <ChecklistSummary plan={plan} />

            <SectionHeader title="Budget" action={link('Details', 'plan/budget')} />
            <BudgetSummary plan={plan} />
          </main>
        </ScreenLayout>
      </ScreenBackContext.Provider>
      <GhoomMateFab />
      <span className="home-indicator" aria-hidden="true" />
    </div>
  )
}

function briefing(plan: PlanState) {
  if (!plan.votes.stay) return 'It’s a three-way tie on the stay. Your vote decides it!'
  if (!plan.votes.day3) return 'Riya and Dev want Solang on Day 3. Cast your vote?'
  if (!plan.depositPaid) return `Votes are in! Pay your ${rupees(PLAN.depositPerPerson)} deposit to lock the trip.`
  return 'You’re all set. Nights hit −2°C up there, so start packing!'
}

function NeedsYou({ plan }: PlanProps) {
  const navigate = useNavigate()
  const items = [
    ...plan.openVotes.map((id) => ({
      id,
      icon: iconVote,
      title: VOTES[id].question,
      meta: `${plan.result(id).total} of ${SQUAD_SIZE} voted · Closes ${VOTES[id].closes}`,
      action: 'Vote',
      to: `plan/vote/${id}`,
    })),
    ...(plan.depositPaid
      ? []
      : [
          {
            id: 'deposit',
            icon: iconWallet,
            title: `Pay your ${rupees(PLAN.depositPerPerson)} deposit`,
            meta: `Due ${PLAN.depositDue} · ${plan.paidCount} of ${SQUAD_SIZE} paid`,
            action: 'Pay',
            to: 'plan/budget',
          },
        ]),
  ]

  return (
    <section className="card plan-needs" aria-labelledby="plan-needs-title">
      <div className="plan-needs__header">
        <h2 id="plan-needs-title" className="overline plan-needs__overline">
          Needs you
        </h2>
        {items.length > 0 && <span className="plan-needs__count">{items.length}</span>}
      </div>
      {items.length ? (
        <ul className="plan-needs__list">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" className="plan-needs__item" onClick={() => navigate(item.to)}>
                <span className="plan-icon-tile">
                  <img src={item.icon} alt="" width={20} height={20} />
                </span>
                <span className="plan-needs__text">
                  <span className="plan-needs__title">{item.title}</span>
                  <span className="plan-needs__meta">{item.meta}</span>
                </span>
                <span className="pill-button">{item.action}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="plan-needs__done">
          <img src={iconCheck} alt="" width={14} height={14} />
          You’re all caught up. Nice one!
        </p>
      )}
    </section>
  )
}

function SquadReadiness({ plan }: PlanProps) {
  const confirmed = TRIP.members.filter((p) => CONFIRMED[p]).length

  return (
    <section className="card plan-squad" aria-label="Squad readiness">
      <p className="plan-squad__summary">
        {confirmed} of {SQUAD_SIZE} confirmed · {plan.paidCount} of {SQUAD_SIZE} deposits in
      </p>
      <ul className="plan-squad__grid">
        {TRIP.members.map((person) => {
          const paid = !!plan.deposits[person]
          const [tone, label] = paid
            ? ['paid', 'Paid']
            : !CONFIRMED[person]
              ? ['maybe', 'Maybe']
              : person === 'you'
                ? ['due', 'To pay']
                : ['confirmed', 'Confirmed']
          return (
            <li key={person} className="plan-squad__member">
              <Avatar person={person} size={40} />
              <span className="plan-squad__name">{PEOPLE[person].name}</span>
              <span className={`plan-squad__status plan-squad__status--${tone}`}>
                {paid && <img src={iconCheck} alt="" width={12} height={12} />}
                {label}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function DraftPlan({ plan }: PlanProps) {
  const [dayId, setDayId] = useState(PLAN_DAYS[0].id)
  const day = PLAN_DAYS.find((d) => d.id === dayId) ?? PLAN_DAYS[0]

  return (
    <>
      <SectionHeader
        title="Draft plan"
        action={
          <div className="plan-days" role="group" aria-label="Choose a day">
            {PLAN_DAYS.map((d, i) => (
              <button
                key={d.id}
                type="button"
                className={`plan-days__day${d.id === dayId ? ' plan-days__day--active' : ''}`}
                aria-pressed={d.id === dayId}
                aria-label={`Day ${i + 1}, ${d.date}`}
                onClick={() => setDayId(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>
        }
      />
      <section className="card plan-day" aria-label={`${day.date}: ${day.title}`}>
        <p className="plan-day__heading">
          <span className="overline">{day.date}</span>
          <span className="plan-day__title">{day.title}</span>
        </p>
        <ol className="plan-day__stops">
          {day.stops.map((stop) => (
            <PlanStopRow key={stop.id} stop={stop} plan={plan} />
          ))}
        </ol>
      </section>
    </>
  )
}

function PlanStopRow({ stop, plan }: { stop: PlanStop; plan: PlanState }) {
  const navigate = useNavigate()

  if (stop.status !== 'vote') {
    return (
      <li className="plan-stop">
        <div className="plan-stop__row">
          <span className="plan-stop__time">{stop.time}</span>
          <span className="plan-stop__info">
            <span className="plan-stop__title">{stop.title}</span>
            {stop.status === 'locked' ? (
              <LockedIn label="Locked in" />
            ) : (
              <span className="plan-stop__status">
                <AvatarStack people={stop.keen} size={18} overlap={6} />
                {stop.keen.length}/{SQUAD_SIZE} keen
              </span>
            )}
          </span>
        </div>
      </li>
    )
  }

  const result = plan.result(stop.voteId)
  const youVoted = !!plan.votes[stop.voteId]
  const winner = result.complete ? result.leader : null
  const tied = result.complete && !result.leader
  const counts = result.options.map((o) => o.voters.length).join('–')

  return (
    <li className="plan-stop">
      <button type="button" className="plan-stop__row plan-stop__row--button" onClick={() => navigate(`plan/vote/${stop.voteId}`)}>
        <span className="plan-stop__time">{stop.time}</span>
        <span className="plan-stop__info">
          <span className="plan-stop__title">{winner ? stop.decidedTitle.replace('{winner}', winner.name) : stop.title}</span>
          {winner ? (
            <LockedIn label="Picked by vote" />
          ) : tied ? (
            <span className="plan-stop__status">Tied {counts} · settle it in the chat</span>
          ) : (
            <span className="plan-stop__status">
              <AvatarStack people={result.options.flatMap((o) => o.voters)} size={18} overlap={6} />
              {result.total}/{SQUAD_SIZE} voted · {counts}
            </span>
          )}
        </span>
        {!youVoted && <span className="pill-button">Vote</span>}
      </button>
    </li>
  )
}

function LockedIn({ label }: { label: string }) {
  return (
    <span className="plan-stop__status">
      <img src={iconLock} alt="" width={14} height={14} />
      {label}
    </span>
  )
}

function BookingsSummary({ plan }: PlanProps) {
  const stay = plan.result('stay')
  const stayPick = stay.complete ? stay.leader : null

  return (
    <section className="card plan-bookings" aria-label="Bookings">
      <ul className="plan-rows">
        <li className="plan-row">
          <span className="plan-icon-tile">
            <img src={iconBed} alt="" width={20} height={20} />
          </span>
          <span className="plan-row__text">
            <span className="plan-row__title">{stayPick ? stayPick.name : 'Stay'}</span>
            <span className="plan-row__meta">{stayPick ? STAY_HOLD.dates : `Vote closes ${VOTES.stay.closes}`}</span>
          </span>
          {stayPick ? <StatusTag tone="action">On hold</StatusTag> : <StatusTag tone="waiting">Vote first</StatusTag>}
        </li>
        {plan.bookings.map((b) => (
          <li key={b.id} className="plan-row">
            <span className="plan-icon-tile">
              <img src={bookingIcon(b.kind)} alt="" width={20} height={20} />
            </span>
            <span className="plan-row__text">
              <span className="plan-row__title">{b.title}</span>
              <span className="plan-row__meta">{b.summary}</span>
            </span>
            {b.status === 'booked' ? (
              <StatusTag tone="done">Booked</StatusTag>
            ) : (
              <StatusTag tone="waiting">To book</StatusTag>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function ChecklistSummary({ plan }: PlanProps) {
  const lists = [
    { id: 'group', label: 'Group to-dos', items: plan.checklists.group, unit: 'done' },
    { id: 'bag', label: 'My bag', items: plan.checklists.bag, unit: 'packed' },
  ]

  return (
    <section className="card plan-checklist-summary" aria-label="Checklist progress">
      {lists.map((list) => {
        const done = list.items.filter((i) => i.done).length
        return (
          <div key={list.id} className="plan-checklist-summary__row">
            <p className="plan-checklist-summary__label">
              {list.label}
              <span>
                {done} of {list.items.length} {list.unit}
              </span>
            </p>
            <ProgressBar value={done} max={list.items.length} label={list.label} />
          </div>
        )
      })}
    </section>
  )
}

function BudgetSummary({ plan }: PlanProps) {
  return (
    <section className="card plan-budget-summary" aria-label="Budget">
      <p className="overline">Deposit pool</p>
      <p className="plan-budget-summary__pool">
        {rupees(plan.pool)} <span>of {rupees(plan.poolTarget)}</span>
      </p>
      <ProgressBar value={plan.pool} max={plan.poolTarget} label="Deposit pool collected" />
      <div className="plan-budget-summary__split" aria-hidden="true">
        {PLANNED_SPEND.map((c) => (
          <span key={c.id} style={{ flexGrow: c.amount, background: c.color }} />
        ))}
      </div>
      <p className="plan-budget-summary__meta">
        {rupees(PLANNED_TOTAL)} planned · {rupees(PLAN.depositPerPerson)} each · Due {PLAN.depositDue}
      </p>
    </section>
  )
}
