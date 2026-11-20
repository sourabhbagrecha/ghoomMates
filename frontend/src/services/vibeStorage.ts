import { fetchCurrentUser, getStoredUser, updateUserProfile, type AuthUser } from './authService'
import { prefsApi, type AnswersResponse } from './prefsService'
import { ApiRequestError } from './tripsService'
import { VIBE_AXES, type VibeScores } from '../data/vibe'
import { AXES, personaFor, type Answer, type Taste } from '../data/taste'

// Your vibe lives on your profile (users.preferences: taste, vibe, persona), where GhoomMate, the squad spiderweb and the
// itinerary read it. Vibe Swipe answers are kept on this device as a draft per deck while you swipe: signed in, they go
// to the server in small batches; signed out, the core deck's draft waits here until you sign in, then moves to your
// profile. A draft made by another account on this device is never read.

// ---- Legacy six-number vibe (users.preferences.vibe) ----

const PENDING_KEY = 'ghoommates:vibe:pending'

const asScores = (saved: unknown): VibeScores | null => {
  if (typeof saved !== 'object' || saved === null) return null
  const scores = saved as Record<string, unknown>
  return VIBE_AXES.every(({ id }) => typeof scores[id] === 'number') ? (saved as VibeScores) : null
}

function loadPendingVibe(): VibeScores | null {
  try {
    return asScores(JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null'))
  } catch {
    return null
  }
}

function clearPendingVibe() {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    // Blocked storage: nothing was kept
  }
}

/** Your vibe: signed in, your profile's; signed out, the one swiped on this device. Null until you've swiped. */
export function loadVibe(): VibeScores | null {
  const user = getStoredUser()
  return user ? asScores(user.preferences?.vibe) : loadPendingVibe()
}

/** Signed in: writes preferences.vibe (and refreshes the cached user). Signed out: keeps it on this device. */
export function saveVibe(scores: VibeScores): void {
  if (getStoredUser()) {
    clearPendingVibe()
    void updateUserProfile({ preferences: { vibe: scores } }).catch((error) => console.warn('Could not save vibe:', error))
    return
  }
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(scores))
  } catch {
    // Private mode / blocked storage: swipe again after signing in
  }
}

/** The badges of the taste saved on your profile ("Early bird", "Crowd dodger"); empty without one */
export function profileBadges(): string[] {
  const taste = getStoredUser()?.preferences?.taste as Partial<Taste> | undefined
  const valid =
    !!taste &&
    typeof taste.axes === 'object' &&
    AXES.every((axis) => typeof taste.axes?.[axis]?.a === 'number' && typeof taste.axes[axis].b === 'number') &&
    typeof taste.style === 'object'
  return valid ? personaFor(taste as Taste).badges : []
}

// ---- Vibe Swipe drafts ----

/** 'core' for the travel-style deck, `trip:<tripId>` for a trip's deck */
export type SwipeScope = 'core' | `trip:${string}`
export const CORE_SCOPE: SwipeScope = 'core'
export const tripScope = (tripId: string): SwipeScope => `trip:${tripId}`
const tripIdOf = (scope: SwipeScope) => (scope.startsWith('trip:') ? scope.slice(5) : null)

export type SwipeDraft = {
  /** In the order they were given; one per card */
  answers: Answer[]
  /** answerKey() of the answers the server already has */
  sent: string[]
  /** Who swiped; null when signed out (picked up by whoever signs in next) */
  userId: string | null
  /** Every card in the deck has an answer */
  done: boolean
  updatedAt: string
}

const DRAFT_PREFIX = 'ghoommates:swipe:'
/** The most answers one POST takes */
const MAX_BATCH = 60

export const answerKey = (answer: Answer) => `${answer.cardId}|${JSON.stringify(answer.reply)}`
export const unsentAnswers = (draft: SwipeDraft) => {
  const sent = new Set(draft.sent)
  return draft.answers.filter((a) => !sent.has(answerKey(a)))
}

const isAnswer = (value: unknown): value is Answer => {
  const a = value as Answer | null
  return !!a && typeof a.cardId === 'string' && typeof a.reply === 'object' && a.reply !== null && typeof a.reply.kind === 'string' && typeof a.ms === 'number'
}

function asDraft(saved: unknown): SwipeDraft | null {
  const d = saved as Partial<SwipeDraft> | null
  if (!d || !Array.isArray(d.answers) || !d.answers.every(isAnswer)) return null
  return {
    answers: d.answers,
    sent: Array.isArray(d.sent) ? d.sent.filter((k): k is string => typeof k === 'string') : [],
    userId: typeof d.userId === 'string' ? d.userId : null,
    done: d.done === true,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : new Date(0).toISOString(),
  }
}

