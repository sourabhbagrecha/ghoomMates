// Vibe Swipe contract between the prefs module (decks, answers, taste), the trips module (squad insights,
// itinerary) and the app. Shapes only; frontend/src/services/prefsService.ts mirrors the API types.
import type { Answer, Axis, Card, CardFormat, CardPlace, Dealbreaker, Diet, Persona, Reply, StyleKey, Taste, Vibe } from './taste.ts';

export type CardKind = 'style' | 'experience' | 'maker' | 'archetype';

/**
 * pref_answers: one per (user_id, scope, card_id); answering a card again overwrites it.
 * `card` is a snapshot taken when the answer is stored, so the trips module can do group maths
 * (consensus, shortlist, why-lines) from this collection alone without importing deck code.
 */
export type PrefAnswerDoc = {
  user_id: string;
  /** 'core' for the travel-style deck, otherwise the trip id */
  scope: string;
  card_id: string;
  format: CardFormat;
  reply: Reply;
  ms: number;
  card: {
    title: string;
    kind: CardKind;
    axes: Partial<Vibe>;
    tags: string[];
    /** Trip cards: 'Udaipur' | 'Goa' for catalogue items */
    city?: string;
    place?: CardPlace;
  };
  created_at: Date;
  updated_at: Date;
};

/** Trip card ids: `exp:<experience id>` (voice/experiences.ts EXPERIENCES), `maker:<maker id>` (makers/makers.ts),
 * `host:<id>` (hospitality), `gen:<archetype id>` (generic activity deck for other destinations) */
export const TRIP_CARD_PREFIXES = ['exp:', 'maker:', 'host:', 'gen:'] as const;

/**
 * What the prefs module writes onto users.preferences after every answers POST (dot-path $set, so other
 * preference keys are untouched): taste (+ updatedAt ISO string), vibe (posterior means, read by VibeChart,
 * voice and the old code paths), persona (the name string; trips/service.ts members() already exposes it),
 * and diet when the diet card was answered (hospitality reads preferences.diet).
 */
export type StoredTaste = Taste & { updatedAt: string };

export type TasteSummary = {
  vibe: Vibe;
  confidence: Vibe;
  overall: number;
  style: Record<StyleKey, number>;
  styleConfidence: Record<StyleKey, number>;
  topTags: string[];
  dealbreakers: Dealbreaker[];
  diet: Diet | null;
  persona: Persona;
  answered: number;
};

// ---- /api/prefs (prefs module) ----

/** GET /api/prefs/deck/core — public (the quiz runs before sign-up) */
export type CoreDeckResponse = { deck: { scope: 'core'; cards: Card[] } };

/** GET /api/prefs/trips/:tripId/deck — members only. Unanswered cards first in adaptive order, then the ones
 * you already answered (so you can change your mind). `fans` on each card = other members' likes/loves. */
export type TripDeckResponse = {
  deck: { scope: 'trip'; tripId: string; city: string | null; cards: Card[]; answered: Answer[]; total: number };
};

/** GET /api/prefs/me — signed in */
export type MeResponse = { taste: StoredTaste | null; summary: TasteSummary | null; answers: { core: Answer[] } };

/** POST /api/prefs/answers — signed in; upserts up to 60 answers, re-scores everything, writes preferences */
export type AnswersRequest = { scope: 'core'; answers: Answer[] } | { scope: 'trip'; tripId: string; answers: Answer[] };
export type AnswersResponse = { taste: StoredTaste; summary: TasteSummary };

/** POST /api/prefs/reset { scope: 'core' } — retake: deletes your core answers and re-scores */
export type ResetResponse = { taste: StoredTaste | null; summary: TasteSummary | null };

// ---- GET /api/trips/:tripId/squad (trips module) ----

export type AxisClass = 'love' | 'split' | 'veto' | 'neutral';
export type StyleRule = 'least-misery' | 'median' | 'mean' | 'most-pleasure';

export type SquadMember = {
  userId: string;
  name: string;
  colour: string | null;
  picture: string | null;
  persona: string | null;
  vibe: Vibe | null;
  /** 0–1, how much we know about them */
  confidence: number;
  /** Has swiped at least one core card (a legacy-quiz member has a vibe but no swipes yet) */
  coreDone: boolean;
  /** Your own trip-deck answers, skips included; 0 for everyone else, so no one can work out another member's nopes */
  tripAnswered: number;
  isMe: boolean;
};

export type SquadInsights = {
  tripId: string;
  city: string | null;
  members: SquadMember[];
  /** Members with no taste data at all (left out of the maths); matches the itinerary's basis.pending */
  pending: string[];
  axes: Record<Axis, { mean: number; min: number; max: number; class: AxisClass }>;
  sharedLoves: Axis[];
  splits: Axis[];
  vetoes: Axis[];
  /** The group value per style dimension, the rule that set it and a one-line human label */
  style: Record<StyleKey, { value: number; rule: StyleRule; label: string }>;
  /** Strictest diet in the squad */
  diet: Diet | null;
  /** Union of everyone's hard noes, never attributed */
  dealbreakers: Dealbreaker[];
  /** Trip cards someone loved: they'll get these as spotlights */
  mustDos: { cardId: string; title: string; fans: string[] }[];
  /** Trip cards nobody said no to, best first: whole-group picks */
  consensus: { cardId: string; title: string; likes: number; answered: number; fans: string[] }[];
  /** Cards with fans and at least one no (who said no is never shown): split-slot material */
  contested: { cardId: string; title: string; fans: string[] }[];
  /** The mate whose vibe is closest to yours */
  twin: { name: string; match: number } | null;
  squadPersona: string | null;
};

// ---- itinerary additions (trips module) ----

/** Extra fields a draft stop and a saved trip_stops document carry so the app can say why a stop is there */
export type StopWhy = {
  axis?: Axis | 'group' | null;
  /** First names it was planned for (empty for whole-group stops) */
  forMembers?: string[];
  split?: boolean;
  /** ≤ 120 chars, e.g. 'Riya’s must-do' or 'Everyone’s in · 4 of 4 liked'. Never mentions who said no. */
  why?: string | null;
  /** Trip card it came from, e.g. 'exp:pichola-sunset-boat' */
  cardId?: string | null;
};
