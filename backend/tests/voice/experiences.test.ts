import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { llm } from '@livekit/agents';
import { expect } from '../expect.ts';
import {
  EXPERIENCES,
  addDays,
  asVibe,
  blendVibes,
  cityForDestination,
  dayLabel,
  durationMinutes,
  formatTime,
  istClock,
  mainAxis,
  minutesOf,
  moodVibe,
  nextRun,
  pickVaried,
  planDay,
  rankExperiences,
  runOn,
  topAxes,
  type Vibe,
} from '../../src/voice/experiences.ts';
import { cancelPlan, commitPlan, experiences, reasonLabel, resolveVibe, vibeFor, whyLine } from '../../src/voice/skills/experiences.ts';
import type { SkillContext } from '../../src/voice/skills/types.ts';
import type { UiEvent } from '../../src/voice/protocol.ts';

const vibe = (scores: Partial<Vibe>): Vibe => ({ adventure: 0.2, food: 0.2, nightlife: 0.2, culture: 0.2, chill: 0.2, shops: 0.2, ...scores });
const adventurer = vibe({ adventure: 0.95, food: 0.7 });
const foodie = vibe({ food: 1, culture: 0.6 });

// Sat 31 Oct 2026, 9:00 PM IST
const SAT_9PM = new Date('2026-10-31T15:30:00Z');
// Sat 31 Oct 2026, 8:00 AM IST
const SAT_8AM = new Date('2026-10-31T02:30:00Z');
const byId = (id: string) => EXPERIENCES.find(e => e.id === id)!;

describe('time', () => {
  test('IST clock and labels', () => {
    const { today, minutes } = istClock(SAT_9PM);
    expect(today).toEqual({ year: 2026, month: 10, day: 31, weekday: 'Sat' });
    expect(minutes).toBe(21 * 60);
    expect(dayLabel(today, today)).toBe('Today');
    expect(dayLabel(addDays(today, 1), today)).toBe('Tomorrow');
    expect(dayLabel(addDays(today, 4), today)).toBe('Wed, 4 Nov');
  });
  test('times and durations', () => {
    expect(minutesOf('05:30 PM')).toBe(17 * 60 + 30);
    expect(minutesOf('12:15 AM')).toBe(15);
    expect(formatTime(17 * 60 + 30)).toBe('05:30 PM');
    expect(formatTime(0)).toBe('12:00 AM');
    expect(durationMinutes('3.5 hrs')).toBe(210);
  });
  test('the next run skips days it doesn’t run and starts that have passed', () => {
    expect(nextRun(byId('anjuna-flea-market-crawl'), SAT_9PM)!.day.day).toBe(4); // Wednesdays only
    const boat = nextRun(byId('pichola-sunset-boat'), SAT_9PM)!; // 4:45 PM daily: today's has gone
    expect(boat.day.day).toBe(1);
    expect(runOn(byId('pichola-sunset-boat'), istClock(SAT_8AM).today, SAT_8AM)?.minutes).toBe(minutesOf('04:45 PM'));
  });
});

describe('vibes', () => {
  test('asVibe needs every axis and clamps to 0–1', () => {
    expect(asVibe({ adventure: 1 })).toBe(null);
    expect(asVibe('nope')).toBe(null);
    expect(asVibe({ ...adventurer, shops: 3 })?.shops).toBe(1);
  });
  test('blendVibes averages the quiz-takers and skips the rest', () => {
    expect(blendVibes([null, undefined, { food: 1 }])).toBe(null);
    expect(blendVibes([vibe({ food: 1 }), vibe({ food: 0 }), null])?.food).toBe(0.5);
  });
  test('moodVibe lifts what they asked for and drops what they didn’t', () => {
    const mood = moodVibe(null, ['adventure'], ['nightlife']);
    expect(mood.adventure).toBe(0.95);
    expect(mood.nightlife).toBe(0.05);
    expect(moodVibe(foodie, ['chill']).food).toBe(1);
  });
  test('topAxes is strongest first', () => {
    expect(topAxes(adventurer)).toEqual(['adventure', 'food']);
  });
});

