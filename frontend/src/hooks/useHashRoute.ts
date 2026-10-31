import { useCallback, useEffect, useState } from 'react'

const readRoute = () => window.location.hash.replace(/^#\/?/, '')

/** Minimal hash router: `#/sign-in` → "sign-in". Browser back/forward work for free. */
export function useHashRoute(): [string, (route: string) => void] {
  const [route, setRoute] = useState(readRoute)

  useEffect(() => {
    const onChange = () => setRoute(readRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((next: string) => {
    window.location.hash = `/${next}`
  }, [])

  return [route, navigate]
}
