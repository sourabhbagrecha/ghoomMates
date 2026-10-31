// Expenses skill: draft → (voice "yes" | tapped Confirm) → POST, plus balances and recent expenses.
import { randomUUID } from 'node:crypto';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { logger } from '../../logger.ts';
import { equalShares, firstName, formatRupees, isEveryone, resolveMember, resolveParticipants, rupeesToPaise, type MemberRef, type Resolution } from '../members.ts';
import type { AddedExpense, BalanceLine, DraftShare, ExpenseCategory, ExpenseDraft, TransferLine } from '../protocol.ts';
import type { ExpenseRequest, PendingDraft, Skill, SkillContext } from './types.ts';

const CATEGORIES = ['food', 'stays', 'travel', 'fun', 'other'] as const satisfies readonly ExpenseCategory[];

type Summary = {
  currency: string;
  totalSpentPaise: number;
  expenseCount: number;
  balances: { memberId: string; netPaise: number }[];
  transfers: { fromMemberId: string; toMemberId: string; amountPaise: number }[];
};
type ExpenseRow = { id: string; description: string; amountPaise: number; payerMemberId: string; category: ExpenseCategory; createdAt: string };

const nameOf = (ctx: SkillContext, memberId: string) => ctx.members.find(m => m.memberId === memberId)?.name ?? 'someone';
// How GhoomMate says a member's name to the speaker: "you" for themselves, first name otherwise.
const spoken = (ctx: SkillContext, memberId: string) => memberId === ctx.me.memberId ? 'you' : firstName(nameOf(ctx, memberId));
const list = (items: string[], word = 'and') => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${word} ${items[items.length - 1]}`;
const roster = (ctx: SkillContext) => list(ctx.members.map(m => m.name));

// Turns a failed name lookup into the clarifying question the model should ask.
function nameError(ctx: SkillContext, result: Exclude<Resolution, { ok: true }>, role: string): llm.ToolError {
  if (result.reason === 'ambiguous') {
    return new llm.ToolError(`"${result.name}" matches more than one member. Ask: which ${result.name}, ${list(result.candidates.map(c => c.name), 'or')}?`);
  }
  if (!result.name) return new llm.ToolError(`It's unclear who ${role}. Ask who, e.g. everyone or just some of the squad. Members: ${roster(ctx)}.`);
  return new llm.ToolError(`Nobody called "${result.name}" is in this trip. Members: ${roster(ctx)}. Ask who they meant.`);
}

function resolveOne(ctx: SkillContext, name: string, role: string): string {
  const result = resolveMember(name, ctx.members, ctx.me.memberId);
  if (!result.ok) throw nameError(ctx, result, role);
  return result.ids[0];
}

function readback(ctx: SkillContext, draft: ExpenseDraft) {
  const amount = formatRupees(draft.amountPaise);
  const payer = draft.payer.memberId === ctx.me.memberId ? 'you' : firstName(draft.payer.name);
  const ids = draft.shares.map(s => s.memberId);
  let split: string;
  if (draft.splitType === 'exact') {
    split = `split as ${list(draft.shares.map(s => `${spoken(ctx, s.memberId)} ${formatRupees(s.amountPaise)}`))}`;
  } else if (ids.length === 1) {
    split = `all on ${spoken(ctx, ids[0])}`;
  } else {
    const amounts = draft.shares.map(s => s.amountPaise);
    const even = Math.max(...amounts) === Math.min(...amounts);
    const each = even ? `${formatRupees(amounts[0])} each` : `about ${formatRupees(Math.round(amounts[0] / 100) * 100)} each`;
    const who = ids.length === ctx.members.length ? `all ${ids.length} of you` : list(ids.map(id => spoken(ctx, id)));
    split = `split equally between ${who}, ${each}`;
  }
  return `${amount} for ${draft.description}, paid by ${payer}, ${split}.`;
}

// ---- Shared commit/cancel: used by the confirm/cancel tools and by tapped card buttons. ----

type Commit = Promise<{ added: AddedExpense; duplicate: boolean }>;
const inFlight = new WeakMap<object, { draftId: string; run: Commit }>();

export class NoPendingDraftError extends Error {
  constructor() {
    super('No expense draft is waiting for confirmation');
    this.name = 'NoPendingDraftError';
  }
}

export class AlreadySavingError extends Error {
  constructor() {
    super('The expense is already being saved');
    this.name = 'AlreadySavingError';
  }
}

