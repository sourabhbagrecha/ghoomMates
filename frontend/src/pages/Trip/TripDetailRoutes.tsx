import type { JSX } from 'react'
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
import { VIEWER_PHOTOS } from './tripDetailData'
import { getTripState } from './tripStore'
import { TripSettingsPage } from './TripSettingsPage'

const hasStop = (id: string | undefined) => !!id && getTripState().stops.some((s) => s.id === id)

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
 *   explore/guide           Guide trip detail
 *   members                 Squad members
 *   settings                Trip settings
 */
export function TripDetailRoutes({ path }: { path: string[] }): JSX.Element | null {
  const [section, page, param, ...rest] = path
  const route = [section, page, param].filter(Boolean).join('/')
  if (rest.length) return null

  switch (section) {
    case 'itinerary':
      if (page === 'stop' && hasStop(param)) return <StopDetailPage key={param} stopId={param} />
      if (route === 'itinerary/add') return <StopFormPage key="new" />
      if (page === 'edit' && hasStop(param)) return <StopFormPage key={param} stopId={param} />
      return null
    case 'expenses':
      if (route === 'expenses/add') return <AddExpensePage />
      if (route === 'expenses/settle') return <SettleUpPage />
      if (route === 'expenses/settle/done') return <SettleDonePage />
      return null
    case 'photos': {
      if (route === 'photos/upload') return <PhotoUploadPage />
      if (route === 'photos/reel') return <ReelResultPage />
      const index = Number(param)
      if (page === 'view' && /^\d+$/.test(param ?? '') && index < VIEWER_PHOTOS.length) {
        return <PhotoViewerPage index={index} />
      }
      return null
    }
    case 'explore':
      return route === 'explore/guide' ? <GuideTripPage /> : null
    case 'members':
      return route === 'members' ? <MembersPage /> : null
    case 'settings':
      return route === 'settings' ? <TripSettingsPage /> : null
    default:
      return null
  }
}
