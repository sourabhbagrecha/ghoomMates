import { useState, type ComponentType } from 'react'
import { GhoomMateFab } from './components/GhoomMate'
import { ScreenBackContext } from './components/screenBack'
import { TabBar, type TabId } from './components/TabBar'
import { NOTIFICATIONS } from './data/notifications'
import { NavigateContext } from './hooks/navigation'
import { useHashRoute } from './hooks/useHashRoute'
import { CreateTripRoutes } from './pages/CreateTrip/CreateTripRoutes'
import { ExpensesPage } from './pages/Expenses/ExpensesPage'
import { ExplorePage } from './pages/Explore/ExplorePage'
import { HomePage } from './pages/Home/HomePage'
import { ItineraryPage } from './pages/Itinerary/ItineraryPage'
import { NotificationsPage } from './pages/Notifications/NotificationsPage'
import { OnboardingFlow } from './pages/Onboarding/OnboardingFlow'
import { isOnboardingStep } from './pages/Onboarding/onboardingData'
import { PhotosPage } from './pages/Photos/PhotosPage'
import { PlanRoutes } from './pages/Plan/PlanRoutes'
import { QuizFlow } from './pages/Quiz/QuizFlow'
import { parseQuizRoute } from './pages/Quiz/quizData'
import { TripDetailRoutes } from './pages/Trip/TripDetailRoutes'
import { getProfileName, hasOnboarded, markOnboarded } from './services/onboardingStorage'
import './App.css'

const PAGES: Record<TabId, ComponentType> = {
  itinerary: ItineraryPage,
  photos: PhotosPage,
  expenses: ExpensesPage,
  explore: ExplorePage,
}

const isTab = (value: string | undefined): value is TabId => !!value && value in PAGES

/**
 * Routes (hash based):
 *   #/                 Home: your trips
 *   #/home/empty       Home with no trips yet (first-run state)
 *   #/notifications    Notifications
 *   #/plan[/…]         Before the trip (Manali): overview, vote/<id>, bookings, checklist, budget
 *   #/create/<step>    Create a trip: destination → dates → squad → vibe → generating → draft
 *   #/trip/<tab>       Inside the live trip: itinerary | photos | expenses | explore
 *   #/trip/<tab>/…     Trip details: stop/<id>, add, expenses/add, expenses/settle, photos/view/<i>, …
 *   #/trip/members     Squad members (and #/trip/settings)
 *   #/quiz[/…]         Personality quiz: intro, cards 1–8, persona (follows onboarding)
 *   #/<step>           Any onboarding step (welcome, sign-in, verify, …)
 */
function App() {
  const [route, navigate] = useHashRoute()
  const [onboarded, setOnboarded] = useState(hasOnboarded)
  const [name, setName] = useState(getProfileName)
  const [notifications, setNotifications] = useState(NOTIFICATIONS)
  const unread = notifications.filter((n) => n.unread).length
  const markRead = (id?: string) =>
    setNotifications((all) => all.map((n) => (!id || n.id === id ? { ...n, unread: false } : n)))

  const segments = route.split('/')
  const [section, sub] = segments
  // Any onboarding or quiz screen can be opened directly; otherwise new users start at welcome
  const quizRoute = parseQuizRoute(route)
  const onboardingStep = isOnboardingStep(route) ? route : onboarded || quizRoute ? null : 'welcome'
  const goHome = () => navigate('')
  // Detail screens inside the trip (stop, add expense, photo viewer, members, …). TripDetailRoutes
  // is hook-free and returns null for paths it doesn't handle, which then fall back to a tab.
  const tripDetail =
    section === 'trip' && (segments.length > 2 || (sub && !isTab(sub))) ? TripDetailRoutes({ path: segments.slice(1) }) : null

  let screen
  if (onboardingStep) {
    screen = (
      <OnboardingFlow
        step={onboardingStep}
        go={navigate}
        onDone={(details) => {
          markOnboarded(details.name)
          setOnboarded(true)
          setName(getProfileName())
          navigate('quiz')
        }}
      />
    )
  } else if (quizRoute) {
    screen = <QuizFlow route={quizRoute} go={navigate} onDone={goHome} />
  } else if (tripDetail) {
    screen = tripDetail
  } else if (section === 'trip') {
    const tab = isTab(sub) ? sub : 'itinerary'
    const Page = PAGES[tab]
    screen = (
      <ScreenBackContext.Provider value={goHome}>
        <Page />
        <TabBar active={tab} onSelect={(t) => navigate(`trip/${t}`, { replace: true })} />
        <GhoomMateFab />
      </ScreenBackContext.Provider>
    )
  } else if (section === 'plan') {
    screen = <PlanRoutes path={segments.slice(1)} />
  } else if (section === 'create') {
    screen = <CreateTripRoutes path={segments.slice(1)} />
  } else if (section === 'notifications') {
    screen = <NotificationsPage notifications={notifications} onMarkRead={markRead} onBack={goHome} />
  } else {
    screen = (
      <>
        <HomePage
          name={name}
          unread={unread}
          empty={route === 'home/empty'}
          onOpenNotifications={() => navigate('notifications')}
          onOpenTrip={(tab) => navigate(`trip/${tab}`)}
          onHaveInvite={() => navigate('invite')}
        />
        <GhoomMateFab />
      </>
    )
  }

  return (
    <div className="app">
      <div className="device">
        <NavigateContext.Provider value={navigate}>{screen}</NavigateContext.Provider>
      </div>
    </div>
  )
}

export default App
