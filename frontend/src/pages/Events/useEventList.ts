import { useCallback, useEffect, useState } from 'react'
import { addDays, todayISO } from '../../data/tripDates'
import { eventsApi, type EventList } from '../../services/eventsService'

/** How far ahead the screens look: the whole calendar, through the New Year week of 2027 */
const AHEAD_DAYS = 480

/**
 * The festival calendar from today on, shared by every screen that shows it (the Explore row, the list, CrowdPulse's line
 * and the itinerary tip): they ask for the same window, so it is fetched once. `list` stays null while loading or if the
 * calendar can't be reached; `error` says so and `reload` tries again.
 */
export function useEventList() {
  const [state, setState] = useState<{ list: EventList | null; error: string | null }>({ list: null, error: null })
  const [attempt, setAttempt] = useState(0)
  const today = todayISO()

  useEffect(() => {
    let stale = false
    eventsApi
      .list(today, addDays(today, AHEAD_DAYS))
      .then((list) => !stale && setState({ list, error: null }))
      .catch((err) => !stale && setState({ list: null, error: err instanceof Error ? err.message : 'Something went wrong' }))
    return () => {
      stale = true
    }
  }, [today, attempt])

  const reload = useCallback(() => {
    setState({ list: null, error: null })
    setAttempt((n) => n + 1)
  }, [])

  return { ...state, today, reload }
}
