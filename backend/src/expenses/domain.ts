import { ApiError } from '../http.ts';
export { ApiError };
export function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ApiError(400, 'VALIDATION_ERROR', message);
}
export function object(value: unknown): Record<string, unknown> {
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected a JSON object');
  return value as Record<string, unknown>;
}
export function text(value: unknown, field: string, max = 200): string {
  requireThat(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `${field} must be a non-empty string of at most ${max} characters`);
  return value.trim();
}
export function integer(value: unknown, field: string, min = 1, max = 1_000_000_000): number {
  requireThat(Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max, `${field} must be an integer between ${min} and ${max}`);
  return value as number;
}
export type Share = { memberId: string; amountPaise: number };
export type Balance = { memberId: string; netPaise: number };
export type Transfer = { fromMemberId: string; toMemberId: string; amountPaise: number };

export function splitExpense(amount: number, input: unknown): { type: string; shares: Share[] } {
  integer(amount, 'amountPaise');
  const split = object(input);
  requireThat(['equal', 'exact', 'percentage'].includes(split.type as string), 'split.type must be equal, exact, or percentage');
  requireThat(Array.isArray(split.participants) && split.participants.length > 0 && split.participants.length <= 100, 'Provide between 1 and 100 participants');
  const participants = split.participants.map(value => {
    const p = object(value);
    return { memberId: text(p.memberId, 'memberId'), value: p.value };
  });
  requireThat(new Set(participants.map(p => p.memberId)).size === participants.length, 'Participants must be unique');
  if (split.type === 'exact') {
    const shares = participants.map(p => ({ memberId: p.memberId, amountPaise: integer(p.value, 'participant.value (paise)', 0) }));
    requireThat(shares.reduce((sum, p) => sum + p.amountPaise, 0) === amount, 'Exact shares must sum to amountPaise');
    return { type: 'exact', shares };
  }
  // Percentage values are integer basis points: 10000 = 100%. No floating-point money.
  const weights = participants.map(p => split.type === 'equal' ? 1 : integer(p.value, 'participant.value (basis points)', 0, 10_000));
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (split.type === 'percentage') requireThat(total === 10_000, 'Percentage basis points must sum to 10000');
  const denominator = BigInt(total);
  const rows = participants.map((p, i) => {
    const numerator = BigInt(amount) * BigInt(weights[i]);
    return { memberId: p.memberId, amountPaise: Number(numerator / denominator), remainder: numerator % denominator, order: i };
  });
  let leftover = amount - rows.reduce((sum, p) => sum + p.amountPaise, 0);
  const ranked = [...rows].sort((a, b) => a.remainder === b.remainder ? a.order - b.order : a.remainder > b.remainder ? -1 : 1);
  for (const row of ranked) {
    if (leftover-- <= 0) break;
    row.amountPaise++;
  }
  return { type: split.type as string, shares: rows.map(({ memberId, amountPaise }) => ({ memberId, amountPaise })) };
}

export function suggestTransfers(balances: Balance[]): Transfer[] {
  const debtors = balances.filter(b => b.netPaise < 0).map(b => ({ id: b.memberId, amount: -b.netPaise }));
  const creditors = balances.filter(b => b.netPaise > 0).map(b => ({ id: b.memberId, amount: b.netPaise }));
  const sort = (a: { id: string; amount: number }, b: { id: string; amount: number }) => b.amount - a.amount || a.id.localeCompare(b.id);
  debtors.sort(sort); creditors.sort(sort);
  const transfers: Transfer[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amountPaise = Math.min(debtors[i].amount, creditors[j].amount);
    transfers.push({ fromMemberId: debtors[i].id, toMemberId: creditors[j].id, amountPaise });
    debtors[i].amount -= amountPaise; creditors[j].amount -= amountPaise;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }
  return transfers;
}
