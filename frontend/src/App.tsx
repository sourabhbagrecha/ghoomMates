import { useEffect, useState, type ComponentType } from 'react'
import { GhoomMateFab } from './components/GhoomMate'
import { ScreenBackContext } from './components/screenBack'
import { OfflineBanner } from './components/states/OfflineBanner'
import { TabBar, type TabId } from './components/TabBar'
import { VoiceProvider } from './components/voice/VoiceProvider'
import { NOTIFICATIONS } from './data/notifications'
import { EntryRoutesContext, NavigateContext } from './hooks/navigation'
import { useHashRoute } from './hooks/useHashRoute'
import { CreateTripRoutes } from './pages/CreateTrip/CreateTripRoutes'
import { ExpensesPage } from './pages/Expenses/ExpensesPage'
import { ExplorePage } from './pages/Explore/ExplorePage'
import { HomePage } from './pages/Home/HomePage'
import { ItineraryPage } from './pages/Itinerary/ItineraryPage'
import { NotificationsPage } from './pages/Notifications/NotificationsPage'
import { OnboardingFlow } from './pages/Onboarding/OnboardingFlow'
import { isOnboardingStep } from './pages/Onboarding/onboardingData'
import { PastTripRoutes } from './pages/PastTrip/PastTripRoutes'
import { PhotosPage } from './pages/Photos/PhotosPage'
import { PlanRoutes } from './pages/Plan/PlanRoutes'
import { ProfileRoutes } from './pages/Profile/ProfileRoutes'
import { displayName, useProfileStore } from './pages/Profile/profileStore'
import { QuizFlow } from './pages/Quiz/QuizFlow'
import { parseQuizRoute } from './pages/Quiz/quizData'
import { StatesPage } from './pages/States/StatesPage'
import { rememberTripTab } from './pages/Trip/lastTab'
import { TripDetailRoutes } from './pages/Trip/TripDetailRoutes'
import {
  decodeJwtPayload,
  fetchCurrentUser,
  getStoredUser,
  loginWithGoogleCode,
  logoutUser,
  saveAuthSession,
  subscribeAuth,
  updateUserProfile,
  type AuthUser,
} from './services/authService'
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
 *   #/past/<id>[/…]    After the trip: recap, album, days, expenses, rate[/<stars>]
 *   #/quiz[/…]         Personality quiz: intro, cards 1–8, persona (after onboarding; retaken from Profile)
 *   #/profile[/…]      Your profile: edit, settings, help
 *   #/states           Gallery of loading / empty / error / offline states
 *   #/auth/callback    OAuth callback redirect
 *   #/<step>           Any onboarding step (welcome, sign-in, selfie, about-you, permissions, invite)
 */
