import type { JSX } from 'react'
import { PassportPage } from './PassportPage'
import { StoryPage } from './StoryPage'

/**
 * Kaavad Tales screens inside the trip, rendered full-screen without the tab bar. `path` is the route after `trip/`.
 * Uses no hooks, so it can be called as a plain function from TripDetailRoutes.
 *
 *   explore/story/<siteId>   A heritage story: painted panels, narration, quiz and stamp
 *   explore/passport         Your Heritage Passport and the squad's
 */
export function storyRoutes(path: string[]): JSX.Element | null {
  const [section, page, param, ...rest] = path
  if (section !== 'explore' || rest.length) return null
  if (page === 'story' && param) return <StoryPage key={param} siteId={param} />
  if (page === 'passport' && !param) return <PassportPage />
  return null
}
