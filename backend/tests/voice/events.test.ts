import { describe, test } from 'node:test';
import { llm } from '@livekit/agents';
import { expect } from '../expect.ts';
import { describeEvents, events } from '../../src/voice/skills/events.ts';
import { crowds } from '../../src/voice/skills/crowds.ts';
import { SKILLS } from '../../src/voice/skills/index.ts';
import type { SkillContext } from '../../src/voice/skills/types.ts';

type Tool = { execute: (args: unknown, opts: unknown) => Promise<string> };
const run = (skill: typeof events, ctx: unknown, name: string, args: unknown) =>
  (skill.tools(ctx as SkillContext).find(t => t.name === name) as unknown as Tool).execute(args, { ctx: {}, toolCallId: 'x' });

describe('what GhoomMate says about a window', () => {
  test('names the festival, its dates, the crowd, the busiest place and the first respectful thing to do', () => {
    const text = describeEvents('2026-11-07', '2026-11-09', '2026-11-01');
    expect(text.startsWith('On from Sat, 7 Nov to Mon, 9 Nov:')).toBe(true);
    expect(text.includes('Diwali (Fri, 6 Nov to Sun, 8 Nov)')).toBe(true);
    expect(text.includes('Expect packed crowds')).toBe(true);
    expect(text.includes('Busiest around')).toBe(true);
    expect(text.includes('Lakshmi Puja is a family ritual at home')).toBe(true);
    expect(text.includes('Every evening: Dharohar folk dance show, 7:00–8:00 PM every evening; Kathputli puppet show')).toBe(true);
    expect(text.includes('Dates not announced yet, so don’t promise any: Shilpgram Utsav.') || text.includes("Dates not announced yet, so don't promise any: Shilpgram Utsav.")).toBe(true);
  });
  test('says so when the calendar has nothing, rather than inventing something', () => {
    const text = describeEvents('2027-05-01', '2027-05-07', '2026-11-01');
    expect(text.startsWith('No festivals or fairs in the verified calendar')).toBe(true);
    expect(text.includes('Every evening:')).toBe(true);
  });
  test('keeps long ranges short', () => {
    const text = describeEvents('2026-11-01', '2027-12-31', '2026-11-01');
    expect(text.includes('(and 13 more on the Explore screen)')).toBe(true);
  });
});

describe('the whats_on tool', () => {
  const trip = (startDate: string | null, endDate: string | null) => ({ trip: { startDate, endDate } });

  test('is registered with the other skills', () => {
    expect(SKILLS.map(s => s.name)).toEqual(['expenses', 'experiences', 'crowds', 'events', 'memory', 'navigation']);
    expect(events.instructions({} as SkillContext).includes('whats_on')).toBe(true);
  });
  test('defaults to the squad’s trip dates', async () => {
    const text = await run(events, trip('2027-03-20', '2027-03-22'), 'whats_on', {});
    expect(text.includes('Holika Dahan at the City Palace')).toBe(true);
    expect(text.includes('Holi, the colour day')).toBe(true);
    expect(text.includes('Diwali')).toBe(false);
  });
  test('takes dates the squad asks about', async () => {
    const text = await run(events, trip(null, null), 'whats_on', { from: '2027-07-05', to: '2027-07-05' });
    expect(text.includes('Jagannath Rath Yatra (Mon, 5 Jul)')).toBe(true);
    expect(text.includes('Jagdish Temple')).toBe(true);
  });
  test('turns away dates that are not dates', async () => {
    let failed = false;
    try { await run(events, trip(null, null), 'whats_on', { from: 'Diwali' }); } catch (err) { failed = err instanceof llm.ToolError; }
    expect(failed).toBe(true);
    failed = false;
    try { await run(events, trip(null, null), 'whats_on', { from: '2027-02-01', to: '2027-01-01' }); } catch (err) { failed = err instanceof llm.ToolError; }
    expect(failed).toBe(true);
  });
});

describe('the crowds skill on a festival day', () => {
  test('mentions the festival at the site', async () => {
    const day = new Date('2027-07-05T10:00:00Z');
    const RealDate = globalThis.Date;
    // liveCrowds() reads the clock, so freeze it at 3:30 PM IST on Rath Yatra day
    globalThis.Date = class extends RealDate {
      constructor(...args: unknown[]) { super(...((args.length ? args : [day.getTime()]) as [number])); }
      static now() { return day.getTime(); }
    } as DateConstructor;
    try {
      const text = await run(crowds, { trip: { destination: 'Udaipur' } }, 'check_crowds', { site_id: 'jagdish-temple' });
      expect(text.includes('Rath Yatra is on today')).toBe(true);
      expect(text.includes('Very heavy crowds near Jagdish Temple')).toBe(true);
    } finally {
      globalThis.Date = RealDate;
    }
  });
});