// Memory first, so swiping still works when storage is blocked; localStorage keeps it across reloads
const drafts = new Map<SwipeScope, SwipeDraft | null>()
const listeners = new Set<() => void>()

function rawDraft(scope: SwipeScope): SwipeDraft | null {
  if (!drafts.has(scope)) {
    let draft: SwipeDraft | null = null
    try {
      draft = asDraft(JSON.parse(localStorage.getItem(DRAFT_PREFIX + scope) ?? 'null'))
    } catch {
      // Unreadable: start fresh
    }
    drafts.set(scope, draft)
  }
  return drafts.get(scope) ?? null
}

/** Your draft for a deck: yours, or one made signed out on this device. Same object until it changes. */
export function readSwipeDraft(scope: SwipeScope): SwipeDraft | null {
  const draft = rawDraft(scope)
  if (!draft) return null
  return draft.userId === null || draft.userId === (getStoredUser()?.id ?? null) ? draft : null
}

export function writeSwipeDraft(scope: SwipeScope, draft: SwipeDraft | null) {
  drafts.set(scope, draft)
  try {
    if (draft) localStorage.setItem(DRAFT_PREFIX + scope, JSON.stringify(draft))
    else localStorage.removeItem(DRAFT_PREFIX + scope)
  } catch {
    // Blocked storage: the draft lives until reload
  }
  listeners.forEach((listener) => listener())
}

export function clearSwipeDraft(scope: SwipeScope) {
  answeredHere.delete(scope)
  writeSwipeDraft(scope, null)
}

/** Cards answered in this tab, per deck, oldest first. Only these can be undone: an answer from another visit has no card on screen to bring back. */
const answeredHere = new Map<SwipeScope, string[]>()

/** The draft's last answer was made in this tab, so Undo can bring its card back */
export function canUndoAnswer(scope: SwipeScope, draft = readSwipeDraft(scope)): boolean {
  const last = draft?.answers.at(-1)
  return !!last && answeredHere.get(scope)?.at(-1) === last.cardId
}

