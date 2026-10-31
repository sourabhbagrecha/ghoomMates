import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { equalShares, formatRupees, resolveMember, resolveParticipants, rupeesToPaise } from '../../src/voice/members.ts';

const members = [
  { memberId: 'm1', name: 'Kunal Soni' },
  { memberId: 'm2', name: 'Riya Sharma' },
  { memberId: 'm3', name: 'Riya Kapoor' },
  { memberId: 'm4', name: 'Aman Verma' },
  { memberId: 'm5', name: 'Amandeep Singh' },
];
const me = 'm1';

describe('resolveMember', () => {
  test('self references map to the speaker', () => {
    for (const word of ['me', 'I', 'myself', 'mine', 'main', ' Me ']) expect(resolveMember(word, members, me)).toEqual({ ok: true, ids: ['m1'] });
  });
  test('full name, first name and surname match case-insensitively', () => {
    expect(resolveMember('riya sharma', members, me)).toEqual({ ok: true, ids: ['m2'] });
    expect(resolveMember('KUNAL', members, me)).toEqual({ ok: true, ids: ['m1'] });
    expect(resolveMember('Kapoor', members, me)).toEqual({ ok: true, ids: ['m3'] });
    expect(resolveMember("Riya Sharma's", members, me)).toEqual({ ok: true, ids: ['m2'] });
  });
  test('an exact first name beats a longer name it prefixes', () => {
    expect(resolveMember('Aman', members, me)).toEqual({ ok: true, ids: ['m4'] });
  });
  test('prefix match as a last resort', () => {
    expect(resolveMember('Amande', members, me)).toEqual({ ok: true, ids: ['m5'] });
    expect(resolveMember('Kun', members, me)).toEqual({ ok: true, ids: ['m1'] });
  });
  test('a shared first name is ambiguous and lists the candidates', () => {
    const result = resolveMember('Riya', members, me);
    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== 'ambiguous') throw new Error('expected ambiguous');
    expect(result.candidates.map(c => c.memberId)).toEqual(['m2', 'm3']);
  });
  test('unknown names are reported', () => {
    expect(resolveMember('Zoya', members, me)).toEqual({ ok: false, reason: 'unknown', name: 'Zoya' });
    expect(resolveMember('  ', members, me)).toEqual({ ok: false, reason: 'unknown', name: '  ' });
  });
});

describe('resolveParticipants', () => {
  test('everyone words select the whole trip', () => {
    for (const word of ['everyone', 'All', 'sab', 'everybody']) {
      expect(resolveParticipants([word], members, me)).toEqual({ ok: true, ids: ['m1', 'm2', 'm3', 'm4', 'm5'] });
    }
  });
  test('names resolve in order and duplicates collapse', () => {
    expect(resolveParticipants(['me', 'Aman', 'Kunal', 'Kapoor'], members, me)).toEqual({ ok: true, ids: ['m1', 'm4', 'm3'] });
  });
  test('the first failing name is returned', () => {
    const result = resolveParticipants(['me', 'Riya', 'Zoya'], members, me);
    expect(result.ok === false && result.reason).toBe('ambiguous');
    expect(resolveParticipants(['Zoya'], members, me)).toEqual({ ok: false, reason: 'unknown', name: 'Zoya' });
  });
  test('an empty list is unknown', () => {
    expect(resolveParticipants([], members, me)).toEqual({ ok: false, reason: 'unknown', name: '' });
  });
});

describe('money helpers', () => {
  test('rupeesToPaise rounds to whole paise and rejects non-positive amounts', () => {
    expect(rupeesToPaise(250)).toBe(25000);
    expect(rupeesToPaise(99.999)).toBe(10000);
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
    expect(() => rupeesToPaise(0)).toThrow();
    expect(() => rupeesToPaise(-5)).toThrow();
    expect(() => rupeesToPaise(0.004)).toThrow();
    expect(() => rupeesToPaise(Number.NaN)).toThrow();
  });
  test('equalShares keeps every paisa with largest remainders', () => {
    expect(equalShares(25000, ['a', 'b', 'c']).map(s => s.amountPaise)).toEqual([8334, 8333, 8333]);
    expect(equalShares(25000, ['a', 'b', 'c', 'd', 'e']).map(s => s.amountPaise)).toEqual([5000, 5000, 5000, 5000, 5000]);
  });
  test('formatRupees reads naturally', () => {
    expect(formatRupees(25000)).toBe('₹250');
    expect(formatRupees(8333)).toBe('₹83.33');
    expect(formatRupees(150000)).toBe('₹1,500');
  });
});