function App() {
  const [route, navigate, entries] = useHashRoute()
  const [user, setUser] = useState<AuthUser | null>(getStoredUser)
  // Read on every render (i.e. every route change) so signing out from Settings takes effect
  const onboarded = hasOnboarded()
  const profile = useProfileStore()
  // A name edited in Profile or from Google wins over the one saved during onboarding
  const name = user?.name || (profile.name ? displayName(profile) : getProfileName())

  const [notifications, setNotifications] = useState(NOTIFICATIONS)
  const unread = notifications.filter((n) => n.unread).length
  const markRead = (id?: string) =>
    setNotifications((all) => all.map((n) => (!id || n.id === id ? { ...n, unread: false } : n)))

  useEffect(() => {
    const unsubscribe = subscribeAuth((u) => {
      setUser(u)
    })
    fetchCurrentUser().then((u) => {
      if (u) {
        setUser(u)
      }
    })
    return unsubscribe
  }, [])

  // Process OAuth callback from Google
  useEffect(() => {
    const isCallbackPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/auth/callback')
    const rawHashQuery = typeof window !== 'undefined' ? window.location.hash.split('?')[1] : ''
    const rawSearch = typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : ''
    const rawQuery = rawSearch || rawHashQuery || ''

    if (route.startsWith('auth/callback') || isCallbackPath || rawQuery.includes('token=') || rawQuery.includes('code=')) {
      const params = new URLSearchParams(rawQuery)
      const token = params.get('token')
      const code = params.get('code')

      if (token) {
        const decoded = decodeJwtPayload(token)
        if (decoded?.id && decoded?.email) {
          const authUser: AuthUser = {
            id: decoded.id,
            email: decoded.email,
            name: decoded.name || decoded.email.split('@')[0],
            picture: decoded.picture,
          }
          saveAuthSession(token, authUser, false)
          setUser(authUser)
        }

        window.history.replaceState(null, '', '#/selfie')
        navigate('selfie', { replace: true })

        fetch('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .then((data) => {
            if (data.user) {
              saveAuthSession(token, data.user, false)
              setUser(data.user)
            }
          })
          .catch((err) => {
            console.warn('Background token check warning:', err)
          })
      } else if (code) {
        const redirectUri = `${window.location.origin}/auth/callback`
        loginWithGoogleCode(code, redirectUri)
          .then((res) => {
            setUser(res.user)
            window.history.replaceState(null, '', '#/selfie')
            navigate('selfie', { replace: true })
          })
          .catch((err) => {
            console.error('Google OAuth callback error:', err)
            window.history.replaceState(null, '', '#/sign-in')
            navigate('sign-in', { replace: true })
          })
      } else if (isCallbackPath) {
        window.history.replaceState(null, '', '#/selfie')
        navigate('selfie', { replace: true })
      }
    }
  }, [route, navigate])

  const segments = route.split('/')
  const [section, sub] = segments
  // Any onboarding or quiz screen can be opened directly; otherwise new users start at welcome
  const quizRoute = parseQuizRoute(route)
  // Help & FAQ is also reachable from sign-in, before the user has an account
  const openBeforeSignUp = quizRoute || route === 'profile/help'
  const onboardingStep = isOnboardingStep(route) ? route : onboarded || openBeforeSignUp ? null : 'welcome'
  const goHome = () => navigate('')

  // Detail screens inside the trip (stop, add expense, photo viewer, members, …). TripDetailRoutes
  // is hook-free and returns null for paths it doesn't handle, which then fall back to a tab.
  const tripDetail =
    section === 'trip' && (segments.length > 2 || (sub && !isTab(sub))) ? TripDetailRoutes({ path: segments.slice(1) }) : null

  // After the trip; unknown trips fall back to Home
  const pastTrip = section === 'past' ? PastTripRoutes({ path: segments.slice(1) }) : null

  // Hook-free like the other route modules; unknown profile paths fall back to Home
  const profileScreen = section === 'profile' ? ProfileRoutes({ path: segments.slice(1) }) : null

  const handleLogout = async () => {
    await logoutUser()
    setUser(null)
    navigate('welcome')
  }

  let screen
  if (route.startsWith('auth/callback') || (typeof window !== 'undefined' && window.location.pathname.startsWith('/auth/callback'))) {
    screen = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
        <p style={{ fontWeight: 700, color: 'var(--color-primary)' }}>Signing in with Google...</p>
      </div>
    )
  } else if (onboardingStep) {
    screen = (
      <OnboardingFlow
        step={onboardingStep}
        currentUser={user}
        go={navigate}
        onDone={(details) => {
          markOnboarded(details.name)
          // The name entered in About you replaces the one from Google
          if (details.name.trim() && details.name.trim() !== user?.name) void updateUserProfile({ name: details.name.trim() })
          if (details.photo) {
            setUser((prev) => (prev ? { ...prev, picture: details.photo! } : null))
          }
          navigate('quiz')
        }}
      />
    )
  } else if (quizRoute) {
    // Retaking the quiz from Profile returns there; after onboarding it goes Home
    const fromProfile = (entries.quiz ?? '').startsWith('profile')
    screen = <QuizFlow route={quizRoute} go={navigate} onDone={() => navigate(fromProfile ? 'profile' : '')} />
  } else if (pastTrip) {
    screen = pastTrip
  } else if (tripDetail) {
    screen = tripDetail
  } else if (section === 'trip') {
    const tab = isTab(sub) ? sub : 'itinerary'
    rememberTripTab(tab)
    const Page = PAGES[tab]
    screen = (
      <ScreenBackContext.Provider value={() => navigate(entries.trip ?? '')}>
        <Page />
        <TabBar active={tab} onSelect={(t) => navigate(`trip/${t}`, { replace: true })} />
        <GhoomMateFab />
      </ScreenBackContext.Provider>
    )
  } else if (section === 'plan') {
    screen = <PlanRoutes path={segments.slice(1)} />
  } else if (section === 'create') {
    screen = <CreateTripRoutes path={segments.slice(1)} />
  } else if (profileScreen) {
    screen = profileScreen
  } else if (section === 'states') {
    screen = <StatesPage />
  } else if (section === 'notifications') {
    screen = <NotificationsPage notifications={notifications} onMarkRead={markRead} onBack={goHome} />
  } else {
    screen = (
      <>
        <HomePage
          name={name}
          user={user}
          unread={unread}
          empty={route === 'home/empty'}
          onOpenNotifications={() => navigate('notifications')}
          onOpenTrip={(tab) => navigate(`trip/${tab}`)}
          onHaveInvite={() => navigate('invite')}
          onLogout={handleLogout}
        />
        <GhoomMateFab />
      </>
    )
  }

  return (
    <div className="app">
      <div className="device">
        <NavigateContext.Provider value={navigate}>
          <EntryRoutesContext.Provider value={entries}>
            <VoiceProvider>{screen}</VoiceProvider>
          </EntryRoutesContext.Provider>
        </NavigateContext.Provider>
        <OfflineBanner />
      </div>
    </div>
  )
}

export default App
