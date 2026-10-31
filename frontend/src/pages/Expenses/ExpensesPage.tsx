import { Fragment, type CSSProperties } from 'react'
import headerBg from '../../assets/figma/expenses-header-bg.svg'
import iconArrowSky from '../../assets/figma/icon-arrow-sky.svg'
import iconArrowWhite from '../../assets/figma/icon-arrow-white.svg'
import iconPlus from '../../assets/figma/icon-plus.svg'
import iconZap from '../../assets/figma/icon-zap.svg'
import { Avatar } from '../../components/Avatar'
import { GhoomMateSays } from '../../components/GhoomMate'
import { ScreenLayout } from '../../components/ScreenLayout'
import { SectionHeader } from '../../components/SectionHeader'
import { EmptyState } from '../../components/states/EmptyState'
import { ErrorState } from '../../components/states/ErrorState'
import { Skeleton } from '../../components/states/Skeleton'
import { activeTrip, useActiveTrip } from '../../data/activeTrip'
import { personOf } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import type { Expense, TripSummary } from '../../services/tripsService'
import { formatINR } from '../Trip/tripFormat'
import { CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_PHOTOS, compactINR, myDues } from './expensesData'
import './ExpensesPage.css'

export function ExpensesPage() {
  const navigate = useNavigate()
  const { trip, summary, expenses, error } = useActiveTrip()
  const dues = summary ? myDues(summary) : null

  const balances = [
    { id: 'owe', label: 'You owe', value: dues ? formatINR(dues.oweTotal) : '…', highlight: false },
    { id: 'owed', label: 'You’re owed', value: dues ? formatINR(dues.owedTotal) : '…', highlight: true },
    { id: 'total', label: 'Trip total', value: summary ? compactINR(summary.totalSpentPaise / 100) : '…', highlight: false },
  ]

  let cta = null
  if (dues && dues.owe.length > 0) {
    cta = { title: 'Settle all in 1 UPI tap', subtitle: `${dues.owe.length} ${dues.owe.length === 1 ? 'due' : 'dues'} → 1 smart payment · ${formatINR(dues.oweTotal)} net` }
  } else if (dues && dues.owed.length > 0) {
    cta = { title: 'Mark payments received', subtitle: `${dues.owed.length} ${dues.owed.length === 1 ? 'mate owes' : 'mates owe'} you ${formatINR(dues.owedTotal)}` }
  }

  return (
    <>
      <ScreenLayout
        headerBg={headerBg}
        headerHeight={210}
        eyebrow={`${trip?.groupName ?? 'Your trip'} · Expenses`}
        title="Split & Settle"
        withBubble
      >
        <div className="screen__header-row balances">
          {balances.map((b) => (
            <div key={b.id} className="balance">
              <span className="balance__label">{b.label}</span>
              <span className={`balance__value${b.highlight ? ' balance__value--highlight' : ''}`}>{b.value}</span>
            </div>
          ))}
        </div>

        <main className="screen__body">
          {error && !summary ? (
            <ErrorState text={error} onRetry={() => void activeTrip.refreshMoney()} />
          ) : !summary || !expenses ? (
            <div aria-busy="true" aria-label="Loading expenses">
              <Skeleton variant="card" height={180} />
            </div>
          ) : (
            <>
              {cta && (
                <button type="button" className="settle-cta" onClick={() => navigate('trip/expenses/settle')}>
                  <span className="settle-cta__inner">
                    <span className="settle-cta__icon">
                      <img src={iconZap} alt="" width={22} height={22} />
                    </span>
                    <span className="settle-cta__text">
                      <span className="settle-cta__title">{cta.title}</span>
                      <span className="settle-cta__subtitle">{cta.subtitle}</span>
                    </span>
                    <span className="settle-cta__arrow">
                      <img src={iconArrowWhite} alt="" width={18} height={18} />
                    </span>
                  </span>
                </button>
              )}

              {summary.expenseCount > 0 && <SettleUpCard summary={summary} />}

              <SectionHeader
                title="Recent spends"
                action={
                  <button type="button" className="pill-button" onClick={() => navigate('trip/expenses/add')}>
                    <img src={iconPlus} alt="" width={14} height={14} />
                    Add
                  </button>
                }
              />
              {expenses.length > 0 ? (
                <ul className="expense-list">
                  {expenses.map((e) => (
                    <ExpenseRow key={e.id} expense={e} />
                  ))}
                </ul>
              ) : (
                <EmptyState
                  size="compact"
                  headingLevel={3}
                  title="No spends yet"
                  text="Add the first one and I’ll split it across the squad."
                  action={{ label: 'Add expense', icon: iconPlus, onClick: () => navigate('trip/expenses/add') }}
                />
              )}
            </>
          )}
        </main>
      </ScreenLayout>
      <GhoomMateSays>Just say “I paid 800 for the cab” and I’ll split it!</GhoomMateSays>
    </>
  )
}

