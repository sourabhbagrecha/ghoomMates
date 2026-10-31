import { AlbumPage } from './AlbumPage'
import { DaysPage } from './DaysPage'
import { PastExpensesPage } from './PastExpensesPage'
import { PAST_TRIP_DETAILS } from './pastTripData'
import { RatePage } from './RatePage'
import { RecapPage } from './RecapPage'

/**
 * After the trip, mounted at `#/past/<tripId>[/album|days|expenses|rate[/<stars>]]`.
 * Hook-free so the app can call it and fall back to Home for unknown trips.
 */
export function PastTripRoutes({ path }: { path: string[] }) {
  const [tripId, screen, extra] = path
  const details = PAST_TRIP_DETAILS[tripId]
  if (!details) return null

  switch (screen) {
    case undefined:
    case '':
      return <RecapPage details={details} />
    case 'album':
      return <AlbumPage details={details} />
    case 'days':
      return <DaysPage details={details} />
    case 'expenses':
      return <PastExpensesPage details={details} />
    case 'rate': {
      const stars = Number(extra)
      return <RatePage key={tripId} details={details} initialStars={stars >= 1 && stars <= 5 ? stars : undefined} />
    }
    default:
      return null
  }
}
