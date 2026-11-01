import { useEffect, useSyncExternalStore } from 'react'
import { getStoredUser } from '../../services/authService'
import {
  gradeFor,
  storiesApi,
  type CatalogueItem,
  type Passport,
  type Stamp,
  type StampResult,
  type TripPassport,
} from '../../services/storiesService'
import { FALLBACK_CATALOGUE } from './storiesData'

/**
 * What the Kaavad screens share: the story catalogue, your Heritage Passport and the squad's. Stamps that couldn't reach
 * the passport desk (offline, database down) are kept on this phone and shown with the rest, so a stamp is never lost.
 */

type LocalStamps = Record<string, { score: number; total: number; stampedAt: string }>

type State = {
  catalogue: CatalogueItem[]
  catalogueLoaded: boolean
  passport: Passport | null
  /** Whose passport it is, so signing in as someone else never shows the last person's stamps */
  passportUserId: string | null
  passportFailed: boolean
  squad: TripPassport | null
  squadTripId: string | null
  local: LocalStamps
}

const currentUserId = () => getStoredUser()?.id ?? null
const localKey = () => `ghoommates:stamps:${currentUserId() ?? 'guest'}`

function readLocal(): LocalStamps {
  try {
    return JSON.parse(localStorage.getItem(localKey()) ?? '{}') as LocalStamps
  } catch {
    return {}
  }
}

let state: State = {
  catalogue: FALLBACK_CATALOGUE,
  catalogueLoaded: false,
  passport: null,
  passportUserId: null,
  passportFailed: false,
  squad: null,
  squadTripId: null,
  local: readLocal(),
}

const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let catalogueRequest: Promise<void> | null = null
let passportRequest: Promise<void> | null = null

export const storiesStore = {
  get: () => state,

  loadCatalogue() {
    if (state.catalogueLoaded) return Promise.resolve()
    catalogueRequest ??= storiesApi
      .catalogue()
      .then((catalogue) => set({ catalogue, catalogueLoaded: true }))
      // Keep the built-in painted stories; try again next time
      .catch(() => undefined)
      .finally(() => {
        catalogueRequest = null
      })
    return catalogueRequest
  },

  /** Your passport; pass `force` after stamping to see the new stamp */
  loadPassport(force = false) {
    const userId = currentUserId()
    if (state.passport && state.passportUserId === userId && !force) return Promise.resolve()
    if (passportRequest) return passportRequest
    passportRequest = storiesApi
      .passport()
      .then((passport) => set({ passport, passportUserId: userId, passportFailed: false, local: readLocal() }))
      .catch(() => set({ passportFailed: true, local: readLocal(), ...(state.passportUserId === userId ? {} : { passport: null, passportUserId: null }) }))
      .finally(() => {
        passportRequest = null
      })
    return passportRequest
  },

  loadSquad(tripId: string) {
    return storiesApi
      .tripPassport(tripId)
      .then((squad) => set({ squad, squadTripId: tripId }))
      .catch(() => (state.squadTripId === tripId ? undefined : set({ squad: null, squadTripId: tripId })))
  },

  /** A stamp the passport desk could not take stays on the phone */
  keepOnPhone(siteId: string, score: number, total: number) {
    const local = { ...readLocal() }
    const best = local[siteId]
    if (!best || score > best.score) local[siteId] = { score, total, stampedAt: new Date().toISOString() }
    try {
      localStorage.setItem(localKey(), JSON.stringify(local))
    } catch {
      // Blocked storage: shown until the page reloads
    }
    set({ local })
  },

  /** Updates what the screens show right after a stamp, before the passport reloads */
  recordStamp(result: StampResult) {
    if (!state.passport || state.passportUserId !== currentUserId()) return
    const stamp: Stamp = { siteId: result.siteId, score: result.best.score, total: result.best.total, grade: result.best.grade, stampedAt: new Date().toISOString() }
    const stamps = [...state.passport.stamps.filter((s) => s.siteId !== stamp.siteId), stamp]
    set({
      passport: {
        ...state.passport,
        stamped: stamps.length,
        stamps,
        sites: state.passport.sites.map((s) => (s.siteId === stamp.siteId ? { ...s, stamp } : s)),
      },
    })
  },

  /** Signing out drops the previous person's passport */
  reset() {
    set({ passport: null, passportUserId: null, passportFailed: false, squad: null, squadTripId: null, local: readLocal() })
  },
}

/** Every stamp you hold: the passport's, plus any kept on this phone */
export function myStamps(s: State): Map<string, Stamp> {
  const stamps = new Map<string, Stamp>()
  const mine = s.passport && s.passportUserId === currentUserId()
  for (const stamp of (mine ? s.passport?.stamps : undefined) ?? []) stamps.set(stamp.siteId, stamp)
  for (const [siteId, local] of Object.entries(s.local)) {
    const existing = stamps.get(siteId)
    if (!existing || local.score > existing.score) {
      stamps.set(siteId, { siteId, score: local.score, total: local.total, grade: gradeFor(local.score, local.total), stampedAt: local.stampedAt })
    }
  }
  return stamps
}

/** The story catalogue and your stamps; loads both on first use */
export function useStories({ passport = true }: { passport?: boolean } = {}) {
  const snapshot = useSyncExternalStore(subscribe, () => state)
  useEffect(() => {
    void storiesStore.loadCatalogue()
    if (passport) void storiesStore.loadPassport()
  }, [passport])
  return { ...snapshot, stamps: myStamps(snapshot) }
}