export function subscribeSwipeDrafts(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const emptyDraft = (): SwipeDraft => ({ answers: [], sent: [], userId: null, done: false, updatedAt: new Date().toISOString() })

/** Keeps only the sent keys that still match an answer */
const withAnswers = (draft: SwipeDraft, answers: Answer[], done: boolean): SwipeDraft => {
  const keys = new Set(answers.map(answerKey))
  return {
    answers,
    sent: draft.sent.filter((k) => keys.has(k)),
    userId: getStoredUser()?.id ?? draft.userId,
    done,
    updatedAt: new Date().toISOString(),
  }
}

/** Adds (or replaces) the answer to one card. `done` says whether that was the deck's last card. */
export function recordAnswer(scope: SwipeScope, answer: Answer, done: boolean): SwipeDraft {
  const draft = readSwipeDraft(scope) ?? emptyDraft()
  const next = withAnswers(draft, [...draft.answers.filter((a) => a.cardId !== answer.cardId), answer], done)
  answeredHere.set(scope, [...(answeredHere.get(scope) ?? []).filter((id) => id !== answer.cardId), answer.cardId])
  writeSwipeDraft(scope, next)
  return next
}

/** Drops the last answer so its card goes back on top, if it was made in this tab; returns it */
export function undoAnswer(scope: SwipeScope): Answer | null {
  const draft = readSwipeDraft(scope)
  const last = draft?.answers.at(-1)
  if (!draft || !last || !canUndoAnswer(scope, draft)) return null
  answeredHere.set(scope, (answeredHere.get(scope) ?? []).slice(0, -1))
  writeSwipeDraft(scope, withAnswers(draft, draft.answers.slice(0, -1), false))
  return last
}

/**
 * Lines this device's draft up with the deck as served: answers to cards no longer in it go (the server would refuse
 * the whole batch), answers the server already has (another device, an earlier visit) go under the ones made here,
 * and the draft is done when every card has an answer.
 */
export function syncWithDeck(scope: SwipeScope, cardIds: string[], server: Answer[] = []) {
  const draft = readSwipeDraft(scope)
  const inDeck = new Set(cardIds)
  const local = (draft?.answers ?? []).filter((a) => inDeck.has(a.cardId))
  const here = new Set(local.map((a) => a.cardId))
  const extra = server.filter((a) => inDeck.has(a.cardId) && !here.has(a.cardId))
  const answers = [...extra, ...local]
  const done = inDeck.size > 0 && new Set(answers.map((a) => a.cardId)).size >= inDeck.size
  if (!draft && !extra.length) return
  if (draft && !extra.length && local.length === draft.answers.length && done === draft.done) return
  const base = draft ?? emptyDraft()
  const keys = new Set(answers.map(answerKey))
  writeSwipeDraft(scope, {
    ...base,
    answers,
    sent: [...new Set([...base.sent, ...extra.map(answerKey)])].filter((k) => keys.has(k)),
    userId: getStoredUser()?.id ?? base.userId,
    done,
    updatedAt: new Date().toISOString(),
  })
}

/** Takes answers out of the draft (the server refused them), so their cards come back to be swiped again */
function dropAnswers(scope: SwipeScope, answers: Answer[]) {
  const draft = rawDraft(scope)
  if (!draft) return
  const gone = new Set(answers.map(answerKey))
  writeSwipeDraft(scope, withAnswers(draft, draft.answers.filter((a) => !gone.has(answerKey(a))), false))
}

function markSent(scope: SwipeScope, answers: Answer[]) {
  const draft = rawDraft(scope)
  if (!draft) return
  const sent = new Set([...draft.sent, ...answers.map(answerKey)])
  // An answer undone while its batch was in flight isn't in the draft any more, so its key is dropped too
  writeSwipeDraft(scope, { ...draft, sent: draft.answers.map(answerKey).filter((k) => sent.has(k)) })
}

async function sendUnsent(scope: SwipeScope): Promise<AnswersResponse | null> {
  const draft = readSwipeDraft(scope)
  if (!getStoredUser() || !draft) return null
  const unsent = unsentAnswers(draft)
  const tripId = tripIdOf(scope)
  let result: AnswersResponse | null = null
  for (let i = 0; i < unsent.length; i += MAX_BATCH) {
    const answers = unsent.slice(i, i + MAX_BATCH)
    try {
      result = await prefsApi.answer(tripId ? { scope: 'trip', tripId, answers } : { scope: 'core', answers })
      markSent(scope, answers)
    } catch (error) {
      if (!(error instanceof ApiRequestError && error.status === 400)) throw error
      // Retrying can't help (say a card left the deck after a release): drop the batch so later swipes still save
      console.warn('Dropped swipes the server refused:', error.message)
      dropAnswers(scope, answers)
    }
  }
  return result
}

const flushes = new Map<SwipeScope, Promise<AnswersResponse | null>>()

/**
 * Signed in: sends the draft's unsent answers (≤ 60 per request). Flushes for a deck run one after another, so a
 * batch never overtakes an earlier one. Resolves with the last response, or null when there was nothing to send.
 */
export function flushSwipes(scope: SwipeScope): Promise<AnswersResponse | null> {
  const previous = flushes.get(scope) ?? Promise.resolve(null)
  const next = previous.catch(() => null).then(() => sendUnsent(scope))
  flushes.set(scope, next)
  const forget = () => {
    if (flushes.get(scope) === next) flushes.delete(scope)
  }
  next.then(forget, forget)
  return next
}

// ---- Sign-in ----

let syncing = false

/**
 * Just signed in: swipes made signed out move to your profile (then the draft is cleared), and your own unsent swipes
 * are retried. With no swipes on this device, an old quiz result taken signed out moves over instead (unless the
 * profile already has a vibe).
 */
export function syncVibeToProfile(user: AuthUser | null) {
  if (syncing || !user) return
  const draft = rawDraft(CORE_SCOPE)

  if (draft?.answers.length && draft.userId === user.id) {
    if (unsentAnswers(draft).length) void flushSwipes(CORE_SCOPE).catch((error) => console.warn('Could not save swipes:', error))
    return
  }

  if (draft?.answers.length && draft.userId === null) {
    syncing = true
    // Adopted first, so a failed upload is retried as this account's own draft next time
    writeSwipeDraft(CORE_SCOPE, { ...draft, userId: user.id })
    void flushSwipes(CORE_SCOPE)
      .then(() => {
        // Swipes made while that upload was in flight stay, as this account's draft, and go up with the next flush
        const left = rawDraft(CORE_SCOPE)
        if (left && unsentAnswers(left).length) void flushSwipes(CORE_SCOPE).catch((error) => console.warn('Could not save swipes:', error))
        else clearSwipeDraft(CORE_SCOPE)
        clearPendingVibe()
        // The prefs module wrote taste, vibe and persona onto the profile: refresh the cached user
        return fetchCurrentUser()
      })
      .catch((error) => console.warn('Could not save swipes:', error))
      .finally(() => {
        syncing = false
      })
    return
  }

  const pending = loadPendingVibe()
  if (!pending) return
  if (asScores(user.preferences?.vibe)) return clearPendingVibe()
  syncing = true
  void updateUserProfile({ preferences: { vibe: pending } })
    .then(clearPendingVibe, (error) => console.warn('Could not save vibe:', error))
    .finally(() => {
      syncing = false
    })
}
