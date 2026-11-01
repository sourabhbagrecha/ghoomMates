// Shared sample data for the impact tests: a small Udaipur plan, a squad, and a fake Gemini.
import type { Gemini, JsonRequest } from '../../src/gemini.ts';
import type { ImpactStop } from '../../src/impact/crowd.ts';

export const TRIP_ID = '11111111-1111-4111-8111-111111111111';
export const stopId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const TIME = /^(\d{2}):(\d{2}) (AM|PM)$/;
export function stop(n: number, dayNumber: number, time: string, title: string, tag: string, place = ''): ImpactStop {
  const m = TIME.exec(time);
  const minutes = m ? (Number(m[1]) % 12 + (m[3] === 'PM' ? 12 : 0)) * 60 + Number(m[2]) : 0;
  return { id: stopId(n), dayNumber, time: m ? time : '', minutes, title, tag, place };
}

/**
 * Day 1: City Palace (quiet) → Jagdish Temple (a 460 m walk) → lunch at Jagdish Chowk → Sajjangarh (an auto ride up the hill)
 * Day 2: Shilpgram → City Palace at noon (a cab; packed) → check out (unplaced)
 */
export const PLAN: ImpactStop[] = [
  stop(1, 1, '09:30 AM', 'City Palace museum at opening', 'Culture', 'City Palace'),
  stop(2, 1, '11:00 AM', 'Jagdish Temple', 'Culture', 'Jagdish Temple'),
  stop(3, 1, '12:30 PM', 'Dal baati churma at a family kitchen', 'Food', 'Jagdish Chowk'),
  stop(4, 1, '04:00 PM', 'Sajjangarh Monsoon Palace', 'Culture', 'Sajjangarh'),
  stop(5, 2, '09:00 AM', 'Meet the makers at Shilpgram', 'Shops', 'Shilpgram crafts village'),
  stop(6, 2, '12:00 PM', 'City Palace again', 'Culture', 'City Palace'),
  stop(7, 2, '03:00 PM', 'Squad dinner', 'Food', ''),
];

export const SQUAD = [
  { memberId: 'm1', name: 'Asha' },
  { memberId: 'm2', name: 'Ben' },
  { memberId: 'm3', name: 'Chen' },
  { memberId: 'm4', name: 'Dia' },
  { memberId: 'm5', name: 'Eli' },
  { memberId: 'm6', name: 'Fay' },
];

export const TRIP = {
  id: TRIP_ID, name: 'Udaipur Escape', groupName: 'Lake Gang', destination: 'Udaipur, Rajasthan',
  // A Thursday in November: a plain weekday, no festival
  startDate: '2026-11-12', dayTitles: ['Palaces first', 'Makers and a mistake'],
};

type GeminiStub = (request: JsonRequest) => unknown;

/** A Gemini whose json() answers with whatever the stub returns (or throws) */
export function fakeGemini(stub: GeminiStub, enabled = true): Gemini & { calls: JsonRequest[] } {
  const calls: JsonRequest[] = [];
  return {
    enabled,
    imageEnabled: false,
    models: { lite: 'lite', smart: 'smart', image: 'image', tts: 'tts' },
    calls,
    json: async <T>(request: JsonRequest) => {
      calls.push(request);
      return stub(request) as T;
    },
    image: async () => { throw new Error('no images in tests'); },
    speech: async () => { throw new Error('no speech in tests'); },
  };
}
