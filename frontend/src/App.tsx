import { useState, type ComponentType } from 'react'
import { GhoomMateFab } from './components/GhoomMate'
import { ScreenBackContext } from './components/screenBack'
import { TabBar, type TabId } from './components/TabBar'
import { NOTIFICATIONS } from './data/notifications'
import { useHashRoute } from './hooks/useHashRoute'
import { ExpensesPage } from './pages/Expenses/ExpensesPage'
import { ExplorePage } from './pages/Explore/ExplorePage'
import { HomePage } from './pages/Home/HomePage'
import { ItineraryPage } from './pages/Itinerary/ItineraryPage'
import { NotificationsPage } from './pages/Notifications/NotificationsPage'
import { OnboardingFlow } from './pages/Onboarding/OnboardingFlow'
import { isOnboardingStep } from './pages/Onboarding/onboardingData'
import { PhotosPage } from './pages/Photos/PhotosPage'
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
 *   #/trip/<tab>       Inside the live trip: itinerary | photos | expenses | explore
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

  const [section, sub] = route.split('/')
  const onboardingStep = isOnboardingStep(route) ? route : onboarded ? null : 'welcome'
  const goHome = () => navigate('')

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
          goHome()
        }}
      />
    )
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
      <div className="device">{screen}</div>
    </div>
  )
}

export default App
