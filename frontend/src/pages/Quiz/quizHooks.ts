import { useEffect, useState, useSyncExternalStore } from 'react'
import { getStoredUser, subscribeAuth } from '../../services/authService'
import { flushSwipes, readSwipeDraft, subscribeSwipeDrafts, type SwipeDraft, type SwipeScope } from '../../services/vibeStorage'

// Hooks for the Vibe Swipe screens: who's signed in, your draft for a deck, loading, and sending answers on the way out.

const onAuthChange = (listener: () => void) => subscribeAuth(() => listener())

/** Whether someone is signed in on this device; follows sign-in and sign-out */
export const useSignedIn = () => useSyncExternalStore(onAuthChange, () => !!getStoredUser())

/** Your draft for a deck, kept in step with every answer, undo and batch sent */
export const useSwipeDraft = (scope: SwipeScope): SwipeDraft | null =>
  useSyncExternalStore(subscribeSwipeDrafts, () => readSwipeDraft(scope))

export type Loaded<T> =
  | { status: 'loading'; retry: () => void }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; data: T; retry: () => void }

type Settled<T> = { status: 'error'; error: unknown } | { status: 'ready'; data: T }

/**
 * Runs `load(key)` when the key changes and on retry. `load` should be a module-level function (decks.ts), so it is
 * the same on every render.
 */
export function useLoad<T>(key: string, load: (key: string) => Promise<T>): Loaded<T> {
  const [attempt, setAttempt] = useState(0)
  const id = `${key}#${attempt}`
  const [settled, setSettled] = useState<{ id: string; result: Settled<T> } | null>(null)

  useEffect(() => {
    let live = true
    load(key).then(
      (data) => live && setSettled({ id, result: { status: 'ready', data } }),
      (error: unknown) => live && setSettled({ id, result: { status: 'error', error } }),
    )
    return () => {
      live = false
    }
  }, [id, key, load])

  const retry = () => setAttempt((a) => a + 1)
  return settled?.id === id ? { ...settled.result, retry } : { status: 'loading', retry }
}

/** Sends a deck's unsent answers when you leave the screen or the app goes to the background (signed in) */
export function useFlushOnLeave(scope: SwipeScope) {
  useEffect(() => {
    const flush = () => void flushSwipes(scope).catch((error) => console.warn('Could not save swipes:', error))
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [scope])
}

/** Back where you came from; the fallback when the quiz was opened straight from a link */
export function goBack(fallback: () => void) {
  if (window.history.length > 1) window.history.back()
  else fallback()
}
