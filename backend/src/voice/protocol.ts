// Shared contract between the GhoomMate agent worker, the session endpoint and
// the frontend overlay. The frontend mirrors this file in
// frontend/src/components/voice/protocol.ts; keep both in sync.

/** Explicit-dispatch name the worker registers with and session tokens request. */
export const AGENT_NAME = 'ghoomate';

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

/** Agent → frontend. Add new variants here when a new skill needs UI. */
export type UiEvent =
  | { type: 'expense.draft'; draft: ExpenseDraft }
  | { type: 'expense.added'; expense: AddedExpense }
  | { type: 'expense.cancelled'; draftId: string }
  | { type: 'balances'; currency: string; balances: BalanceLine[]; transfers: TransferLine[] }
  | { type: 'navigate'; screen: Screen };

/** Frontend → agent. */
export type UiAction =
  | { type: 'confirm'; draftId: string }
  | { type: 'cancel'; draftId: string };

/** Frontend hash routes for each Screen. */
export const SCREEN_ROUTES: Record<Screen, string> = {
  expenses: 'trip/expenses',
  itinerary: 'trip/itinerary',
  photos: 'trip/photos',
  explore: 'trip/explore',
  members: 'trip/members',
  reel: 'trip/photos/reel',
};
