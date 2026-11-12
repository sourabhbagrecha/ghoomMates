import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { instanceAgentName, workerReady } from '../../src/voice/inline.ts';

// A fake worker health server: answers each GET with the next status (the last one repeats), counting the calls.
function healthServer(statuses: (number | Error)[]) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    const next = statuses[Math.min(calls.length, statuses.length) - 1];
    if (next instanceof Error) throw next;
    return new Response(next === 200 ? 'OK' : 'not connected to livekit', { status: next });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const readyFor = (fetchImpl: typeof fetch) => workerReady({ url: 'http://127.0.0.1:8081/', fetch: fetchImpl, timeoutMs: 300, retryMs: 10 });

describe('inline voice worker', () => {
  test('ready() is done on the first 200 from the health server', async () => {
    const { calls, fetchImpl } = healthServer([200]);
    expect(await readyFor(fetchImpl)()).toBe(true);
    expect(calls).toEqual(['http://127.0.0.1:8081/']);
  });

  test('ready() keeps checking through 503s and network errors until the worker has registered', async () => {
    const { calls, fetchImpl } = healthServer([new TypeError('fetch failed'), 503, 503, 200]);
    expect(await readyFor(fetchImpl)()).toBe(true);
    expect(calls).toHaveLength(4);
  });

  test('ready() gives up after the timeout', async () => {
    const { calls, fetchImpl } = healthServer([503]);
    const started = Date.now();
    expect(await readyFor(fetchImpl)()).toBe(false);
    const ms = Date.now() - started;
    expect(ms >= 290 && ms < 1000).toBe(true);
    expect(calls.length > 3).toBe(true);
  });

  test('ready() restarts a worker whose inference process is gone, once, and waits for the new one', async () => {
    const bodies = ['inference process not running', 'inference process not running', 'not connected to livekit', 'OK'];
    let n = 0;
    const fetchImpl = (async () => {
      const body = bodies[Math.min(n++, bodies.length - 1)];
      return new Response(body, { status: body === 'OK' ? 200 : 503 });
    }) as unknown as typeof fetch;
    let restarts = 0;
    const ready = workerReady({ fetch: fetchImpl, timeoutMs: 300, retryMs: 10, restart: () => { restarts += 1; } });
    expect(await ready()).toBe(true);
    expect(restarts).toBe(1);
  });

  test('ready() leaves a worker that is only reconnecting alone', async () => {
    const { fetchImpl } = healthServer([503, 200]);
    let restarts = 0;
    expect(await workerReady({ fetch: fetchImpl, timeoutMs: 300, retryMs: 10, restart: () => { restarts += 1; } })()).toBe(true);
    expect(restarts).toBe(0);
  });

  test('each instance gets its own agent name', () => {
    const a = instanceAgentName('ghoomate-prod');
    expect(/^ghoomate-prod-[0-9a-f]{8}$/.test(a)).toBe(true);
    expect(a === instanceAgentName('ghoomate-prod')).toBe(false);
  });
});
