import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { buildAgentConfig } from '../../src/voice/agent.ts';
import { addDays, istClock, planDay, rankExperiences, type Vibe } from '../../src/voice/experiences.ts';
import { EARLY_START_MINUTES, MAX_NOTES, emptyMemory, forget, memoryFrom, memoryLines, remember, rulesOf } from '../../src/voice/memory.ts';
import { resolveVibe } from '../../src/voice/skills/experiences.ts';
import type { SkillContext } from '../../src/voice/skills/types.ts';
import type { UiEvent } from '../../src/voice/protocol.ts';

const NOW = new Date('2026-10-31T02:30:00Z'); // Sat 8:00 AM IST
const vibe = (scores: Partial<Vibe>): Vibe => ({ adventure: 0.5, food: 0.5, nightlife: 0.5, culture: 0.5, chill: 0.5, shops: 0.5, ...scores });

describe('memory notes', () => {
  test('remember trims, replaces the same note and keeps the newest', () => {
    let memory = remember(emptyMemory(), { text: '  vegetarian ' });
    memory = remember(memory, { text: 'Vegetarian', avoid: ['nightlife'] });
    expect(memory.notes).toHaveLength(1);
    expect(memory.notes[0].avoid).toEqual(['nightlife']);
    for (let i = 0; i < MAX_NOTES + 3; i++) memory = remember(memory, { text: `note ${i}` });
    expect(memory.notes).toHaveLength(MAX_NOTES);
    expect(memory.notes.at(-1)?.text).toBe(`note ${MAX_NOTES + 2}`);
  });
  test('empty notes are ignored', () => {
    const memory = emptyMemory();
    expect(remember(memory, { text: '   ' })).toBe(memory);
  });
  test('forget matches loosely and drops the note’s rule with it', () => {
    const memory = remember(remember(emptyMemory(), { text: 'not a morning person', noEarlyStarts: true }), { text: 'vegetarian' });
    const { memory: next, removed } = forget(memory, 'morning');
    expect(removed.map(n => n.text)).toEqual(['not a morning person']);
    expect(rulesOf(next).noEarlyStarts).toBe(false);
    expect(forget(memory, 'skydiving').removed).toHaveLength(0);
  });
  test('rules add up: later budget wins, avoid beats like', () => {
    let memory = remember(emptyMemory(), { text: 'budget 2000', maxPriceRupees: 2000, likes: ['adventure', 'food'] });
    memory = remember(memory, { text: 'tighter budget', maxPriceRupees: 1200, avoid: ['food'] });
    expect(rulesOf(memory)).toEqual({ noEarlyStarts: false, maxPriceRupees: 1200, likes: ['adventure'], avoid: ['food'] });
  });
  test('memoryFrom keeps valid notes and drops junk', () => {
    const memory = memoryFrom({ vibe: {}, ghoomate: { notes: [{ text: 'vegetarian', at: 'x', likes: ['food', 'flying'], maxPriceRupees: -5 }, { nope: 1 }, 'str'] } });
    expect(memory.notes).toHaveLength(1);
    expect(memory.notes[0].likes).toEqual(['food']);
    expect(memory.notes[0].maxPriceRupees).toBe(undefined);
    expect(memoryFrom(null)).toEqual(emptyMemory());
  });
  test('memoryLines shows each note with its rule', () => {
    const memory = remember(emptyMemory(), { text: 'not a morning person', noEarlyStarts: true });
    expect(memoryLines(memory)).toEqual(['not a morning person (no starts before 8 AM)']);
  });
});

