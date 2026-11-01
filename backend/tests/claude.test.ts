import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { expect } from './expect.ts';
import { ClaudeError, claudeContent, createClaude } from '../src/claude.ts';

const SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };

// A fetch that records the request and answers with one Messages API response
function fakeFetch(answer: { text?: string; stop_reason?: string; stop_details?: unknown }) {
  const calls: { url: string; headers: Headers; body: any }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: answer.text === undefined ? [] : [{ type: 'text', text: answer.text }],
      stop_reason: answer.stop_reason ?? 'end_turn',
      stop_details: answer.stop_details ?? null,
      usage: { input_tokens: 10, output_tokens: 5 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { impl, calls };
}

describe('Claude client', () => {
  test('is off without ANTHROPIC_API_KEY and says so when called', async () => {
    const claude = createClaude({});
    expect(claude.enabled).toBe(false);
    await assert.rejects(claude.json({ prompt: 'hi', schema: SCHEMA }), ClaudeError);
  });

  test('sends text and images in order with structured output and the default refusal fallback', async () => {
    const { impl, calls } = fakeFetch({ text: '{"ok":true}' });
    const claude = createClaude({ ANTHROPIC_API_KEY: 'test-key' }, impl);
    expect(claude.model).toBe('claude-opus-5-5');
    const answer = await claude.json<{ ok: boolean }>({
      system: 'Be brief',
      prompt: [{ text: 'Photo 1:' }, { inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } }],
      schema: SCHEMA,
    });
    expect(answer).toEqual({ ok: true });
    const { body, headers } = calls[0];
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.system).toBe('Be brief');
    expect(body.fallbacks).toBe('default');
    expect(body.output_config).toEqual({ effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } });
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'Photo 1:' },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
    ]);
    expect(headers.get('anthropic-beta')?.includes('server-side-fallback-2026-07-01')).toBe(true);
  });

  test('CLAUDE_MODEL picks the model', async () => {
    const { impl, calls } = fakeFetch({ text: '{"ok":true}' });
    await createClaude({ ANTHROPIC_API_KEY: 'k', CLAUDE_MODEL: 'claude-sonnet-5-5' }, impl).json({ prompt: 'hi', schema: SCHEMA });
    expect(calls[0].body.model).toBe('claude-sonnet-5-5');
  });

  test('a refusal, a cut-off answer or broken JSON is an error, not a plan', async () => {
    const refused = fakeFetch({ stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: null } });
    await assert.rejects(createClaude({ ANTHROPIC_API_KEY: 'k' }, refused.impl).json({ prompt: 'hi', schema: SCHEMA }), { message: /Claude declined \(cyber\)/ });
    const cut = fakeFetch({ text: '{"ok":', stop_reason: 'max_tokens' });
    await assert.rejects(createClaude({ ANTHROPIC_API_KEY: 'k' }, cut.impl).json({ prompt: 'hi', schema: SCHEMA }), { message: /ran out of output tokens/ });
    const broken = fakeFetch({ text: 'not json' });
    await assert.rejects(createClaude({ ANTHROPIC_API_KEY: 'k' }, broken.impl).json({ prompt: 'hi', schema: SCHEMA }), { message: /invalid JSON/ });
  });

  test('HEIC photos are refused before anything is sent', () => {
    assert.throws(() => claudeContent([{ inlineData: { mimeType: 'image/heic', data: 'AAAA' } }]), ClaudeError);
  });
});
