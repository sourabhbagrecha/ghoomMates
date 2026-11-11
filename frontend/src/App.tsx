import { useEffect, useState, type ComponentType } from 'react'
import { GhoomMateFab } from './components/GhoomMate'
import { ScreenBackContext } from './components/screenBack'
import { OfflineBanner } from './components/states/OfflineBanner'
import { TabBar, type TabId } from './components/TabBar'
import { ErrorBoundary } from './components/states/ErrorBoundary'
import { VoiceProvider } from './components/voice/VoiceProvider'
import { activeTrip } from './data/activeTrip'
import { setYou } from './data/people'
import { NOTIFICATIONS } from './data/notifications'
import { EntryRoutesContext, NavigateContext } from './hooks/navigation'
import { useHashRoute } from './hooks/useHashRoute'
import { CreateTripRoutes } from './pages/CreateTrip/CreateTripRoutes'
import { ExpensesPage } from './pages/Expenses/ExpensesPage'
import { ExplorePage } from './pages/Explore/ExplorePage'
import { HomePage } from './pages/Home/HomePage'
import { HostRoutes } from './pages/Hospitality/HostRoutes'
import { ItineraryPage } from './pages/Itinerary/ItineraryPage'
import { JoinTripPage } from './pages/Onboarding/JoinTripPage'
import { NotificationsPage } from './pages/Notifications/NotificationsPage'
import { OnboardingFlow } from './pages/Onboarding/OnboardingFlow'
import { OpsPage } from './pages/Ops/OpsPage'
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
  hasCompletedProfile,
  loginWithGoogleCode,
  saveAuthSession,
  subscribeAuth,
  updateUserProfile,
  type AuthUser,
} from './services/authService'
import { syncVibeToProfile } from './services/vibeStorage'
import { getProfileName, hasOnboarded, markOnboarded } from './services/onboardingStorage'
import { getPendingInvite } from './services/pendingInvite'
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
 *   #/plan[/…]         Before the trip (the Udaipur heritage weekend): overview, vote/<id>, bookings, checklist, budget
 *   #/create/<step>    Create a trip: destination → dates → squad → vibe → generating → draft
 *   #/trip/<tab>       Inside the live trip: itinerary | photos | expenses | explore
 *   #/trip/<tab>/…     Trip details: stop/<id>, add, expenses/add, expenses/settle, photos/view/<i>, …
 *   #/trip/members     Squad members (and #/trip/settings)
 *   #/past/<id>[/…]    After the trip: recap, album, days, expenses, rate[/<stars>]
 *   #/quiz[/…]         Personality quiz: intro, cards 1–8, persona (after onboarding; retaken from Profile)
 *   #/profile[/…]      Your profile: edit, settings, help
 *   #/host[/<id>]      Host kitchen (partner tools): a farm-to-table kitchen's covers, farm orders, menu and leftovers
 *   #/states           Gallery of loading / empty / error / offline states
 *   #/join[/<code>]    Join a trip from an invite link (works before signing in)
 *   #/auth/callback    OAuth callback redirect
 *   #/<step>           Any onboarding step (welcome, sign-in, selfie, about-you, permissions)
 */
