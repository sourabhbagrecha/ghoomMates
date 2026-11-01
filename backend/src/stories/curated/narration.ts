import type { Lang } from '../types.ts';

// Narration recorded ahead of time for the classic tellings, shipped as frontend/public/stories/<siteId>/<lang>.m4a so the
// demo plays with no AI and no network to Google. Written by scripts/stories/narration.ts; `hash` ties each recording to the
// exact words and voice it was made from, so an edited story stops using a stale recording.
export type StaticNarration = { durationSec: number; marks: number[]; hash: string; bytes: number };

export const STATIC_NARRATION: Record<string, Partial<Record<Lang, StaticNarration>>> = {
  'bagore-ki-haveli': {
    en: { durationSec: 99.4, marks: [0, 27, 49.3, 75.2], hash: 'f24483f7529784fd', bytes: 314810 },
    hi: { durationSec: 100.8, marks: [0, 23.3, 46.1, 75.7], hash: 'b82fecd41e688e5a', bytes: 319231 },
  },
  'city-palace': {
    en: { durationSec: 98.8, marks: [0, 29.2, 52.5, 78.3], hash: '53a7e7d3869336ff', bytes: 313297 },
  },
  'fateh-sagar': {
    en: { durationSec: 98.2, marks: [0, 24.7, 47.8, 72.2], hash: 'd0f53e28fa0c6b47', bytes: 312079 },
  },
  'jagdish-temple': {
    en: { durationSec: 98.2, marks: [0, 25.3, 46, 69], hash: 'c184e03b0c6a30bf', bytes: 312130 },
  },
  'pichola-boat': {
    en: { durationSec: 91.4, marks: [0, 24.5, 45.5, 71.4], hash: '855aeb3109e7ee9b', bytes: 290894 },
  },
  'saheliyon-ki-bari': {
    en: { durationSec: 94.2, marks: [0, 27.6, 47.5, 74], hash: '4c987a889d2a449b', bytes: 299525 },
  },
  'sajjangarh': {
    en: { durationSec: 100.9, marks: [0, 28.5, 52.2, 74.2], hash: '658c8ffe6c01cd23', bytes: 318901 },
  },
};
