// Mirror of backend/src/voice/protocol.ts: the contract between the GhoomMate
// agent worker and this overlay. Keep both files in sync.

export const AGENT_NAME = 'ghoomate';
export const UI_RPC_METHOD = 'ghoomate.ui';
export const ACTION_RPC_METHOD = 'ghoomate.action';

export type VoiceSession = {
  serverUrl: string;
  participantToken: string;
  roomName: string;
  participantIdentity: string;
};

export type ExpenseCategory = 'food' | 'stays' | 'travel' | 'fun' | 'other';

export type DraftShare = { memberId: string; name: string; amountPaise: number };

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

export type RecommendationBasis = 'you' | 'squad' | 'mood' | 'rating';

export type MemberFit = { memberId: string; name: string; matchPercent: number };

export type ExperiencePick = {
  experienceId: string;
  matchPercent: number | null;
  reason: string;
  why: string;
  when: string;
  fits: MemberFit[];
};

export type DayPlanStop = { experienceId: string; start: string; end: string; matchPercent: number | null };

export type DayPlan = {
  id: string;
  city: string;
  dayLabel: string;
  dayNumber: number | null;
  basis: RecommendationBasis;
  stops: DayPlanStop[];
};

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
  | { type: 'working'; label: string | null }
  | { type: 'notice'; message: string }
  /** GhoomMate hung up (the call sat idle); the app closes the call instead of showing it as dropped */
  | { type: 'call.ended'; reason: 'idle' }
  | { type: 'memory.updated'; change: 'added' | 'removed'; note: string };

export type UiAction =
  | { type: 'confirm'; draftId: string }
  | { type: 'cancel'; draftId: string }
  | { type: 'plan.add'; planId: string }
  | { type: 'plan.cancel'; planId: string }
  | { type: 'experience.join'; experienceId: string };

export const SCREEN_ROUTES: Record<Screen, string> = {
  expenses: 'trip/expenses',
  itinerary: 'trip/itinerary',
  photos: 'trip/photos',
  explore: 'trip/explore',
  members: 'trip/members',
  reel: 'trip/photos/reel',
};

export const experienceRoute = (experienceId: string) => `trip/explore/guide/${encodeURIComponent(experienceId)}`;
