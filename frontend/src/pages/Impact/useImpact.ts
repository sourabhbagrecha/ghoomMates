import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { subscribeAuth } from '../../services/authService'
import { impactApi, type ImpactReport, type Leg, type Mode } from '../../services/impactService'
import { withLegMode, withPledge } from './impactData'

/**
 * The Green Trip report of each trip, shared by the Itinerary card and the Impact page so they always agree.
 * Opening either shows what is already there and refreshes it in the background. Switching a ride or ticking a
 * pledge updates the numbers at once and is then reconciled with the server's answer; a failure puts things back.
 */

/** `error` is a failed load; `saveError` a ride switch or pledge the server refused (the numbers were put back) */
type Entry = { report: ImpactReport | null; loading: boolean; error: string | null; saveError: string | null }

const EMPTY: Entry = { report: null, loading: false, error: null, saveError: null }

const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const entryOf = (tripId: string) => entries.get(tripId) ?? EMPTY
const update = (tripId: string, patch: Partial<Entry>) => {
  entries.set(tripId, { ...entryOf(tripId), ...patch })
  listeners.forEach((l) => l())
}

// Another account signing in must not see the previous one's pledges
subscribeAuth(() => {
  entries.clear()
  listeners.forEach((l) => l())
})

const message = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong')

const inflight = new Map<string, Promise<void>>()
/** Writes in flight per trip: while any are pending, a slower read must not overwrite their result */
const writes = new Map<string, number>()
const busy = (tripId: string) => (writes.get(tripId) ?? 0) > 0

function load(tripId: string): Promise<void> {
  const existing = inflight.get(tripId)
  if (existing) return existing
  // Only the very first load shows a skeleton; later ones refresh quietly
  if (!entryOf(tripId).report) update(tripId, { loading: true, error: null })
  const promise = impactApi
    .get(tripId)
    .then((report) => {
      if (!busy(tripId)) update(tripId, { report, loading: false, error: null })
    })
    .catch((err) => update(tripId, { loading: false, error: message(err) }))
    .finally(() => inflight.delete(tripId))
  inflight.set(tripId, promise)
  return promise
}

async function write<T>(tripId: string, optimistic: (report: ImpactReport) => ImpactReport, send: () => Promise<T>, apply: (report: ImpactReport, answer: T) => ImpactReport) {
  const before = entryOf(tripId).report
  if (!before) return
  writes.set(tripId, (writes.get(tripId) ?? 0) + 1)
  update(tripId, { report: optimistic(before), saveError: null })
  try {
    const answer = await send()
    writes.set(tripId, (writes.get(tripId) ?? 1) - 1)
    // Only the last answer in a quick run of taps is applied; it already includes the earlier ones
    if (!busy(tripId)) update(tripId, { report: apply(entryOf(tripId).report ?? before, answer) })
  } catch (err) {
    writes.set(tripId, (writes.get(tripId) ?? 1) - 1)
    update(tripId, { report: before, saveError: message(err) })
    if (!busy(tripId)) void load(tripId)
  }
}

export const impactStore = {
  load,

  /** Switches one ride for the whole squad (`null` goes back to the default) */
  setLegMode(tripId: string, leg: Pick<Leg, 'fromStopId' | 'toStopId'>, mode: Mode | null) {
    return write(
      tripId,
      (report) => withLegMode(report, leg, mode),
      () => impactApi.setLeg(tripId, leg, mode),
      (_report, fresh) => fresh,
    )
  },

  /** Ticks or unticks your own pledge */
  setPledge(tripId: string, pledgeId: string, taken: boolean, me: string) {
    return write(
      tripId,
      (report) => withPledge(report, pledgeId, taken, me),
      () => impactApi.setPledge(tripId, pledgeId, taken),
      (report, answer) => ({ ...report, pledges: answer.pledges, score: answer.score }),
    )
  },

  clearSaveError(tripId: string) {
    if (entryOf(tripId).saveError) update(tripId, { saveError: null })
  },
}

/**
 * The trip's impact report. `signature` changes when the plan does (a stop moved, added or removed), which refreshes it.
 * Without a trip id nothing is loaded.
 */
export function useImpact(tripId: string | null, signature = '') {
  const entry = useSyncExternalStore(subscribe, () => (tripId ? entryOf(tripId) : EMPTY))
  useEffect(() => {
    if (tripId) void load(tripId)
  }, [tripId, signature])
  const reload = useCallback(() => (tripId ? load(tripId) : Promise.resolve()), [tripId])
  return { report: entry.report, loading: entry.loading, error: entry.error, saveError: entry.saveError, reload }
}
