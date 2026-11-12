import { EventEmitter } from 'node:events';
import { describe, test } from 'node:test';
import { voice } from '@livekit/agents';
import { expect } from '../expect.ts';
import { hangUpWhenAway, idleHangupSeconds } from '../../src/voice/idle.ts';

const userState = (session: EventEmitter, newState: string) => session.emit(voice.AgentSessionEventTypes.UserStateChanged, { newState });
const tick = () => new Promise(resolve => setImmediate(resolve));

describe('idle hang-up', () => {
  test('hangs up once, the first time the user turns away', async () => {
    const session = new EventEmitter();
    let calls = 0;
    hangUpWhenAway(session, () => { calls += 1; });
    userState(session, 'speaking');
    userState(session, 'listening');
    await tick();
    expect(calls).toBe(0);
    userState(session, 'away');
    userState(session, 'listening');
    userState(session, 'away');
    await tick();
    expect(calls).toBe(1);
  });

  test('a failing hang-up does not throw out of the event', async () => {
    const session = new EventEmitter();
    hangUpWhenAway(session, async () => { throw new Error('room already gone'); });
    userState(session, 'away');
    await tick();
  });

  test('GHOOMATE_IDLE_HANGUP_S sets the timeout; 0 turns it off', () => {
    const saved = process.env.GHOOMATE_IDLE_HANGUP_S;
    try {
      delete process.env.GHOOMATE_IDLE_HANGUP_S;
      expect(idleHangupSeconds()).toBe(30);
      process.env.GHOOMATE_IDLE_HANGUP_S = '45';
      expect(idleHangupSeconds()).toBe(45);
      process.env.GHOOMATE_IDLE_HANGUP_S = '0';
      expect(idleHangupSeconds()).toBe(null);
    } finally {
      if (saved === undefined) delete process.env.GHOOMATE_IDLE_HANGUP_S;
      else process.env.GHOOMATE_IDLE_HANGUP_S = saved;
    }
  });
});
