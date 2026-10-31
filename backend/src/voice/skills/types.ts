// The extensibility seam: a skill = instructions + tools (+ optional handler for card taps).
import type { llm } from '@livekit/agents';
import type { BackendClient } from '../backendClient.ts';
import type { MemberRef } from '../members.ts';
import type { AddedExpense, ExpenseCategory, ExpenseDraft, UiAction, UiEvent } from '../protocol.ts';

export type TripMember = MemberRef & { userId: string };

/** The subset of GET /api/trips/:tripId the agent uses. */
export type TripDetail = {
  id: string;
  name: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  /** The caller's ledger member id. */
  memberId: string;
  members: TripMember[];
};

/** Body of POST /api/trips/:tripId/expenses. */
export type ExpenseRequest = {
  description: string;
  amountPaise: number;
  payerMemberId: string;
  category: ExpenseCategory;
  split: { type: 'equal' | 'exact'; participants: { memberId: string; value?: number }[] };
};

export type PendingDraft = { draft: ExpenseDraft; idempotencyKey: string; request: ExpenseRequest };

/** Per-session mutable bag shared by every skill. */
export type SessionState = {
  pendingDraft: PendingDraft | null;
  /** Last committed draft, so a repeated "yes" or a late tap doesn't double-write. */
  lastAdded: AddedExpense | null;
  [key: string]: unknown;
};

export type SkillContext = {
  tripId: string;
  trip: TripDetail;
  me: MemberRef;
  members: TripMember[];
  api: BackendClient;
  /** Push a UI event to the user's screen. Never rejects; safe to `void`. */
  ui: (event: UiEvent) => Promise<void>;
  state: SessionState;
};

export type Tool = llm.FunctionTool<any, any, any>;

export type Skill = {
  name: string;
  instructions(ctx: SkillContext): string;
  tools(ctx: SkillContext): Tool[];
  /**
   * Handles a tapped card button (RPC ghoomate.action). Return instructions for a short spoken
   * follow-up, or null if this skill doesn't own the action.
   */
  onAction?(action: UiAction, ctx: SkillContext): Promise<string | null>;
};