describe('rankExperiences', () => {
  test('an adventurer in Goa gets the waterfall trek first', () => {
    const [top] = rankExperiences(adventurer, { city: 'Goa', now: SAT_9PM });
    expect(top.experience.id).toBe('dudhsagar-spice-trek');
    expect(top.because[0]).toBe('adventure');
  });
  test('stays in the city, tag and time, and leaves out excluded ids', () => {
    const tonight = rankExperiences(foodie, { city: 'Goa', when: 'tonight', now: SAT_8AM });
    expect(tonight.length > 0).toBe(true);
    expect(tonight.every(r => r.run.day.day === 31 && r.run.minutes >= 17 * 60)).toBe(true);
    const nightlife = rankExperiences(adventurer, { city: 'Udaipur', tag: 'Nightlife', now: SAT_9PM, exclude: ['pichola-sunset-boat'] });
    expect(nightlife.every(r => r.experience.city === 'Udaipur' && r.experience.tags.includes('Nightlife'))).toBe(true);
    expect(rankExperiences(foodie, { city: 'Udaipur', now: SAT_9PM, exclude: ['haveli-rajasthani-cooking'] }).some(r => r.experience.id === 'haveli-rajasthani-cooking')).toBe(false);
  });
  test('without a vibe it falls back to rating', () => {
    const ranked = rankExperiences(null, { city: 'Goa', now: SAT_9PM });
    expect(ranked[0].match).toBe(null);
    expect(ranked[0].experience.rating).toBe(Math.max(...ranked.map(r => r.experience.rating)));
  });
  test('solo nudges toward small groups', () => {
    const solo = rankExperiences(adventurer, { city: 'Goa', now: SAT_9PM, solo: true });
    const small = solo.find(r => r.experience.groupSize <= 10)!;
    expect(small.score).toBe(small.match! + 4);
  });
  test('gives each quiz-taker their own fit', () => {
    const members = [{ memberId: 'm1', name: 'Asha', vibe: adventurer }, { memberId: 'm2', name: 'Kabir', vibe: foodie }];
    const [top] = rankExperiences(blendVibes([adventurer, foodie]), { city: 'Goa', now: SAT_9PM, members });
    expect(top.fits.map(f => f.name)).toEqual(['Asha', 'Kabir']);
  });
  test('pickVaried doesn’t hand a foodie three food trips', () => {
    const picks = pickVaried(rankExperiences(foodie, { city: 'Goa', now: SAT_9PM }), 3);
    expect(picks).toHaveLength(3);
    expect(picks.filter(p => mainAxis(p.experience) === 'food').length <= 2).toBe(true);
  });
});

describe('planDay', () => {
  const tomorrow = addDays(istClock(SAT_9PM).today, 1);
  test('up to three stops that run that day, in order, with time to get between them', () => {
    const stops = planDay(adventurer, { city: 'Goa', day: tomorrow, now: SAT_9PM });
    expect(stops.length > 1 && stops.length <= 3).toBe(true);
    expect(stops.every(s => s.experience.days.includes('Sun'))).toBe(true);
    for (let i = 1; i < stops.length; i++) expect(stops[i].start >= stops[i - 1].end + 45).toBe(true);
  });
  test('today leaves out what has already started', () => {
    const today = istClock(SAT_9PM).today;
    const stops = planDay(adventurer, { city: 'Goa', day: today, now: SAT_9PM });
    expect(stops.every(s => s.start >= 21 * 60 + 30)).toBe(true);
  });
});

describe('vibe choice', () => {
  const me = { memberId: 'm1', name: 'Asha Rao' };
  const members = (mine: unknown, theirs: unknown) => [
    { memberId: 'm1', userId: 'u1', name: 'Asha Rao', vibe: mine },
    { memberId: 'm2', userId: 'u2', name: 'Kabir', vibe: theirs },
  ];
  test("uses the speaker's quiz, then the squad's", () => {
    expect(vibeFor({ me, members: members(adventurer, foodie) }, 'me')).toEqual({ vibe: adventurer, basis: 'you' });
    expect(vibeFor({ me, members: members(null, foodie) }, 'me')).toEqual({ vibe: foodie, basis: 'squad' });
  });
  test('with no quiz results it asks a question instead of guessing', () => {
    const ctx = { me, members: members(null, undefined) };
    expect(() => resolveVibe(ctx, 'me')).toThrow();
    try { resolveVibe(ctx, 'me'); } catch (err) { expect(err instanceof llm.ToolError).toBe(true); }
    expect(resolveVibe(ctx, 'me', ['adventure']).basis).toBe('mood');
    expect(resolveVibe(ctx, 'me', [])).toEqual({ vibe: null, basis: 'rating' });
  });
  test('a mood on top of a quiz keeps the quiz basis', () => {
    const { vibe: v, basis } = resolveVibe({ me, members: members(foodie, null) }, 'me', ['chill']);
    expect(basis).toBe('you');
    expect(v!.chill).toBe(0.95);
  });
});

test('labels and why lines', () => {
  expect(reasonLabel(['adventure', 'food', 'chill'])).toBe('Adventure + food');
  expect(reasonLabel([])).toBe('Top rated');
  const trek = byId('dudhsagar-spice-trek');
  expect(whyLine('you', ['adventure', 'food'], trek)).toBe('You’re big on adventure and food');
  expect(whyLine('squad', ['culture'], trek)).toBe('Hits the squad’s culture side');
  expect(whyLine('rating', [], trek)).toBe('Guests rate it 4.9★');
});

