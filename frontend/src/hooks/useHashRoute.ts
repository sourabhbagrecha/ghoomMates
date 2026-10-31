import { useCallback, useEffect, useState } from 'react'

const readRoute = () => window.location.hash.replace(/^#\/?/, '')

type Navigate = (route: string, options?: { replace?: boolean }) => void

/** Minimal hash router: `#/sign-in` → "sign-in". Browser back/forward work for free. */
export function useHashRoute(): [string, Navigate] {
  const [route, setRoute] = useState(readRoute)

  useEffect(() => {
    const onChange = () => setRoute(readRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback<Navigate>((next, options) => {
    if (options?.replace) {
      // replaceState doesn't fire hashchange, so update state ourselves
      window.history.replaceState(null, '', `#/${next}`)
      setRoute(next)
    } else {
      window.location.hash = `/${next}`
    }
  }, [])

  return [route, navigate]
}
