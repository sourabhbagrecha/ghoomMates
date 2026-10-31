import { formatINR } from '../../pages/Trip/tripFormat'
import {
  SCREEN_ROUTES,
  experienceRoute,
  type BalanceLine,
  type DayPlan,
  type ExpenseDraft,
  type ExperiencePick,
  type RecommendationBasis,
  type TransferLine,
  type UiEvent,
} from './protocol'
import type { Notice } from './voiceContext'

/*
 * The frontend half of GhoomMate's skills. The agent pushes a `UiEvent` over the `ghoomate.ui` RPC and
 * `useGhoomMateUi` dispatches it here by `type`. A handler may swap the card on the sheet (and `show` it if the
 * sheet is minimised), show the notice pill, navigate (which minimises the sheet) or refresh data.
 *
 * Adding a skill with UI (e.g. `reel.ready`):
 *   1. add the event to the `UiEvent` union in protocol.ts (both copies),
 *   2. add one handler to `UI_EVENT_HANDLERS` below,
 *   3. if it shows a card, add a `UiCard` variant and its renderer in GhoomMateCard.tsx.
 */

/** What the sheet shows under the transcript. One card at a time; the newest event wins. */
export type UiCard =
  | { kind: 'expense'; draft: ExpenseDraft; status: 'draft' | 'added' }
  | { kind: 'balances'; currency: string; balances: BalanceLine[]; transfers: TransferLine[] }
  | { kind: 'experiences'; city: string; basis: RecommendationBasis; picks: ExperiencePick[] }
  | { kind: 'dayPlan'; plan: DayPlan; status: 'draft' | 'added' }

/** The latest change GhoomMate made to what it remembers, shown briefly in the sheet */
export type MemoryUpdate = { change: 'added' | 'removed'; note: string; at: number }

/** Side effects a handler can use */
export type UiEffects = {
  setCard: (update: (card: UiCard | null) => UiCard | null) => void
  /** Brings the sheet back up if it was minimised, for a new card the user should see */
  show: () => void
  /** What GhoomMate is busy with, shown as its status; null when done */
  setWorking: (label: string | null) => void
  /** GhoomMate saved or dropped a memory */
  setMemoryUpdate: (update: MemoryUpdate) => void
  notify: (notice: Notice) => void
  navigate: (route: string) => void
  refreshMoney: () => void
  refreshItinerary: () => void
}

type UiEventType = UiEvent['type']
type UiEventHandlers = { [T in UiEventType]: (event: Extract<UiEvent, { type: T }>, fx: UiEffects) => void }

/** ₹250, ₹1,890 or ₹99.50, in Indian digit grouping */
export function formatPaise(paise: number) {
  if (paise % 100 === 0) return formatINR(paise / 100)
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export const UI_EVENT_HANDLERS: UiEventHandlers = {
  'expense.draft': ({ draft }, fx) => {
    fx.setCard(() => ({ kind: 'expense', draft, status: 'draft' }))
    fx.show()
  },

  'expense.added': ({ expense }, fx) => {
    fx.setCard((card) =>
      card?.kind === 'expense' && card.draft.id === expense.draftId ? { ...card, status: 'added' } : card,
    )
    fx.refreshMoney()
    fx.notify({
      message: `${formatPaise(expense.amountPaise)} ${capitalise(expense.description)} added`,
      action: { label: 'View', route: SCREEN_ROUTES.expenses },
    })
  },

  'expense.cancelled': ({ draftId }, fx) =>
    fx.setCard((card) => (card?.kind === 'expense' && card.draft.id === draftId ? null : card)),

  balances: ({ currency, balances, transfers }, fx) => {
    fx.setCard(() => ({ kind: 'balances', currency, balances, transfers }))
    fx.show()
  },

  navigate: ({ screen }, fx) => {
    const route = SCREEN_ROUTES[screen]
    if (route) fx.navigate(route)
  },

  'experiences.recommended': ({ city, basis, picks }, fx) => {
    fx.setCard(() => ({ kind: 'experiences', city, basis, picks }))
    fx.show()
  },

  'experience.open': ({ experienceId }, fx) => fx.navigate(experienceRoute(experienceId)),

  'day.plan': ({ plan }, fx) => {
    fx.setCard(() => ({ kind: 'dayPlan', plan, status: 'draft' }))
    fx.show()
  },

  'day.plan.added': ({ planId, dayNumber, count }, fx) => {
    fx.setCard((card) => (card?.kind === 'dayPlan' && card.plan.id === planId ? { ...card, status: 'added' } : card))
    fx.refreshItinerary()
    fx.notify({
      message: `${count} ${count === 1 ? 'stop' : 'stops'} added to Day ${dayNumber}`,
      action: { label: 'View', route: SCREEN_ROUTES.itinerary },
    })
  },

  'day.plan.cancelled': ({ planId }, fx) =>
    fx.setCard((card) => (card?.kind === 'dayPlan' && card.plan.id === planId ? null : card)),

  working: ({ label }, fx) => fx.setWorking(label),

  notice: ({ message }, fx) => fx.notify({ message }),

  'memory.updated': ({ change, note }, fx) => fx.setMemoryUpdate({ change, note, at: Date.now() }),
}

/** A UiEvent from an RPC payload, or null for junk and event types this build doesn’t know yet */
export function parseUiEvent(payload: string): UiEvent | null {
  try {
    const value: unknown = JSON.parse(payload)
    if (value && typeof value === 'object' && 'type' in value && typeof value.type === 'string') {
      if (Object.hasOwn(UI_EVENT_HANDLERS, value.type)) return value as UiEvent
    }
  } catch {
    // fall through
  }
  return null
}

export function dispatchUiEvent(event: UiEvent, fx: UiEffects) {
  const handler = UI_EVENT_HANDLERS[event.type] as (event: UiEvent, fx: UiEffects) => void
  handler(event, fx)
}
