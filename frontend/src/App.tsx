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
import { QuizFlow } from './pages/Quiz/QuizFlow'
import { parseQuizRoute } from './pages/Quiz/quizData'
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

  // Any onboarding or quiz screen can be opened directly via #/<step>; otherwise new users start at welcome
  const quizRoute = parseQuizRoute(route)
  const onboardingStep = isOnboardingStep(route) ? route : onboarded || quizRoute ? null : 'welcome'

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
              navigate('quiz')
            }}
          />
        ) : quizRoute ? (
          <QuizFlow route={quizRoute} go={navigate} onDone={() => navigate('')} />
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
