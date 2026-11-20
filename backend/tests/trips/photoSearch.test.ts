import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { GeminiError, type Gemini } from '../../src/gemini.ts';
import {
  captionPattern, combinePeople, expandScene, faceShows, filterLabel, matchTags, parseQuery, parseQueryKeywords, readFilter,
  type PersonMatch,
} from '../../src/trips/photoSearch.ts';

const ME = 'usr_me';
const MEMBERS = [
  { userId: ME, name: 'Kunal Soni', username: 'kunal' },
  { userId: 'usr_sourabh', name: 'Sourabh Bagrecha', username: 'sourabh' },
  { userId: 'usr_bhavya', name: 'Bhavya Jain', username: 'bj' },
];
const VOCAB = ['hiking', 'mountain trail', 'haldi', 'conference hall', 'dining hall', 'lake', 'sunset', 'trek'];

describe('readFilter', () => {
  test('defaults and dedupes', () => {
    expect(readFilter({ userIds: ['a', 'a', 'b'] })).toEqual({ userIds: ['a', 'b'], match: 'any' });
    expect(readFilter({ expression: 'happy', scene: ' hiking ' })).toEqual({ userIds: [], match: 'any', expression: 'happy', scene: 'hiking' });
  });
  test('rejects empty and bad input', () => {
    expect(() => readFilter({})).toThrow();
    expect(() => readFilter({ userIds: ['a'], match: 'some' })).toThrow();
    expect(() => readFilter({ userIds: ['a'], expression: 'grumpy' })).toThrow();
  });
});

describe('faceShows', () => {
  test('happy accepts the emotion or a likely smile', () => {
    expect(faceShows({ emotion: 'happy', smile: 0.2 }, 'happy')).toBe(true);
    expect(faceShows({ emotion: 'neutral', smile: 0.6 }, 'happy')).toBe(true);
    expect(faceShows({ emotion: 'neutral', smile: 0.1 }, 'happy')).toBe(false);
    expect(faceShows({ emotion: null, smile: null }, 'happy')).toBe(false);
    expect(faceShows({ emotion: null }, undefined)).toBe(true);
  });
});

describe('combinePeople', () => {
  const face = (emotion: string | null) => ({ x: 0, y: 0, w: 1, h: 1, distance: 0.2, emotion, smile: null });
  const m = (photoId: string, emotion: string | null = 'neutral'): PersonMatch => ({ photoId, distance: 0.2, faces: [face(emotion)] });
  const perPerson = new Map([['a', [m('p1'), m('p2', 'happy')]], ['b', [m('p2'), m('p3', 'happy')]]]);

  test('any is a union, photos with more of the people first', () => {
    expect(combinePeople(perPerson, 'any').map(h => h.photoId)).toEqual(['p2', 'p1', 'p3']);
  });
  test('all needs every person in the photo', () => {
    const hits = combinePeople(perPerson, 'all');
    expect(hits.map(h => [h.photoId, h.people])).toEqual([['p2', ['a', 'b']]]);
  });
  test('the expression applies to the matched person’s own face', () => {
    expect(combinePeople(perPerson, 'any', 'happy').map(h => [h.photoId, h.people])).toEqual([['p2', ['a']], ['p3', ['b']]]);
    expect(combinePeople(perPerson, 'all', 'happy')).toEqual([]);
  });
});

describe('scene matching', () => {
  test('stems line up words with tags and the best match wins', () => {
    expect(matchTags('hike', VOCAB)).toEqual(['hiking']);
    expect(matchTags('photos at the conference hall', VOCAB)).toEqual(['conference hall']);
    expect(matchTags('haldi event', VOCAB)).toEqual(['haldi']);
    expect(matchTags('beach', VOCAB)).toEqual([]);
  });
  test('caption pattern needs every word', () => {
    const re = captionPattern('sunset lake')!;
    expect(re.test('Friends watching the sunset by a lake')).toBe(true);
    expect(re.test('A sunset over the hills')).toBe(false);
    expect(captionPattern('the photos')).toBe(null);
  });
  test('Gemini expands only when no tag matches, and only into the vocabulary', async () => {
    let calls = 0;
    const gemini = { enabled: true, models: { lite: 'l', smart: 's' }, json: async () => { calls++; return { tags: ['trek', 'Mountain Trail', 'made up'] }; } } as unknown as Gemini;
    expect(await expandScene('hiking', VOCAB, gemini)).toEqual(['hiking']);
    expect(calls).toBe(0);
    expect(await expandScene('climbing', VOCAB, gemini)).toEqual(['trek', 'mountain trail']);
    const down = { ...gemini, json: async () => { throw new GeminiError('busy', 429); } } as Gemini;
    expect(await expandScene('climbing', VOCAB, down)).toEqual([]);
  });
});

