import { useState, type ComponentType } from 'react'
import { GhoomMateFab } from './components/GhoomMate'
import { TabBar, type TabId } from './components/TabBar'
import { useHashRoute } from './hooks/useHashRoute'
import { ExpensesPage } from './pages/Expenses/ExpensesPage'
import { ExplorePage } from './pages/Explore/ExplorePage'
import { ItineraryPage } from './pages/Itinerary/ItineraryPage'
import { OnboardingFlow } from './pages/Onboarding/OnboardingFlow'
import { isOnboardingStep } from './pages/Onboarding/onboardingData'
import { PhotosPage } from './pages/Photos/PhotosPage'
import { hasOnboarded, markOnboarded } from './services/onboardingStorage'
import './App.css'

const PAGES: Record<TabId, ComponentType> = {
  itinerary: ItineraryPage,
  photos: PhotosPage,
  expenses: ExpensesPage,
  explore: ExplorePage,
}

function App() {
  const [route, navigate] = useHashRoute()
  const [onboarded, setOnboarded] = useState(hasOnboarded)
  const [tab, setTab] = useState<TabId>('itinerary')
  const Page = PAGES[tab]

  // Any onboarding screen can be opened directly via #/<step>; otherwise new users start at welcome
  const onboardingStep = isOnboardingStep(route) ? route : onboarded ? null : 'welcome'

  return (
    <div className="app">
      <div className="device">
        {onboardingStep ? (
          <OnboardingFlow
            step={onboardingStep}
            go={navigate}
            onDone={() => {
              markOnboarded()
              setOnboarded(true)
              navigate('')
            }}
          />
        ) : (
          <>
            <Page />
            <TabBar active={tab} onSelect={setTab} />
            <GhoomMateFab />
          </>
        )}
      </div>
    </div>
  )
}

export default App
