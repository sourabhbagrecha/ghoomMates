import type { JSX } from 'react'
import { EventsPage } from '../Events/EventsPage'
import { EXPERIENCES, experienceById } from '../Explore/experiencesData'
import { MakerDetailPage } from '../Makers/MakerDetailPage'
import { MakersListPage } from '../Makers/MakersListPage'
import { MiniaturePage } from '../Miniature/MiniaturePage'
import { AddExpensePage } from './AddExpensePage'
import { GuideTripPage } from './GuideTripPage'
import { MembersPage } from './MembersPage'
import { PhotoUploadPage } from './PhotoUploadPage'
import { PhotoViewerPage } from './PhotoViewerPage'
import { ReelResultPage } from './ReelResultPage'
import { SettleDonePage } from './SettleDonePage'
import { SettleUpPage } from './SettleUpPage'
import { StopDetailPage } from './StopDetailPage'
import { StopFormPage } from './StopFormPage'
import { TripSettingsPage } from './TripSettingsPage'

/**
 * Screens pushed from the trip tabs, rendered full-screen without the tab bar.
 * `path` is the route after `trip/`, e.g. ['itinerary', 'stop', 'mandovi-cruise'].
 * Uses no hooks, so it can be called as a plain function or rendered as a component.
 *
 *   itinerary/stop/<id>     Stop detail
 *   itinerary/add           Add a stop
 *   itinerary/edit/<id>     Edit a stop
 *   expenses/add            Add expense
 *   expenses/settle         Settle up
 *   expenses/settle/done    Payment sent
 *   photos/view/<index>     Photo viewer (0-based)
 *   photos/upload           Upload photos
 *   photos/reel             Generated reel
 *   photos/miniature        Squad Miniature: paint a squad photo in a Udaipur tradition
 *   explore/guide/<id>      Guide trip detail (bare explore/guide opens the first one)
 *   explore/makers[/<id>]   Makers of Udaipur: the list, or one maker
 *   explore/events          Mewar Utsav: festivals, fairs and nightly shows (?e=<id> scrolls to one)
 *   members                 Squad members
 *   settings                Trip settings
 */
export function TripDetailRoutes({ path }: { path: string[] }): JSX.Element | null {
  const [section, page, param, ...rest] = path
  const route = [section, page, param].filter(Boolean).join('/')
  if (rest.length) return null

  switch (section) {
    case 'itinerary':
      // Stop screens wait for the itinerary to load and handle unknown ids themselves
      if (page === 'stop' && param) return <StopDetailPage key={param} stopId={param} />
      if (route === 'itinerary/add') return <StopFormPage key="new" />
      if (page === 'edit' && param) return <StopFormPage key={param} stopId={param} />
      return null
    case 'expenses':
      if (route === 'expenses/add') return <AddExpensePage />
      if (route === 'expenses/settle') return <SettleUpPage />
      if (route === 'expenses/settle/done') return <SettleDonePage />
      return null
    case 'photos': {
      if (route === 'photos/upload') return <PhotoUploadPage />
      if (route === 'photos/reel') return <ReelResultPage />
      if (route === 'photos/miniature') return <MiniaturePage />
      // The viewer waits for the album to load, so any index is accepted here
      if (page === 'view' && /^\d+$/.test(param ?? '')) return <PhotoViewerPage index={Number(param)} />
      return null
    }
    case 'explore': {
      if (page === 'makers') return param ? <MakerDetailPage key={param} makerId={param} /> : <MakersListPage />
      if (route === 'explore/events') return <EventsPage />
      if (page !== 'guide') return null
      const experience = param ? experienceById(param) : EXPERIENCES[0]
      return experience ? <GuideTripPage key={experience.id} experience={experience} /> : null
    }
    case 'members':
      return route === 'members' ? <MembersPage /> : null
    case 'settings':
      return route === 'settings' ? <TripSettingsPage /> : null
    default:
      return null
  }
}
