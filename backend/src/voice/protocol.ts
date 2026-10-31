// Shared contract between the GhoomMate agent worker, the session endpoint and
// the frontend overlay. The frontend mirrors this file in
// frontend/src/components/voice/protocol.ts; keep both in sync.

/**
 * Default explicit-dispatch name the worker registers with and session tokens request. LiveKit shares a project's
 * sessions across every worker with the same name, so in dev each person sets GHOOMATE_AGENT_NAME to their own
 * (see agentNameFrom); the deployed app keeps this one.
 */
export const AGENT_NAME = 'ghoomate';

/** The agent name for this machine: GHOOMATE_AGENT_NAME, else the shared default. Read it after loadEnv(). */
export const agentNameFrom = (env: Record<string, string | undefined> = process.env) => env.GHOOMATE_AGENT_NAME?.trim() || AGENT_NAME;

/** RPC the agent calls on the user's participant to drive on-screen UI. Payload: JSON UiEvent. */
export const UI_RPC_METHOD = 'ghoomate.ui';

/** RPC the frontend calls on the agent participant when a card button is tapped. Payload: JSON UiAction. */
export const ACTION_RPC_METHOD = 'ghoomate.action';

/** Response of POST /api/voice/session. */
export type VoiceSession = {
  serverUrl: string;
  participantToken: string;
  roomName: string;
  participantIdentity: string;
};

/** Agent dispatch metadata (JSON in the token's RoomAgentDispatch). It sits in the user's own LiveKit token,
 *  so it holds nothing the user may not see. */
export type DispatchMetadata = {
  tripId: string;
  userId: string;
  userName: string;
  /** Short-lived (2h) API JWT the agent uses to call the backend as this user. Not the user's 7-day session. */
  authToken: string;
};

export type ExpenseCategory = 'food' | 'stays' | 'travel' | 'fun' | 'other';

export type DraftShare = { memberId: string; name: string; amountPaise: number };

/** A proposed expense GhoomMate shows on screen before anything is written. */
export type ExpenseDraft = {
  id: string;
  description: string;
  amountPaise: number;
  category: ExpenseCategory;
  payer: { memberId: string; name: string };
  splitType: 'equal' | 'exact';
  shares: DraftShare[];
};

export type AddedExpense = {
  id: string;
  draftId: string;
  description: string;
  amountPaise: number;
  category: ExpenseCategory;
};

export type BalanceLine = { memberId: string; name: string; balancePaise: number };
export type TransferLine = { from: string; to: string; amountPaise: number };

export type Screen = 'expenses' | 'itinerary' | 'photos' | 'explore' | 'members' | 'reel';

/** Whose personality picks were ranked for: the speaker's quiz, the squad's blend, what they just asked for, or rating */
export type RecommendationBasis = 'you' | 'squad' | 'mood' | 'rating';

export type MemberFit = { memberId: string; name: string; matchPercent: number };

/** One recommended guide experience. The frontend looks up title, photo and price by id. */
export type ExperiencePick = {
  experienceId: string;
  /** 0–100 fit with the vibe; null when ranked by rating */
  matchPercent: number | null;
  /** Short label, e.g. "Adventure + food" */
  reason: string;
  /** One line on why it suits them, e.g. "You're big on adventure and food" */
  why: string;
  /** Next start, e.g. "Today · 04:30 PM" */
  when: string;
  /** Squad picks: the fit for each member who took the quiz */
  fits: MemberFit[];
};

export type DayPlanStop = { experienceId: string; start: string; end: string; matchPercent: number | null };

/** A proposed day of guide experiences GhoomMate shows before adding anything to the itinerary. */
export type DayPlan = {
  id: string;
  city: string;
  /** "Today", "Tomorrow" or "Wed, 4 Nov" */
  dayLabel: string;
  /** Itinerary day it would be added to; null when that date isn't part of the trip */
  dayNumber: number | null;
  basis: RecommendationBasis;
  stops: DayPlanStop[];
};

/** Agent → frontend. Add new variants here when a new skill needs UI. */
export type UiEvent =
  | { type: 'expense.draft'; draft: ExpenseDraft }
  | { type: 'expense.added'; expense: AddedExpense }
  | { type: 'expense.cancelled'; draftId: string }
  | { type: 'balances'; currency: string; balances: BalanceLine[]; transfers: TransferLine[] }
  | { type: 'navigate'; screen: Screen }
  | { type: 'experiences.recommended'; city: string; basis: RecommendationBasis; picks: ExperiencePick[] }
  | { type: 'experience.open'; experienceId: string }
  | { type: 'day.plan'; plan: DayPlan }
  | { type: 'day.plan.added'; planId: string; dayNumber: number; count: number }
  | { type: 'day.plan.cancelled'; planId: string }
  /** What GhoomMate is doing while a tool runs ("Checking balances…"); null when it's done */
  | { type: 'working'; label: string | null }
  /** A short confirmation pill, e.g. "Added 3 stops" */
  | { type: 'notice'; message: string }
  /** GhoomMate saved or dropped something it remembers about the speaker */
  | { type: 'memory.updated'; change: 'added' | 'removed'; note: string };

/** Frontend → agent. */
export type UiAction =
  | { type: 'confirm'; draftId: string }
  | { type: 'cancel'; draftId: string }
  | { type: 'plan.add'; planId: string }
  | { type: 'plan.cancel'; planId: string }
  | { type: 'experience.join'; experienceId: string };

/** Frontend hash routes for each Screen. */
export const SCREEN_ROUTES: Record<Screen, string> = {
  expenses: 'trip/expenses',
  itinerary: 'trip/itinerary',
  photos: 'trip/photos',
  explore: 'trip/explore',
  members: 'trip/members',
  reel: 'trip/photos/reel',
};

/** Frontend hash route of one guide experience */
export const experienceRoute = (experienceId: string) => `trip/explore/guide/${encodeURIComponent(experienceId)}`;
