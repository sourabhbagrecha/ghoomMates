import type { ReactNode } from 'react'
import expenses from '../assets/figma/tab-expenses.svg'
import expensesActive from '../assets/figma/tab-expenses-active.svg'
import explore from '../assets/figma/tab-explore.svg'
import exploreActive from '../assets/figma/tab-explore-active.svg'
import itinerary from '../assets/figma/tab-itinerary.svg'
import itineraryActive from '../assets/figma/tab-itinerary-active.svg'
import photos from '../assets/figma/tab-photos.svg'
import photosActive from '../assets/figma/tab-photos-active.svg'
import './TabBar.css'

export type TabId = 'itinerary' | 'photos' | 'expenses' | 'explore'

const TABS: { id: TabId; label: string; icon: string; activeIcon: string }[] = [
  { id: 'itinerary', label: 'Itinerary', icon: itinerary, activeIcon: itineraryActive },
  { id: 'photos', label: 'Photos', icon: photos, activeIcon: photosActive },
  { id: 'expenses', label: 'Expenses', icon: expenses, activeIcon: expensesActive },
  { id: 'explore', label: 'Explore', icon: explore, activeIcon: exploreActive },
]

type TabBarProps = {
  active: TabId
  onSelect?: (tab: TabId) => void
  /** Sits in its own pill at the right end of the bar (the GhoomMate button) */
  trailing?: ReactNode
}

export function TabBar({ active, onSelect, trailing }: TabBarProps) {
  return (
    <nav className="tab-bar">
      <div className="tab-bar__row">
        <div className="tab-bar__dock">
          {TABS.map((tab) => {
            const isActive = tab.id === active
            return (
              <button
                key={tab.id}
                type="button"
                className={`tab-bar__tab${isActive ? ' tab-bar__tab--active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                aria-label={tab.label}
                onClick={() => onSelect?.(tab.id)}
              >
                <span className="tab-bar__pill">
                  <img src={isActive ? tab.activeIcon : tab.icon} alt="" width={22} height={22} />
                  {/* Only the active tab shows its name; the others are icon-only to save room */}
                  <span className="tab-bar__label" aria-hidden>
                    {tab.label}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        {trailing}
      </div>
      <span className="tab-bar__home-indicator" />
    </nav>
  )
}
