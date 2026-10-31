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

export type RecommendationBasis = 'you' | 'squad' | 'rating';

export type ExperiencePick = {
  experienceId: string;
  matchPercent: number | null;
  reason: string;
};

export type UiEvent =
  | { type: 'expense.draft'; draft: ExpenseDraft }
  | { type: 'expense.added'; expense: AddedExpense }
  | { type: 'expense.cancelled'; draftId: string }
  | { type: 'balances'; currency: string; balances: BalanceLine[]; transfers: TransferLine[] }
  | { type: 'navigate'; screen: Screen }
  | { type: 'experiences.recommended'; city: string; basis: RecommendationBasis; picks: ExperiencePick[] }
  | { type: 'experience.open'; experienceId: string };

export type UiAction =
  | { type: 'confirm'; draftId: string }
  | { type: 'cancel'; draftId: string };

export const SCREEN_ROUTES: Record<Screen, string> = {
  expenses: 'trip/expenses',
  itinerary: 'trip/itinerary',
  photos: 'trip/photos',
  explore: 'trip/explore',
  members: 'trip/members',
  reel: 'trip/photos/reel',
};

export const experienceRoute = (experienceId: string) => `trip/explore/guide/${encodeURIComponent(experienceId)}`;