describe('rules shape picks', () => {
  test('no early starts and a budget filter recommendations and day plans', () => {
    const ranked = rankExperiences(vibe({ adventure: 0.9 }), { city: 'Udaipur', now: NOW, notBefore: EARLY_START_MINUTES, maxPriceRupees: 1500 });
    expect(ranked.length > 0).toBe(true);
    expect(ranked.every(r => r.run.minutes >= EARLY_START_MINUTES && r.experience.priceRupees <= 1500)).toBe(true);
    const stops = planDay(vibe({ chill: 0.9 }), { city: 'Udaipur', day: addDays(istClock(NOW).today, 1), now: NOW, notBefore: EARLY_START_MINUTES });
    expect(stops.every(s => s.start >= EARLY_START_MINUTES)).toBe(true);
  });
  test('remembered likes stand in for the quiz, so no mood question is needed', () => {
    const ctx = {
      me: { memberId: 'm1', name: 'Asha' },
      members: [{ memberId: 'm1', userId: 'u1', name: 'Asha', vibe: null }],
      memory: remember(emptyMemory(), { text: 'loves history', likes: ['culture'] }),
    };
    const resolved = resolveVibe(ctx, 'me');
    expect(resolved.basis).toBe('mood');
    expect(resolved.vibe!.culture).toBe(0.95);
  });
  test('squad picks follow the speaker’s dislikes but not their likes', () => {
    const memory = remember(emptyMemory(), { text: 'history buff, hates nightlife', likes: ['culture'], avoid: ['nightlife'] });
    const quiz = vibe({ culture: 0.2, nightlife: 0.8 });
    const ctx = { me: { memberId: 'm1', name: 'Asha' }, members: [{ memberId: 'm1', userId: 'u1', name: 'Asha', vibe: quiz }], memory };
    const { vibe: squad } = resolveVibe(ctx, 'squad');
    expect(squad!.culture).toBe(0.2);
    expect(squad!.nightlife).toBe(0.05);
  });
});

describe('agent tools', () => {
  function fakeCtx() {
    const events: UiEvent[] = [];
    const patches: unknown[] = [];
    const members = [{ memberId: 'm1', userId: 'u1', name: 'Asha Rao', vibe: null }];
    const ctx = {
      tripId: 't1',
      trip: { id: 't1', name: 'Lake Squad', destination: 'Udaipur', startDate: null, endDate: null, memberId: 'm1', members },
      me: { memberId: 'm1', name: 'Asha Rao' },
      members,
      memory: emptyMemory(),
      api: { get: async () => ({}), post: async () => ({}), patch: async (_path: string, body: unknown) => { patches.push(body); return {}; } },
      ui: async (event: UiEvent) => { events.push(event); },
      state: { pendingDraft: null, lastAdded: null },
    } as unknown as SkillContext;
    const { tools, instructions } = buildAgentConfig(ctx);
    const run = (name: string, args: unknown) =>
      (tools.find(t => t.name === name) as unknown as { execute: (a: unknown, o: unknown) => Promise<string> }).execute(args, { ctx: {}, toolCallId: 'x' });
    return { ctx, events, patches, run, instructions };
  }

  test('remember saves to the profile, confirms on screen and shapes the next picks', async () => {
    const { ctx, events, patches, run } = fakeCtx();
    await run('remember_preference', { note: 'not a morning person', no_early_starts: true, likes: ['chill'] });
    expect(patches).toEqual([{ preferences: { ghoomate: ctx.memory } }]);
    expect(events.some(e => e.type === 'notice' && e.message.includes('not a morning person'))).toBe(true);

    const reply = await run('recommend_experiences', { for_whom: 'me' });
    expect(reply.includes('no starts before 8 AM')).toBe(true);
    const card = events.find(e => e.type === 'experiences.recommended');
    if (card?.type !== 'experiences.recommended') throw new Error('no picks card');
    expect(card.basis).toBe('mood');
  });

  test('tools with a label show it while they run, then clear it', async () => {
    const { events, run } = fakeCtx();
    await run('recommend_experiences', { for_whom: 'me', likes: ['food'] });
    const working = events.filter(e => e.type === 'working').map(e => (e.type === 'working' ? e.label : ''));
    expect(working).toEqual(['Finding picks for you…', null]);
  });

  test('the prompt lists what was remembered and asks for a short filler before slow tools', () => {
    const { instructions } = fakeCtx();
    expect(instructions.includes('## Memory')).toBe(true);
    expect(instructions.includes('One sec')).toBe(true);
  });
});
