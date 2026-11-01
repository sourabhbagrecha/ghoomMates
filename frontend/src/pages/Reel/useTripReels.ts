import { useCallback, useEffect, useState } from 'react'
import { reelsApi, type Reel } from '../../services/reelsService'
import type { MapTiles } from './mapMath'

/**
 * The squad's reels, newest first: null while loading. `add` puts a reel just cut on this device at the front, and
 * `mapTiles` is where map scenes get their tiles. After a failed load the list is empty and `failed` is true
 * until `retry`.
 */
export function useTripReels(tripId: string | null) {
  const [reels, setReels] = useState<Reel[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [mapTiles, setMapTiles] = useState<MapTiles>('esri')
  // Bumped to load the list again after a failure
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!tripId) return
    let live = true
    reelsApi
      .list(tripId)
      .then(({ items, mapTiles: tiles }) => {
        if (!live) return
        setReels(items)
        if (tiles) setMapTiles(tiles)
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

  return { reels: tripId ? reels : [], failed, retry, add, mapTiles }
}