/** Writes the pending draft (idempotently). A repeat confirm of the same draft returns the earlier result. */
export function commitDraft(ctx: SkillContext, draftId?: string): Commit {
  const running = inFlight.get(ctx.state);
  if (running) {
    if (!draftId || running.draftId === draftId) return running.run;
    // A different draft: let the current save finish first, then handle this one.
    return running.run.catch(() => undefined).then(() => commitDraft(ctx, draftId));
  }
  const pending = ctx.state.pendingDraft;
  const last = ctx.state.lastAdded;
  if (!pending || (draftId && pending.draft.id !== draftId)) {
    if (last && (!draftId || last.draftId === draftId)) {
      // Re-push in case the first expense.added UI event was lost, so the card can flip to Added.
      void ctx.ui({ type: 'expense.added', expense: last });
      return Promise.resolve({ added: last, duplicate: true });
    }
    return Promise.reject(new NoPendingDraftError());
  }
  const run = (async () => {
    const saved = await ctx.api.post<{ id: string; description: string; amountPaise: number; category: ExpenseCategory }>(
      `/api/trips/${ctx.tripId}/expenses`, pending.request, { idempotencyKey: pending.idempotencyKey },
    );
    const added: AddedExpense = { id: saved.id, draftId: pending.draft.id, description: saved.description, amountPaise: saved.amountPaise, category: saved.category };
    if (ctx.state.pendingDraft === pending) ctx.state.pendingDraft = null;
    ctx.state.lastAdded = added;
    logger.info('Voice', `GhoomMate added "${added.description}" (${added.amountPaise} paise) to trip ${ctx.tripId}`);
    void ctx.ui({ type: 'expense.added', expense: added });
    return { added, duplicate: false };
  })().finally(() => inFlight.delete(ctx.state));
  inFlight.set(ctx.state, { draftId: pending.draft.id, run });
  return run;
}

/** Drops the pending draft without writing anything. Returns the dropped draft, or null if there was none.
 *  Throws AlreadySavingError if that draft's save is already in flight (too late to cancel). */
export function cancelDraft(ctx: SkillContext, draftId?: string): ExpenseDraft | null {
  const pending = ctx.state.pendingDraft;
  if (!pending || (draftId && pending.draft.id !== draftId)) return null;
  if (inFlight.get(ctx.state)?.draftId === pending.draft.id) throw new AlreadySavingError();
  ctx.state.pendingDraft = null;
  void ctx.ui({ type: 'expense.cancelled', draftId: pending.draft.id });
  return pending.draft;
}

/** Validates spoken expense details into a draft + request body. Throws ToolError with a clarifying question. */
export function buildDraft(ctx: SkillContext, args: {
  description: string; amountRupees: number; category: ExpenseCategory; paidBy?: string;
  splitType: 'equal' | 'exact'; participants: string[]; amountsRupees?: number[];
}): PendingDraft {
  const description = args.description.trim().replace(/^./, c => c.toUpperCase()).slice(0, 200);
  if (!description) throw new llm.ToolError('The expense needs a description. Ask what it was for.');
  let amountPaise: number;
  try {
    amountPaise = rupeesToPaise(args.amountRupees);
  } catch {
    throw new llm.ToolError('The amount is missing or not more than zero. Ask how much it was.');
  }
  const payerId = args.paidBy?.trim() ? resolveOne(ctx, args.paidBy, 'paid') : ctx.me.memberId;
  const names = args.participants.map(n => n.trim()).filter(Boolean);
  if (names.length === 0) throw nameError(ctx, { ok: false, reason: 'unknown', name: '' }, 'it should be split between');

  let shares: { memberId: string; amountPaise: number }[];
  if (args.splitType === 'exact') {
    if (names.some(isEveryone)) throw new llm.ToolError('For an exact split, ask how much each person owes, by name.');
    const ids = names.map(n => resolveOne(ctx, n, 'it should be split between'));
    if (new Set(ids).size !== ids.length) throw new llm.ToolError('The same person was listed twice. Ask how much each person owes, once per person.');
    const amounts = args.amountsRupees ?? [];
    if (amounts.length !== ids.length) throw new llm.ToolError(`An exact split needs one amount per person (${list(ids.map(id => spoken(ctx, id)))}). Ask how much each owes.`);
    shares = ids.map((memberId, i) => ({ memberId, amountPaise: Math.round(amounts[i] * 100) }));
    if (shares.some(s => !Number.isFinite(s.amountPaise) || s.amountPaise < 0)) throw new llm.ToolError('A share amount is invalid. Ask how much each person owes.');
    const sum = shares.reduce((total, s) => total + s.amountPaise, 0);
    if (sum !== amountPaise) {
      throw new llm.ToolError(`The shares add up to ${formatRupees(sum)} but the total is ${formatRupees(amountPaise)}. Ask which is right.`);
    }
  } else {
    const result = resolveParticipants(names, ctx.members, ctx.me.memberId);
    if (!result.ok) throw nameError(ctx, result, 'it should be split between');
    shares = equalShares(amountPaise, result.ids);
  }

  const payer: MemberRef = { memberId: payerId, name: nameOf(ctx, payerId) };
  const draftShares: DraftShare[] = shares.map(s => ({ ...s, name: nameOf(ctx, s.memberId) }));
  const draft: ExpenseDraft = { id: randomUUID(), description, amountPaise, category: args.category, payer, splitType: args.splitType, shares: draftShares };
  const request: ExpenseRequest = {
    description, amountPaise, payerMemberId: payerId, category: args.category,
    split: args.splitType === 'exact'
      ? { type: 'exact', participants: shares.map(s => ({ memberId: s.memberId, value: s.amountPaise })) }
      : { type: 'equal', participants: shares.map(s => ({ memberId: s.memberId })) },
  };
  return { draft, idempotencyKey: randomUUID(), request };
}