describe('day plan tools', () => {
  function fakeCtx(fail = false) {
    const posts: { path: string; body: Record<string, unknown> }[] = [];
    const events: UiEvent[] = [];
    const { today } = istClock(new Date());
    const iso = (d: typeof today) => `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
    const members = [{ memberId: 'm1', userId: 'u1', name: 'Asha Rao', vibe: adventurer }];
    const ctx = {
      tripId: 't1',
      trip: { id: 't1', name: 'Goa Gang', destination: 'North Goa', startDate: iso(today), endDate: iso(addDays(today, 3)), memberId: 'm1', members },
      me: { memberId: 'm1', name: 'Asha Rao' },
      members,
      api: {
        get: async () => ({}),
        post: async (path: string, body: unknown) => {
          if (fail && posts.length === 1) throw new Error('boom');
          posts.push({ path, body: body as Record<string, unknown> });
          return { id: `s${posts.length}` };
        },
      },
      ui: async (event: UiEvent) => { events.push(event); },
      state: { pendingDraft: null, lastAdded: null },
    } as unknown as SkillContext;
    const tool = (name: string) => experiences.tools(ctx).find(t => t.name === name) as unknown as { execute: (args: unknown, opts: unknown) => Promise<string> };
    return { ctx, posts, events, tool };
  }

  test('plan → add writes each stop once, on the right day', async () => {
    const { ctx, posts, events, tool } = fakeCtx();
    await tool('plan_day').execute({ for_whom: 'me', day: 'tomorrow' }, { ctx: {}, toolCallId: 'x' });
    const plan = events.find(e => e.type === 'day.plan');
    if (plan?.type !== 'day.plan') throw new Error('no plan card');
    expect(plan.plan.dayNumber).toBe(2);

    const first = await commitPlan(ctx, plan.plan.id);
    expect(first).toEqual({ dayNumber: 2, count: plan.plan.stops.length, duplicate: false });
    expect(posts.map(p => p.body.title)).toEqual(plan.plan.stops.map(s => byId(s.experienceId).title));
    expect(posts.every(p => p.path === '/api/trips/t1/stops' && p.body.dayNumber === 2 && typeof p.body.tag === 'string')).toBe(true);

    expect((await commitPlan(ctx, plan.plan.id)).duplicate).toBe(true);
    expect(posts).toHaveLength(plan.plan.stops.length);
    expect(cancelPlan(ctx, plan.plan.id)).toBe(null);
    expect(events.some(e => e.type === 'day.plan.added')).toBe(true);
  });

  test('a failed save keeps only the unsaved stops for the retry', async () => {
    const { ctx, posts, events, tool } = fakeCtx(true);
    await tool('plan_day').execute({ for_whom: 'me', day: 'tomorrow' }, { ctx: {}, toolCallId: 'x' });
    const plan = events.find(e => e.type === 'day.plan');
    if (plan?.type !== 'day.plan' || plan.plan.stops.length < 2) return; // needs two stops to fail between
    let failed = false;
    try { await commitPlan(ctx, plan.plan.id); } catch { failed = true; }
    expect(failed).toBe(true);
    expect(posts).toHaveLength(1);
  });

  test('cancel drops the plan and tells the card', async () => {
    const { ctx, events, tool } = fakeCtx();
    await tool('plan_day').execute({ for_whom: 'me', day: 'tomorrow' }, { ctx: {}, toolCallId: 'x' });
    const dropped = cancelPlan(ctx);
    expect(dropped !== null).toBe(true);
    expect(events.at(-1)?.type).toBe('day.plan.cancelled');
  });

  test('a tapped Join is remembered and not recommended again', async () => {
    const { ctx, events, tool } = fakeCtx();
    await experiences.onAction!({ type: 'experience.join', experienceId: 'dudhsagar-spice-trek' }, ctx);
    await tool('recommend_experiences').execute({ for_whom: 'me' }, { ctx: {}, toolCallId: 'x' });
    const card = events.find(e => e.type === 'experiences.recommended');
    if (card?.type !== 'experiences.recommended') throw new Error('no picks card');
    expect(card.picks.some(p => p.experienceId === 'dudhsagar-spice-trek')).toBe(false);
    expect(card.picks.every(p => p.why.length > 0 && p.when.includes('·'))).toBe(true);
  });

  test('expense taps are left to the expenses skill', async () => {
    const { ctx } = fakeCtx();
    expect(await experiences.onAction!({ type: 'confirm', draftId: 'd1' }, ctx)).toBe(null);
  });
});

// The cards look experiences up in the frontend catalogue by id, so both copies must agree.
test('the agent catalogue matches the frontend one', () => {
  const source = readFileSync(new URL('../../../frontend/src/pages/Explore/experiencesData.ts', import.meta.url), 'utf8');
  const everyDay = "['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']";
  const frontend = [...source.matchAll(/\n {4}id: '([^']+)',\n {4}city: '([^']+)',[\s\S]*?\n {4}price: (\d+),\n {4}days: ([^\n]+),\n {4}startTime: '([^']+)',[\s\S]*?\n {4}groupSize: (\d+),/g)]
    .map(([, id, city, price, days, start, group]) => `${id} ${city} ${price} ${days === 'EVERY_DAY' ? everyDay : days} ${start} ${group}`)
    .sort();
  const agent = EXPERIENCES.map(e => `${e.id} ${e.city} ${e.priceRupees} [${e.days.map(d => `'${d}'`).join(', ')}] ${e.startTime} ${e.groupSize}`).sort();
  expect(frontend).toHaveLength(EXPERIENCES.length);
  expect(agent).toEqual(frontend);
});
