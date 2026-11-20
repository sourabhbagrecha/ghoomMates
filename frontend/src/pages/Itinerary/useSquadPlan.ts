import { useCallback, useEffect, useState } from 'react'
import { activeTrip } from '../../data/activeTrip'
import { subscribeAuth } from '../../services/authService'
import { prefsApi, type SquadInsights } from '../../services/prefsService'
import { splitSlotStops, tripsApi, type DraftBasis, type DraftFairness, type TripDetail } from '../../services/tripsService'

/*
 * Data for the Itinerary tab's squad swipe card and stale banner. Insights and deck sizes are kept per trip for the
 * session, so coming back to the tab shows the last answer at once (no skeleton) and refreshes it quietly.
 */

const insightsCache = new Map<string, SquadInsights>()
const deckTotals = new Map<string, number>()

// Another account signing in must not see the previous one's squad
subscribeAuth(() => {
  insightsCache.clear()
  deckTotals.clear()
})

type InsightsEntry = { tripId: string; insights: SquadInsights | null; failed: boolean }

/** GET /trips/:id/squad. `loading` only before the first answer for this trip; `failed` when it couldn't load. */
export function useSquadInsights(tripId: string) {
  const [entry, setEntry] = useState<InsightsEntry | null>(null)

  useEffect(() => {
    let live = true
    prefsApi.squad(tripId).then(
      (insights) => {
        insightsCache.set(tripId, insights)
        if (live) setEntry({ tripId, insights, failed: false })
      },
      () => {
        if (live) setEntry({ tripId, insights: insightsCache.get(tripId) ?? null, failed: !insightsCache.has(tripId) })
      },
    )
    return () => {
      live = false
    }
  }, [tripId])

  const current = entry?.tripId === tripId ? entry : null
  const insights = current?.insights ?? insightsCache.get(tripId) ?? null
  return { insights, loading: !insights && !current, failed: !insights && !!current?.failed }
}

/** How many cards the trip's deck has, for "3 of 24 done"; null until known (or when the deck can't load) */
export function useDeckTotal(tripId: string) {
  const [total, setTotal] = useState<{ tripId: string; total: number } | null>(null)

  useEffect(() => {
    if (deckTotals.has(tripId)) return
    let live = true
    prefsApi.tripDeck(tripId).then(
      (deck) => {
        deckTotals.set(tripId, deck.total)
        if (live) setTotal({ tripId, total: deck.total })
      },
      () => {},
    )
    return () => {
      live = false
    }
  }, [tripId])

  return deckTotals.get(tripId) ?? (total?.tripId === tripId ? total.total : null)
}

type PlanState = { tripId: string; stale: boolean; pending: string[] }

/**
 * Whether mates changed their swipes since the plan was made, and who hasn't swiped. Read fresh each time the tab
 * opens; the days that come with it refresh the shared itinerary too.
 */
export function usePlanState(tripId: string) {
  const [state, setState] = useState<PlanState | null>(null)

  useEffect(() => {
    let live = true
    tripsApi.itineraryState(tripId).then(
      (fresh) => {
        if (!live) return
        setState({ tripId, stale: fresh.stale, pending: fresh.pending })
        activeTrip.setItinerary(tripId, fresh.days)
      },
      // The day plan has its own loading and error handling; without this the banner just stays hidden
      () => {},
    )
    return () => {
      live = false
    }
  }, [tripId])

  const current = state?.tripId === tripId ? state : null
  /** A plan was just generated: it reflects everyone's latest swipes */
  const markFresh = useCallback((pending?: string[]) => {
    setState((s) => (s ? { ...s, stale: false, pending: pending ?? s.pending } : { tripId, stale: false, pending: pending ?? [] }))
  }, [tripId])

  return { stale: current?.stale ?? false, pending: current?.pending ?? null, markFresh }
}

/** Where a generate tap came from, so the confirm and any error show next to the button that was tapped */
export type PlanSurface = 'card' | 'banner'

export type GeneratedPlan = { fairness: DraftFairness | null; basis: DraftBasis | null }

/**
 * Asks GhoomMate for a plan from everyone's swipes and saves it as the itinerary. Works with any number of mates
 * answered. Replacing a plan that has stops takes a second tap.
 */
export function usePlanGenerator(trip: TripDetail, hasPlan: boolean, onSaved: (basis: DraftBasis | null) => void) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<PlanSurface | null>(null)
  const [error, setError] = useState<{ from: PlanSurface; message: string } | null>(null)
  const [result, setResult] = useState<GeneratedPlan | null>(null)

  const generate = async (from: PlanSurface) => {
    if (busy) return
    setError(null)
    if (hasPlan && confirming !== from) return setConfirming(from)
    setBusy(true)
    try {
      const plan = await tripsApi.draft(trip.id)
      // Each slot lists GhoomMate's pick first, then alternatives; a split slot keeps every camp's option
      const days = plan.days.map((d) => ({
        title: d.title,
        stops: d.slots.flatMap((slot) => (slot[0]?.split ? splitSlotStops(slot) : slot.slice(0, 1))),
      }))
      activeTrip.setItinerary(trip.id, await tripsApi.saveItinerary(trip.id, days))
      setResult({ fairness: plan.fairness ?? null, basis: plan.basis ?? null })
      setConfirming(null)
      onSaved(plan.basis ?? null)
    } catch (err) {
      setError({ from, message: err instanceof Error ? err.message : 'Could not build the plan' })
    } finally {
      setBusy(false)
    }
  }

  return { busy, confirming, error, result, generate }
}

export type PlanGenerator = ReturnType<typeof usePlanGenerator>