function ExpenseRow({ expense: e }: { expense: Expense }) {
  const payer = personOf(e.payerMemberId).name
  const ways = e.shares.filter((s) => s.amountPaise > 0).length
  return (
    <li className="list-card expense">
      <img className="expense__photo" src={e.receiptUrl ?? CATEGORY_PHOTOS[e.category]} alt="" width={42} height={42} />
      <div className="expense__info">
        <p className="expense__title">{e.description}</p>
        <p className="expense__detail">
          {payer} paid · {ways === 1 ? 'for 1' : `split ${ways} ways`} · {CATEGORY_LABELS[e.category]}
        </p>
      </div>
      <span className="expense__amount">{formatINR(e.amountPaise / 100)}</span>
    </li>
  )
}

function SettleUpCard({ summary }: { summary: TripSummary }) {
  const saved = Math.max(0, summary.naiveTransferCount - summary.transfers.length)
  const total = summary.totalSpentPaise || 1
  return (
    <section className="card settle-up">
      <div className="settle-up__header">
        <p className="overline">Smart settle-up</p>
        {saved > 0 && <p className="settle-up__saved">Saved {saved} {saved === 1 ? 'transfer' : 'transfers'}</p>}
      </div>
      {summary.transfers.length === 0 && <p className="settlement__note">Everyone’s squared up. Nice.</p>}
      {summary.transfers.map((t, i) => {
        const incoming = t.toMemberId === summary.memberId
        const mine = incoming || t.fromMemberId === summary.memberId
        return (
          <Fragment key={`${t.fromMemberId}-${t.toMemberId}`}>
            {i > 0 && <hr className="settle-up__divider" />}
            <div className="settlement">
              <div className="settlement__people">
                <Avatar person={t.fromMemberId} size={34} />
                <img src={iconArrowSky} alt="" width={16} height={16} />
                <Avatar person={t.toMemberId} size={34} />
              </div>
              <div className="settlement__info">
                <p className="settlement__title">
                  {personOf(t.fromMemberId).name} → {personOf(t.toMemberId).name}
                </p>
                <p className="settlement__note">{mine ? 'Auto-simplified' : 'Between mates'}</p>
              </div>
              <span className={`settlement__amount${incoming ? ' settlement__amount--incoming' : ''}`}>
                {incoming ? '+' : ''}
                {formatINR(t.amountPaise / 100)}
              </span>
            </div>
          </Fragment>
        )
      })}
      <div className="category-split">
        <div className="category-split__bar" aria-hidden="true">
          {summary.categories.map((c) => (
            <span key={c.category} style={{ flexGrow: c.amountPaise, background: CATEGORY_COLORS[c.category] }} />
          ))}
        </div>
        <ul className="category-split__legend">
          {summary.categories.map((c) => (
            <li key={c.category} style={{ '--swatch': CATEGORY_COLORS[c.category] } as CSSProperties}>
              {CATEGORY_LABELS[c.category]} {Math.round((c.amountPaise / total) * 100)}%
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
