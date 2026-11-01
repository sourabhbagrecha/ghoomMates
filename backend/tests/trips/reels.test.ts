import { test } from 'node:test';
import { expect } from '../expect.ts';
import { REEL_RENDER_MS, REEL_STAGES, reelProgress, spread } from '../../src/trips/reels.ts';

test('a new reel is on the first stage', () => {
  const p = reelProgress(0);
  expect(p.status).toBe('rendering');
  expect(p.stage).toBe('pick');
  expect(p.progress).toBe(0);
  expect(p.stages.map(s => s.status)).toEqual(['current', 'pending', 'pending', 'pending']);
});

test('stages complete in order as time passes', () => {
  const p = reelProgress(REEL_STAGES[0].ms + REEL_STAGES[1].ms + 10);
  expect(p.stage).toBe('beat');
  expect(p.stages.map(s => s.status)).toEqual(['done', 'done', 'current', 'pending']);
  expect(p.progress > 0.4 && p.progress < 0.6).toBe(true);
});

test('a reel is ready once every stage has run', () => {
  const p = reelProgress(REEL_RENDER_MS);
  expect(p.status).toBe('ready');
  expect(p.stage).toBe(null);
  expect(p.progress).toBe(1);
  expect(p.stages.every(s => s.status === 'done')).toBe(true);
  expect(reelProgress(REEL_RENDER_MS * 10).progress).toBe(1);
});

test('spread picks evenly across the album and keeps order', () => {
  expect(spread([1, 2, 3], 5)).toEqual([1, 2, 3]);
  expect(spread([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5)).toEqual([0, 2, 4, 6, 8]);
});
