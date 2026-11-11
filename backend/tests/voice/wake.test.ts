import { describe, test } from 'node:test';
import { expect } from '../expect.ts';
import { createVoiceAgent } from '../../src/voice/wake.ts';

const AGENT_URL = 'https://ghoommates-agent-123.asia-south1.run.app';

// A fake agent health server: answers each GET with the next status (the last one repeats), recording what it saw.
function healthServer(statuses: (number | Error)[]) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: (init.headers ?? {}) as Record<string, string> });
    const next = statuses[Math.min(calls.length, statuses.length) - 1];
    if (next instanceof Error) throw next;
    return new Response(next === 200 ? 'OK' : 'not connected to livekit', { status: next });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const agentFor = (fetchImpl: typeof fetch, url = AGENT_URL) =>
  createVoiceAgent({ url, fetch: fetchImpl, authHeaders: async () => ({ authorization: 'Bearer id-token' }), timeoutMs: 300, retryMs: 10, pingTimeoutMs: 100 });

describe('voice agent wake', () => {
  test('ready() checks the health endpoint with an ID token and is done on the first 200', async () => {
    const { calls, fetchImpl } = healthServer([200]);
    expect(await agentFor(fetchImpl, `${AGENT_URL}/`).ready()).toBe(true);
    expect(calls).toEqual([{ url: `${AGENT_URL}/`, headers: { authorization: 'Bearer id-token' } }]);
  });

  test('ready() keeps checking through 503s and network errors until the worker has registered', async () => {
    const { calls, fetchImpl } = healthServer([new TypeError('fetch failed'), 503, 503, 200]);
    expect(await agentFor(fetchImpl).ready()).toBe(true);
    expect(calls).toHaveLength(4);
  });

  test('ready() gives up after the timeout', async () => {
    const { calls, fetchImpl } = healthServer([503]);
    const started = Date.now();
    expect(await agentFor(fetchImpl).ready()).toBe(false);
    const ms = Date.now() - started;
    expect(ms >= 290 && ms < 1000).toBe(true);
    expect(calls.length > 3).toBe(true);
  });

  test('a local AGENT_URL is called without an ID token', async () => {
    const { calls, fetchImpl } = healthServer([200]);
    expect(await agentFor(fetchImpl, 'http://localhost:8081').ready()).toBe(true);
    expect(calls).toEqual([{ url: 'http://localhost:8081/', headers: {} }]);
  });

  test('ping() makes one check and reports whether the worker answered', async () => {
    const up = healthServer([200]);
    expect(await agentFor(up.fetchImpl).ping()).toBe(true);
    expect(up.calls).toHaveLength(1);
    const down = healthServer([new TypeError('fetch failed')]);
    expect(await agentFor(down.fetchImpl).ping()).toBe(false);
    expect(down.calls).toHaveLength(1);
  });
});
