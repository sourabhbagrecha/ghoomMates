import { useCallback, useEffect, useState } from 'react'

type Loaded<T> = { data: T | null; error: string | null; loading: boolean }

const messageOf = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong')

/**
 * Loads something from the API: the data, a friendly error, and a reload. `key` says when to load again
 * (a different host, a different day); the loader itself may change on every render. A `null` key waits,
 * for when what to load isn't known yet. An older answer never replaces a newer one, and the last good
 * data stays on screen while a reload is in flight.
 */
export function useLoad<T>(load: () => Promise<T>, key: string | null) {
  const [state, setState] = useState<Loaded<T>>({ data: null, error: null, loading: true })
  const [round, setRound] = useState(0)

  useEffect(() => {
    if (key === null) return
    let current = true
    load()
      .then((data) => current && setState({ data, error: null, loading: false }))
      .catch((err) => current && setState((s) => ({ data: s.data, error: messageOf(err), loading: false })))
    return () => {
      current = false
    }
    // `load` is a fresh closure every render; `key` and `round` are what say "load again"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, round])

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }))
    setRound((n) => n + 1)
  }, [])

  const setData = useCallback((data: T) => setState({ data, error: null, loading: false }), [])

  return { ...state, reload, setData }
}
