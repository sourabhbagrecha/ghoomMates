import { useEffect, useState } from 'react'
import { selfieSavedAt } from '../../services/authService'
import { tripsApi, type SelfieStatus } from '../../services/tripsService'

/**
 * Where the face indexer is with your profile selfie, polled until it settles so Find me only unlocks once a search
 * can run. Extra states on top of the server's:
 *   checking  the first answer hasn't come back yet
 *   slow      still processing after POLL_MAX_MS; polling stops until retry()
 *   unknown   the status route couldn't be reached; Find me falls back to retrying the search itself
 */
export type SelfieRead = SelfieStatus | 'checking' | 'slow' | 'unknown'

const POLL_MS = 2_000
const POLL_MAX_MS = 3 * 60_000
const TICK_MS = 250
// Cold indexer ≈ 44 s, warm ≈ 4 s. The estimate eases toward 95% (86% at 40 s) and never claims done on its own.
const EASE_MS = 20_000
const ESTIMATE_CAP = 0.95

/** Settled answers per selfie URL, so coming back to Photos doesn't re-check or flash the ring */
const settled = new Map<string, SelfieStatus>()
/** When each selfie's read started (its upload from this tab, else when we first saw it processing) */
const startedAt = new Map<string, number>()
/** Selfies seen processing this session, so their "ready" moment gets its own copy */
const watched = new Set<string>()

const isSettled = (status: SelfieRead) => status === 'ready' || status === 'no_face' || status === 'error'

export function useSelfieRead(tripId: string | null, selfie: string | null) {
  const [answer, setAnswer] = useState<{ selfie: string; status: SelfieRead } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  const status: SelfieRead = !selfie
    ? 'none'
    : (settled.get(selfie) ?? (answer?.selfie === selfie ? answer.status : tripId ? 'checking' : 'unknown'))

  useEffect(() => {
    if (!tripId || !selfie || settled.has(selfie)) return
    let cancelled = false
    let timer = 0
    const began = Date.now()
    const check = async () => {
      let next: SelfieRead
      try {
        next = await tripsApi.selfieStatus(tripId)
      } catch {
        next = 'unknown'
      }
      if (cancelled) return
      if (next === 'processing') {
        watched.add(selfie)
        if (!startedAt.has(selfie)) startedAt.set(selfie, selfieSavedAt(selfie) ?? Date.now())
        if (Date.now() - began > POLL_MAX_MS) next = 'slow'
        else timer = window.setTimeout(() => void check(), POLL_MS)
      }
      if (isSettled(next)) settled.set(selfie, next as SelfieStatus)
      setAnswer({ selfie, status: next })
    }
    void check()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [tripId, selfie, attempt])

  // Moves the estimate along between polls
  const reading = status === 'processing'
  useEffect(() => {
    if (!reading) return
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(timer)
  }, [reading])

  const elapsedMs = selfie && reading ? Math.max(0, now - (startedAt.get(selfie) ?? now)) : 0
  return {
    status,
    elapsedMs,
    /** 0 to 1: estimated while processing, full once ready */
    progress: status === 'ready' ? 1 : reading ? Math.min(ESTIMATE_CAP, 1 - Math.exp(-elapsedMs / EASE_MS)) : 0,
    /** Became ready while you watched it being read */
    justReady: status === 'ready' && !!selfie && watched.has(selfie),
    /** Starts polling again after `slow` or `unknown` */
    retry: () => setAttempt((n) => n + 1),
  }
}
