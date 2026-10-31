import { useCallback, useEffect, useState } from 'react'

const readRoute = () => {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/auth/callback')) {
    return 'auth/callback'
  }
  const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#\/?/, '') : ''
  // Strip query parameters (?token=..., ?error=..., etc.) from the route name
  return hash.split('?')[0]
}

export type Navigate = (route: string, options?: { replace?: boolean }) => void

/** For each top-level section (`profile`, `quiz`, …), the route the user was on when they entered it. */
export type EntryRoutes = Readonly<Record<string, string>>

type RouteState = { route: string; entries: EntryRoutes }

const sectionOf = (route: string) => route.split('/')[0]

/**
 * Records where a section was entered from. Coming back out of a section to the one
 * that opened it (e.g. quiz → profile) keeps that section's original entry point.
 */
function moveTo(prev: RouteState, route: string): RouteState {
  if (route === prev.route) return prev
  const from = sectionOf(prev.route)
  const to = sectionOf(route)
  const returning = sectionOf(prev.entries[from] ?? '') === to
  const entries = from !== to && !returning ? { ...prev.entries, [to]: prev.route } : prev.entries
  return { route, entries }
}

/** Minimal hash router: `#/sign-in` → "sign-in". Browser back/forward work for free. */
export function useHashRoute(): [string, Navigate, EntryRoutes] {
  const [state, setState] = useState<RouteState>(() => ({ route: readRoute(), entries: {} }))

  useEffect(() => {
    const onChange = () => setState((prev) => moveTo(prev, readRoute()))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback<Navigate>((next, options) => {
    const clean = next.replace(/^#\/?/, '').split('?')[0]
    if (options?.replace) {
      // replaceState doesn't fire hashchange, so update state ourselves
      window.history.replaceState(null, '', `#/${next}`)
      setState((prev) => moveTo(prev, clean))
    } else {
      const current = window.location.hash.replace(/^#\/?/, '').split('?')[0]
      if (current === clean) {
        setState((prev) => moveTo(prev, clean))
      } else {
        window.location.hash = `/${next}`
      }
    }
  }, [])

  return [state.route, navigate, state.entries]
}
