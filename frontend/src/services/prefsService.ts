// Vibe Swipe API: decks, answers and squad insights. Mirrors backend/src/prefs/contract.ts.
import type { Answer, Axis, Card, CardPlace, Dealbreaker, Diet, Persona, StyleKey, Taste, Vibe } from '../data/taste'
import { request } from './tripsService'

export type StoredTaste = Taste & { updatedAt: string }

export type TasteSummary = {
  vibe: Vibe
  confidence: Vibe
  overall: number
  style: Record<StyleKey, number>
  styleConfidence: Record<StyleKey, number>
  topTags: string[]
  dealbreakers: Dealbreaker[]
  diet: Diet | null
  persona: Persona
  answered: number
}

export type CoreDeck = { scope: 'core'; cards: Card[] }
export type TripDeck = { scope: 'trip'; tripId: string; city: string | null; cards: Card[]; answered: Answer[]; total: number }

export type AnswersRequest = { scope: 'core'; answers: Answer[] } | { scope: 'trip'; tripId: string; answers: Answer[] }
export type AnswersResponse = { taste: StoredTaste; summary: TasteSummary }
export type MeResponse = { taste: StoredTaste | null; summary: TasteSummary | null; answers: { core: Answer[] } }
export type ResetResponse = { taste: StoredTaste | null; summary: TasteSummary | null }

export type AxisClass = 'love' | 'split' | 'veto' | 'neutral'
export type StyleRule = 'least-misery' | 'median' | 'mean' | 'most-pleasure'

export type SquadMember = {
  userId: string
  name: string
  colour: string | null
  picture: string | null
  persona: string | null
  vibe: Vibe | null
  confidence: number
  coreDone: boolean
  tripAnswered: number
  isMe: boolean
}

export type SquadInsights = {
  tripId: string
  city: string | null
  members: SquadMember[]
  pending: string[]
  axes: Record<Axis, { mean: number; min: number; max: number; class: AxisClass }>
  sharedLoves: Axis[]
  splits: Axis[]
  vetoes: Axis[]
  style: Record<StyleKey, { value: number; rule: StyleRule; label: string }>
  diet: Diet | null
  dealbreakers: Dealbreaker[]
  mustDos: { cardId: string; title: string; fans: string[] }[]
  consensus: { cardId: string; title: string; likes: number; answered: number; fans: string[] }[]
  contested: { cardId: string; title: string; fans: string[] }[]
  twin: { name: string; match: number } | null
  squadPersona: string | null
}

/** Why a stop is on the plan (draft stops and saved stops) */
export type StopWhy = {
  axis?: Axis | 'group' | null
  forMembers?: string[]
  split?: boolean
  why?: string | null
  cardId?: string | null
}

export type { CardPlace }

const enc = encodeURIComponent

export const prefsApi = {
  /** Public: works before sign-up */
  coreDeck: () => request<{ deck: CoreDeck }>('/api/prefs/deck/core').then((r) => r.deck),
  tripDeck: (tripId: string) => request<{ deck: TripDeck }>(`/api/prefs/trips/${enc(tripId)}/deck`).then((r) => r.deck),
  me: () => request<MeResponse>('/api/prefs/me'),
  answer: (body: AnswersRequest) => request<AnswersResponse>('/api/prefs/answers', { method: 'POST', body }),
  resetCore: () => request<ResetResponse>('/api/prefs/reset', { method: 'POST', body: { scope: 'core' } }),
  squad: (tripId: string) => request<SquadInsights>(`/api/trips/${enc(tripId)}/squad`),
}
