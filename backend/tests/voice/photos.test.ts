import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { photoFilterFor, photosSpeech } from '../../src/voice/skills/photos.ts';

const MEMBERS = [
  { memberId: 'm1', userId: 'u1', name: 'Kunal Soni' },
  { memberId: 'm2', userId: 'u2', name: 'Sourabh Bagrecha' },
  { memberId: 'm3', userId: 'u3', name: 'Bhavya Jain' },
  { memberId: 'm4', userId: 'u4', name: 'Bhavya Shah' },
];
const args = (over: object) => ({ people: [], together: false, expression: 'none' as const, scene: '', ...over });

describe('photoFilterFor', () => {
  test('spoken names become user ids', () => {
    expect(photoFilterFor(args({ people: ['me'], expression: 'happy' }), MEMBERS, 'm1')).toEqual({ filter: { userIds: ['u1'], match: 'any', expression: 'happy' } });
    expect(photoFilterFor(args({ people: ['Sourabh', 'Bhavya Jain'], together: true }), MEMBERS, 'm1')).toEqual({ filter: { userIds: ['u2', 'u3'], match: 'all' } });
  });
  test('together needs two people; scenes pass through', () => {
    expect(photoFilterFor(args({ people: ['me'], together: true, scene: ' hiking ' }), MEMBERS, 'm1')).toEqual({ filter: { userIds: ['u1'], match: 'any', scene: 'hiking' } });
    expect(photoFilterFor(args({ scene: 'haldi' }), MEMBERS, 'm1')).toEqual({ filter: { userIds: [], match: 'any', scene: 'haldi' } });
  });
  test('unclear names turn into a question', () => {
    expect('question' in photoFilterFor(args({ people: ['Bhavya'] }), MEMBERS, 'm1')).toBe(true);
    expect('question' in photoFilterFor(args({ people: ['Rahul'] }), MEMBERS, 'm1')).toBe(true);
    expect('question' in photoFilterFor(args({}), MEMBERS, 'm1')).toBe(true);
  });
});

describe('photosSpeech', () => {
  const result = (photoIds: string[], skipped: { userId: string; name: string; status: string }[] = []) => ({ filter: { userIds: [], match: 'any' as const }, label: 'You · smiling', photoIds, skipped });
  test('counts, and mentions who could not be searched', () => {
    expect(photosSpeech(result(['a', 'b']), 'u1').includes('2 photos')).toBe(true);
    expect(photosSpeech(result([]), 'u1').includes('No photos')).toBe(true);
    expect(photosSpeech(result(['a'], [{ userId: 'u3', name: 'Bhavya Jain', status: 'none' }]), 'u1').includes('Bhavya hasn\'t')).toBe(true);
  });
});