describe('parseQueryKeywords', () => {
  const parse = (q: string) => parseQueryKeywords(q, MEMBERS, ME, VOCAB).filter;
  test('photos where I was smiling', () => {
    expect(parse('show me all photos where I was smiling')).toEqual({ userIds: [ME], match: 'any', expression: 'happy' });
  });
  test('two people, either of them', () => {
    expect(parse('give me sourabh’s and bhavya’s photos')).toEqual({ userIds: ['usr_sourabh', 'usr_bhavya'], match: 'any' });
  });
  test('together', () => {
    expect(parse('photos of me with Bhavya')).toEqual({ userIds: [ME, 'usr_bhavya'], match: 'all' });
  });
  test('scenes, with and without people', () => {
    expect(parse('my hiking photos')).toEqual({ userIds: [ME], match: 'any', scene: 'hiking' });
    expect(parse('all photos of bhavya from haldi event')).toEqual({ userIds: ['usr_bhavya'], match: 'any', scene: 'haldi' });
    expect(parse('conference hall')).toEqual({ userIds: [], match: 'any', scene: 'conference hall' });
    expect(parseQueryKeywords('conference hall', MEMBERS, ME, VOCAB).sceneTags).toEqual(['conference hall']);
  });
  test('usernames and full names', () => {
    expect(parse('photos of Sourabh Bagrecha laughing')).toEqual({ userIds: ['usr_sourabh'], match: 'any', expression: 'happy' });
    expect(parse('bj photos')).toEqual({ userIds: ['usr_bhavya'], match: 'any' });
  });
  test('nothing understood means your photos', () => {
    expect(parse('photos')).toEqual({ userIds: [ME], match: 'any' });
  });
});

describe('parseQuery with Gemini', () => {
  const answer = (out: object) => ({ enabled: true, models: { lite: 'l', smart: 's' }, json: async () => out }) as unknown as Gemini;
  test('keeps only known members and tags', async () => {
    const parsed = await parseQuery('bhavya at the haldi', MEMBERS, ME, VOCAB, answer({
      userIds: ['usr_bhavya', 'usr_ghost'], together: false, expression: 'none', scene: 'haldi', sceneTags: ['haldi', 'wedding'], unmatched: [],
    }));
    expect(parsed.filter).toEqual({ userIds: ['usr_bhavya'], match: 'any', scene: 'haldi' });
    expect(parsed.sceneTags).toEqual(['haldi']);
    expect(parsed.source).toBe('gemini');
  });
  test('an unknown name is reported, not swapped for your photos', async () => {
    const parsed = await parseQuery('rahul photos', MEMBERS, ME, VOCAB, answer({
      userIds: [], together: false, expression: 'none', scene: '', sceneTags: [], unmatched: ['Rahul'],
    }));
    expect([parsed.filter.userIds, parsed.unmatched]).toEqual([[], ['Rahul']]);
  });
  test('falls back to keywords when Gemini fails', async () => {
    const down = { enabled: true, models: { lite: 'l', smart: 's' }, json: async () => { throw new GeminiError('budget', 429); } } as unknown as Gemini;
    const parsed = await parseQuery('my hiking photos', MEMBERS, ME, VOCAB, down);
    expect([parsed.source, parsed.filter]).toEqual(['keywords', { userIds: [ME], match: 'any', scene: 'hiking' }]);
  });
});

describe('filterLabel', () => {
  const nameOf = (id: string) => (id === ME ? 'You' : id === 'usr_bhavya' ? 'Bhavya' : 'Sourabh');
  test('reads like a title', () => {
    expect(filterLabel({ userIds: [ME], match: 'any', expression: 'happy', scene: 'hiking' }, nameOf)).toBe('You · smiling · hiking');
    expect(filterLabel({ userIds: ['usr_sourabh', 'usr_bhavya'], match: 'any' }, nameOf)).toBe('Sourabh & Bhavya');
    expect(filterLabel({ userIds: [ME, 'usr_bhavya'], match: 'all' }, nameOf)).toBe('You with Bhavya');
    expect(filterLabel({ userIds: [], match: 'any', scene: 'haldi' }, nameOf)).toBe('haldi');
  });
});
