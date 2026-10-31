import { describe, expect, test } from 'bun:test';
import { splitExpense, suggestTransfers } from '../src/domain';

const participants = ['a', 'b', 'c'].map(memberId => ({ memberId }));
describe('money allocation', () => {
  test('equal shares preserve every paise, including tiny amounts', () => {
    expect(splitExpense(100, { type: 'equal', participants }).shares.map(p => p.amountPaise)).toEqual([34, 33, 33]);
    expect(splitExpense(1, { type: 'equal', participants }).shares.map(p => p.amountPaise)).toEqual([1, 0, 0]);
  });
  test('percentage shares use largest remainders and stable tie breaks', () => {
    expect(splitExpense(101, { type: 'percentage', participants: [
      { memberId: 'a', value: 5000 }, { memberId: 'b', value: 2500 }, { memberId: 'c', value: 2500 },
    ] }).shares.map(p => p.amountPaise)).toEqual([51, 25, 25]);
  });
  test('allocation conserves totals over varied amounts', () => {
    for (let amount = 1; amount <= 1000; amount++) {
      const shares = splitExpense(amount, { type: 'percentage', participants: [
        { memberId: 'a', value: 3333 }, { memberId: 'b', value: 6667 },
      ] }).shares;
      expect(shares.reduce((sum, p) => sum + p.amountPaise, 0)).toBe(amount);
      expect(shares.every(p => Number.isInteger(p.amountPaise) && p.amountPaise >= 0)).toBe(true);
    }
  });
  test('rejects invalid totals, fractional money, and duplicate members', () => {
    expect(() => splitExpense(100, { type: 'exact', participants: [{ memberId: 'a', value: 99 }] })).toThrow();
    expect(() => splitExpense(100, { type: 'percentage', participants: [{ memberId: 'a', value: 9999 }] })).toThrow();
    expect(() => splitExpense(1.5, { type: 'equal', participants })).toThrow();
    expect(() => splitExpense(100, { type: 'equal', participants: [{ memberId: 'a' }, { memberId: 'a' }] })).toThrow();
    expect(() => splitExpense(0, { type: 'equal', participants })).toThrow();
  });
  test('suggested transfers clear all balances', () => {
    const balances = [{ memberId: 'a', netPaise: 800 }, { memberId: 'b', netPaise: -300 }, { memberId: 'c', netPaise: -500 }];
    const remaining = new Map(balances.map(b => [b.memberId, b.netPaise]));
    for (const t of suggestTransfers(balances)) {
      remaining.set(t.fromMemberId, remaining.get(t.fromMemberId)! + t.amountPaise);
      remaining.set(t.toMemberId, remaining.get(t.toMemberId)! - t.amountPaise);
    }
    expect([...remaining.values()]).toEqual([0, 0, 0]);
  });
});
