import { useCallback, useEffect, useState } from 'react'
import { reelsApi, type Reel } from '../../services/reelsService'

/**
 * The squad's reels, newest first: null while loading. `add` puts a reel just cut on this device at the front. After
 * a failed load the list is empty and `failed` is true until `retry`.
 */
export function useTripReels(tripId: string | null) {
  const [reels, setReels] = useState<Reel[] | null>(null)
  const [failed, setFailed] = useState(false)
  // Bumped to load the list again after a failure
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!tripId) return
    let live = true
    reelsApi
      .list(tripId)
      .then(({ items }) => {
        if (!live) return
        setReels(items)
      })
      .catch(() => {
        if (!live) return
        setFailed(true)
        setReels([])
      })
    return () => {
      live = false
    }
  }, [tripId, attempt])

  const retry = useCallback(() => {
    setFailed(false)
    setReels(null)
    setAttempt((n) => n + 1)
  }, [])

  const add = useCallback((reel: Reel) => setReels((list) => [reel, ...(list ?? []).filter((r) => r.id !== reel.id)]), [])

  return { reels: tripId ? reels : [], failed, retry, add }
}
