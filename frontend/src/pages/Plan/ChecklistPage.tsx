import { useState } from 'react'
import headerBg from '../../assets/figma/explore-header-bg.svg'
import iconCheck from '../../assets/figma/icon-check.svg'
import iconPlus from '../../assets/figma/icon-plus.svg'
import { Avatar } from '../../components/Avatar'
import { GhoomMateTip } from '../../components/GhoomMate'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import { PEOPLE } from '../../data/people'
import { TRIP } from './planData'
import { ProgressBar } from './PlanParts'
import type { ChecklistId, PlanState } from './planState'
import './ChecklistPage.css'

const TABS: { id: ChecklistId; label: string; unit: string; placeholder: string; note: string }[] = [
  {
    id: 'group',
    label: 'Group',
    unit: 'done',
    placeholder: 'Add a group to-do…',
    note: 'Anyone in the squad can tick these off',
  },
  { id: 'bag', label: 'My bag', unit: 'packed', placeholder: 'Add to my bag…', note: 'Only you can see this list' },
]

type ChecklistPageProps = {
  plan: PlanState
  onBack: () => void
}

export function ChecklistPage({ plan, onBack }: ChecklistPageProps) {
  const [tabId, setTabId] = useState<ChecklistId>('group')
  const [draft, setDraft] = useState('')
  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0]
  const items = plan.checklists[tabId]
  const done = items.filter((i) => i.done).length

  const add = () => {
    const label = draft.trim()
    if (!label) return
    // TODO: sync group to-dos with the squad
    plan.addItem(tabId, label)
    setDraft('')
  }

  return (
    <OnboardingLayout
      eyebrow={`${TRIP.name} · Packing`}
      title="Checklist"
      onBack={onBack}
      headerBg={headerBg}
      headerHeight={170}
      bodyClassName="plan-page__body"
      actions={
        <form
          className="checklist-add"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <input
            className="checklist-add__input"
            aria-label={tab.placeholder.replace('…', '')}
            placeholder={tab.placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="checklist-add__button" disabled={!draft.trim()} aria-label="Add item">
            <img src={iconPlus} alt="" width={16} height={16} />
          </button>
        </form>
      }
    >
      <div className="checklist-tabs" role="tablist" aria-label="Checklist">
        {TABS.map((t) => {
          const list = plan.checklists[t.id]
          const selected = t.id === tabId
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`checklist-tab-${t.id}`}
              aria-selected={selected}
              aria-controls="checklist-panel"
              className={`checklist-tabs__tab${selected ? ' checklist-tabs__tab--active' : ''}`}
              onClick={() => setTabId(t.id)}
            >
              {t.label}
              <span className="checklist-tabs__count">
                {list.filter((i) => i.done).length}/{list.length}
              </span>
            </button>
          )
        })}
      </div>

      <section
        id="checklist-panel"
        className="checklist-panel"
        role="tabpanel"
        aria-labelledby={`checklist-tab-${tabId}`}
      >
        <div className="card checklist-progress">
          <p className="checklist-progress__label">
            {done} of {items.length} {tab.unit}
            <span>{items.length ? Math.round((done / items.length) * 100) : 0}%</span>
          </p>
          <ProgressBar value={done} max={items.length} label={`${tab.label} progress`} />
          <p className="checklist-progress__note">{tab.note}</p>
        </div>

        {tabId === 'bag' && <GhoomMateTip>Nights dip to −2°C in December. Pack an extra thermal layer!</GhoomMateTip>}

        <ul className="checklist-items">
          {items.map((item) => (
            <li key={item.id} className={`list-card checklist-item${item.done ? ' checklist-item--done' : ''}`}>
              <label className="checklist-item__main">
                <input
                  type="checkbox"
                  className="plan-checkbox"
                  checked={item.done}
                  onChange={() => plan.toggleItem(tabId, item.id)}
                />
                <span className="plan-checkbox__box" aria-hidden="true">
                  <img src={iconCheck} alt="" width={12} height={12} />
                </span>
                <span className="checklist-item__text">
                  <span className="checklist-item__label">{item.label}</span>
                  {item.assignee && (
                    <span className="checklist-item__meta">
                      {PEOPLE[item.assignee].name} · {item.done ? 'Done' : 'To do'}
                    </span>
                  )}
                </span>
              </label>
              {item.assignee && <Avatar person={item.assignee} size={26} />}
            </li>
          ))}
        </ul>
      </section>
    </OnboardingLayout>
  )
}