function App() {
  const [route, navigate, entries] = useHashRoute()
  const [user, setUser] = useState<AuthUser | null>(getStoredUser)
  // Idempotent: keeps the "you" avatar in step with the signed-in user before anything renders it
  setYou(user)
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
      setUser((prev) => {
        // Signed out or switched accounts: drop the previous user's trips
        if (!u || (prev && prev.id !== u.id)) activeTrip.reset()
        return u
      })
    })
    fetchCurrentUser().then((u) => {
      if (u) {
        setUser(u)
      }
    })
    return unsubscribe
  }, [])

  // A quiz taken before signing up goes onto the profile, where GhoomMate and the squad can see it
  useEffect(() => syncVibeToProfile(user), [user])

  // Signed in with an invite still pending (e.g. a returning user who signed in from the invite): open it
  useEffect(() => {
    const pending = getPendingInvite()
    if (route === '' && user && hasOnboarded() && pending) navigate(`join/${pending}`, { replace: true })
  }, [route, user, navigate])

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
      // Returning users go Home (or to a pending invite); only new ones go through sign-up
      const afterSignIn = (u: AuthUser | null) => {
        const next = hasCompletedProfile(u) ? '' : 'selfie'
        window.history.replaceState(null, '', `#/${next}`)
        navigate(next, { replace: true })
      }

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

        // The token only carries id, email and name; the saved profile says whether sign-up was finished
        fetch('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .then((data) => {
            if (data.user) {
              saveAuthSession(token, data.user, false)
              setUser(data.user)
            }
            afterSignIn(data.user)
          })
          .catch((err) => {
            console.warn('Background token check warning:', err)
            afterSignIn(null)
          })
      } else if (code) {
        const redirectUri = `${window.location.origin}/auth/callback`
        loginWithGoogleCode(code, redirectUri)
          .then((res) => {
            setUser(res.user)
            afterSignIn(res.user)
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
  // Help & FAQ is also reachable from sign-in, before the user has an account, and so are invite links
  const openBeforeSignUp = quizRoute || route === 'profile/help' || section === 'join'
  const onboardingStep = isOnboardingStep(route) ? route : onboarded || openBeforeSignUp ? null : 'welcome'
  const goHome = () => navigate('')

  // Detail screens inside the trip (stop, add expense, photo viewer, members, …). TripDetailRoutes
  // is hook-free and returns null for paths it doesn't handle, which then fall back to a tab.
  // Trip screens need an open trip; without one they fall back to Home
  const hasTrip = !!activeTrip.get().tripId
  const tripDetail =
    section === 'trip' && (segments.length > 2 || (sub && !isTab(sub))) ? TripDetailRoutes({ path: segments.slice(1) }) : null

  // After the trip; unknown trips fall back to Home
  const pastTrip = section === 'past' ? PastTripRoutes({ path: segments.slice(1) }) : null

  // Hook-free like the other route modules; unknown profile paths fall back to Home
  const profileScreen = section === 'profile' ? ProfileRoutes({ path: segments.slice(1) }) : null

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
          // The saved account carries the uploaded photo's URL
          const saved = getStoredUser()
          if (saved) setUser(saved)
          navigate('quiz')
        }}
      />
    )
  } else if (quizRoute) {
    // Retaking the quiz from Profile returns there, and from a trip back to that trip; after onboarding it goes Home
    const from = entries.quiz ?? ''
    const fromProfile = from.startsWith('profile')
    const fromTrip = from.startsWith('trip') && hasTrip
    // An invite opened before signing up is picked up again once the quiz is done
    const pending = getPendingInvite()
    screen = (
      <QuizFlow
        route={quizRoute}
        go={navigate}
        onDone={() => {
          // The squad's quiz progress lives on the trip's member list
          if (fromTrip) void activeTrip.loadTrip()
          navigate(fromProfile ? 'profile' : fromTrip ? from : pending ? `join/${pending}` : '')
        }}
      />
    )
  } else if (section === 'join') {
    screen = <JoinTripPage key={sub ?? ''} code={sub} />
  } else if (pastTrip) {
    screen = pastTrip
  } else if (tripDetail && hasTrip) {
    screen = tripDetail
  } else if (section === 'trip' && hasTrip) {
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
  } else if (section === 'host') {
    screen = <HostRoutes path={segments.slice(1)} />
  } else if (section === 'states') {
    screen = <StatesPage />
  } else if (section === 'ops') {
    screen = <OpsPage />
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
          onOpenTrip={(tripId, tab) => {
            activeTrip.open(tripId)
            navigate(`trip/${tab}`)
          }}
          onJoinTrip={() => navigate('join')}
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
            <VoiceProvider>
              {/* A screen that throws shows an error card instead of blanking the app */}
              <ErrorBoundary
                resetKey={route}
                className="app__screen-error"
                title="This screen hit a snag"
                text="Something went wrong showing it. Try again, or head back."
              >
                {screen}
              </ErrorBoundary>
            </VoiceProvider>
          </EntryRoutesContext.Provider>
        </NavigateContext.Provider>
        <OfflineBanner />
      </div>
    </div>
  )
}

export default App
