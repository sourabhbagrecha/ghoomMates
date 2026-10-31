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
import { PEOPLE } from '../../data/people'
import { useNavigate } from '../../hooks/navigation'
import { BALANCES, CATEGORIES, EXPENSES, SETTLE_ALL, SETTLEMENTS, TRANSFERS_SAVED } from './expensesData'
import './ExpensesPage.css'

export function ExpensesPage() {
  const navigate = useNavigate()

  return (
    <>
      <ScreenLayout headerBg={headerBg} headerHeight={210} eyebrow="Goa Gang · Expenses" title="Split & Settle" withBubble>
        <div className="screen__header-row balances">
          {BALANCES.map((b) => (
            <div key={b.id} className="balance">
              <span className="balance__label">{b.label}</span>
              <span className={`balance__value${b.highlight ? ' balance__value--highlight' : ''}`}>{b.value}</span>
            </div>
          ))}
        </div>

        <main className="screen__body">
          <button type="button" className="settle-cta" onClick={() => navigate('trip/expenses/settle')}>
            <span className="settle-cta__inner">
              <span className="settle-cta__icon">
                <img src={iconZap} alt="" width={22} height={22} />
              </span>
              <span className="settle-cta__text">
                <span className="settle-cta__title">Settle all in 1 UPI tap</span>
                <span className="settle-cta__subtitle">
                  {SETTLE_ALL.dues} dues → 1 smart payment · {SETTLE_ALL.net} net
                </span>
              </span>
              <span className="settle-cta__arrow">
                <img src={iconArrowWhite} alt="" width={18} height={18} />
              </span>
            </span>
          </button>

          <SettleUpCard />

          <SectionHeader
            title="Recent spends"
            action={
              <button type="button" className="pill-button" onClick={() => navigate('trip/expenses/add')}>
                <img src={iconPlus} alt="" width={14} height={14} />
                Add
              </button>
            }
          />
          <ul className="expense-list">
            {EXPENSES.map((e) => (
              <li key={e.id} className="list-card expense">
                <img className="expense__photo" src={e.photo} alt="" width={42} height={42} />
                <div className="expense__info">
                  <p className="expense__title">{e.title}</p>
                  <p className="expense__detail">{e.detail}</p>
                </div>
                <span className="expense__amount">{e.amount}</span>
              </li>
            ))}
          </ul>
        </main>
      </ScreenLayout>
      <GhoomMateSays>Just say “I paid 800 for the cab” and I’ll split it!</GhoomMateSays>
    </>
  )
}

function SettleUpCard() {
  return (
    <section className="card settle-up">
      <div className="settle-up__header">
        <p className="overline">Smart settle-up</p>
        <p className="settle-up__saved">Saved {TRANSFERS_SAVED} transfers</p>
      </div>
      {SETTLEMENTS.map((s, i) => (
        <Fragment key={s.id}>
          {i > 0 && <hr className="settle-up__divider" />}
          <div className="settlement">
            <div className="settlement__people">
              <Avatar person={s.from} size={34} />
              <img src={iconArrowSky} alt="" width={16} height={16} />
              <Avatar person={s.to} size={34} />
            </div>
            <div className="settlement__info">
              <p className="settlement__title">
                {PEOPLE[s.from].name} → {PEOPLE[s.to].name}
              </p>
              <p className="settlement__note">{s.note}</p>
            </div>
            <span className={`settlement__amount${s.incoming ? ' settlement__amount--incoming' : ''}`}>{s.amount}</span>
          </div>
        </Fragment>
      ))}
      <div className="category-split">
        <div className="category-split__bar" aria-hidden="true">
          {CATEGORIES.map((c) => (
            <span key={c.id} style={{ flexGrow: c.percent, background: c.color }} />
          ))}
        </div>
        <ul className="category-split__legend">
          {CATEGORIES.map((c) => (
            <li key={c.id} style={{ '--swatch': c.color } as CSSProperties}>
              {c.label} {c.percent}%
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