const errorMessage = (err: unknown) => (err as Error)?.message || 'something went wrong';

export const expenses: Skill = {
  name: 'expenses',

  working: {
    draft_expense: 'Working out the split…',
    confirm_expense: 'Adding the expense…',
    get_balances: 'Checking balances…',
    list_recent_expenses: 'Looking up expenses…',
  },

  instructions: () => `## Expenses
- To add an expense, call draft_expense as soon as you know the amount, what it was for and who shares it. It shows a draft card on screen and returns a readback.
- Read the readback in one short sentence and ask "Shall I add it?". Only call confirm_expense after an explicit yes ("yes", "haan", "kar do", "go ahead"). "No"/"cancel"/"rehne do" → cancel_expense. A correction → call draft_expense again with the fix.
- Infer the category (food, stays, travel, fun, other); never ask about it.
- paidBy: leave it out when the speaker paid. participants: names as said, or ["everyone"] for the whole squad; "me", "I", "main" mean the speaker.
- Exact splits: splitType "exact" with amountsRupees in the same order as participants.
- "Who owes what?", "how much do I owe?" → get_balances. "What did we spend on?" → list_recent_expenses.
- Amounts are rupees: "dhai sau" = 250, "dedh hazaar" = 1500, "2k" = 2000.`,

  tools: (ctx) => [
    llm.tool({
      name: 'draft_expense',
      description: 'Prepare an expense and show it on screen for confirmation. Does NOT save it.',
      parameters: z.object({
        description: z.string().describe('What it was for, short, e.g. "Lunch" or "Cab to airport"'),
        amountRupees: z.number().describe('Total amount in rupees'),
        category: z.enum(CATEGORIES).describe('Inferred category; never ask the user'),
        paidBy: z.string().optional().describe('Name of who paid. Omit if the speaker paid.'),
        splitType: z.enum(['equal', 'exact']).describe('equal unless the user gave per-person amounts'),
        participants: z.array(z.string()).describe('Names of who shares it, or ["everyone"] for the whole trip'),
        amountsRupees: z.array(z.number()).optional().describe('Exact split only: rupees per participant, same order'),
      }),
      execute: async (args) => {
        const pending = buildDraft(ctx, args);
        ctx.state.pendingDraft = pending;
        void ctx.ui({ type: 'expense.draft', draft: pending.draft });
        return `Draft card is on screen: ${readback(ctx, pending.draft)} Read this back briefly and ask the user to confirm (they can also tap Confirm). Do not call confirm_expense until they clearly say yes.`;
      },
    }),

    llm.tool({
      name: 'confirm_expense',
      description: 'Save the pending draft expense. Only call after the user explicitly said yes to the readback.',
      execute: async (_args, { ctx: run }) => {
        try { run.disallowInterruptions(); } catch {}
        try {
          const { added, duplicate } = await commitDraft(ctx);
          return duplicate
            ? `That expense (${added.description}, ${formatRupees(added.amountPaise)}) was already added; nothing new was saved.`
            : `Saved: ${added.description}, ${formatRupees(added.amountPaise)}. Tell the user it's added in a few words.`;
        } catch (err) {
          if (err instanceof NoPendingDraftError) throw new llm.ToolError('There is no draft waiting. Ask what expense they want to add.');
          throw new llm.ToolError(`Saving failed: ${errorMessage(err)}. Tell the user briefly and ask if you should try again.`);
        }
      },
    }),

    llm.tool({
      name: 'cancel_expense',
      description: 'Discard the pending draft expense without saving.',
      execute: async () => {
        try {
          const dropped = cancelDraft(ctx);
          return dropped ? `Discarded the ${dropped.description} draft; nothing was saved.` : 'There was no draft to cancel.';
        } catch (err) {
          if (err instanceof AlreadySavingError) return 'Too late to cancel: it is already being saved. Tell the user it is added and offer to help fix it.';
          throw err;
        }
      },
    }),

    llm.tool({
      name: 'get_balances',
      description: 'Who owes whom in this trip, and the speaker\'s own balance. Shows a balances card.',
      execute: async () => {
        let summary: Summary;
        try {
          summary = await ctx.api.get<Summary>(`/api/trips/${ctx.tripId}/summary`);
        } catch (err) {
          throw new llm.ToolError(`Couldn't load balances: ${errorMessage(err)}. Tell the user briefly.`);
        }
        const balances: BalanceLine[] = summary.balances.map(b => ({ memberId: b.memberId, name: nameOf(ctx, b.memberId), balancePaise: b.netPaise }));
        const transfers: TransferLine[] = summary.transfers.map(t => ({ from: nameOf(ctx, t.fromMemberId), to: nameOf(ctx, t.toMemberId), amountPaise: t.amountPaise }));
        void ctx.ui({ type: 'balances', currency: summary.currency, balances, transfers });
        if (summary.expenseCount === 0) return 'No expenses yet, so everyone is square.';
        const mine = summary.balances.find(b => b.memberId === ctx.me.memberId)?.netPaise ?? 0;
        const own = mine > 0 ? `The speaker is owed ${formatRupees(mine)}.` : mine < 0 ? `The speaker owes ${formatRupees(-mine)}.` : 'The speaker is settled up.';
        const moves = summary.transfers.map(t => `${spoken(ctx, t.fromMemberId)} pays ${spoken(ctx, t.toMemberId)} ${formatRupees(t.amountPaise)}`);
        return `Balances card is on screen. Total spent ${formatRupees(summary.totalSpentPaise)}. ${own} ${moves.length ? `Settle-up: ${moves.join('; ')}.` : 'Nobody owes anything.'} Summarise in 1-2 sentences, focusing on the speaker.`;
      },
    }),

    llm.tool({
      name: 'list_recent_expenses',
      description: 'The 5 most recent expenses in this trip.',
      execute: async () => {
        let rows: ExpenseRow[];
        try {
          rows = (await ctx.api.get<{ items: ExpenseRow[] }>(`/api/trips/${ctx.tripId}/expenses?limit=5`)).items;
        } catch (err) {
          throw new llm.ToolError(`Couldn't load expenses: ${errorMessage(err)}. Tell the user briefly.`);
        }
        if (rows.length === 0) return 'No expenses have been added yet.';
        return `Most recent first: ${rows.map(r => `${r.description} ${formatRupees(r.amountPaise)} paid by ${spoken(ctx, r.payerMemberId)}`).join('; ')}.`;
      },
    }),
  ],

  async onAction(action, ctx) {
    if (action.type === 'confirm') {
      try {
        const { added, duplicate } = await commitDraft(ctx, action.draftId);
        return duplicate
          ? `The user tapped Confirm, but ${added.description} was already added. Say so in a few words.`
          : `The user tapped Confirm and ${added.description} (${formatRupees(added.amountPaise)}) was added. Briefly tell them it's added.`;
      } catch (err) {
        if (err instanceof NoPendingDraftError) return 'The user tapped Confirm on a card that is no longer pending. Briefly ask what they want to add.';
        return `The user tapped Confirm but saving failed: ${errorMessage(err)}. Briefly tell them and offer to retry.`;
      }
    }
    if (action.type === 'cancel') {
      try {
        const dropped = cancelDraft(ctx, action.draftId);
        return dropped ? `The user tapped Cancel on the ${dropped.description} draft; nothing was saved. Briefly tell them it's cancelled.` : null;
      } catch (err) {
        if (err instanceof AlreadySavingError) return 'The user tapped Cancel, but the expense was already being saved. Briefly tell them it is added.';
        throw err;
      }
    }
    return null;
  },
};
