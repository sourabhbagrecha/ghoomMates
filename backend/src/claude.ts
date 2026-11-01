import Anthropic from '@anthropic-ai/sdk';
import type { GeminiPart } from './gemini.ts';
import { logger } from './logger.ts';

// Claude (Anthropic API) as a second writer for structured JSON, used when Gemini fails. Takes the same text and
// inline-image parts as gemini.json(), so a feature can hand the identical prompt to either. Needs ANTHROPIC_API_KEY;
// callers check `enabled` and catch ClaudeError.

export class ClaudeError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ClaudeError';
    this.status = status;
  }
}

export type ClaudeJsonRequest = {
  prompt: string | GeminiPart[];
  // JSON Schema for structured outputs: lowercase types, `required` and `additionalProperties: false` on every object
  schema: Record<string, unknown>;
  system?: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high';
  timeoutMs?: number;
  // Short name for logs, e.g. 'Reels'
  label?: string;
};

export type Claude = {
  readonly enabled: boolean;
  readonly model: string;
  json<T>(request: ClaudeJsonRequest): Promise<T>;
};

// Image types Claude reads; anything else (HEIC) has to be left out of the prompt
export const CLAUDE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type ClaudeImageType = (typeof CLAUDE_IMAGE_TYPES)[number];

export const claudeReadsImage = (mimeType: string): mimeType is ClaudeImageType => (CLAUDE_IMAGE_TYPES as readonly string[]).includes(mimeType);

/** Gemini-style parts as Claude content blocks, images in place. */
export function claudeContent(prompt: string | GeminiPart[]): Anthropic.Beta.BetaContentBlockParam[] {
  if (typeof prompt === 'string') return [{ type: 'text', text: prompt }];
  return prompt.map((part): Anthropic.Beta.BetaContentBlockParam => {
    if ('text' in part) return { type: 'text', text: part.text };
    if (!claudeReadsImage(part.inlineData.mimeType)) throw new ClaudeError(`Claude can't read ${part.inlineData.mimeType} images`);
    return { type: 'image', source: { type: 'base64', media_type: part.inlineData.mimeType, data: part.inlineData.data } };
  });
}

export function createClaude(env: NodeJS.ProcessEnv = process.env, fetchImpl?: typeof fetch): Claude {
  const apiKey = env.ANTHROPIC_API_KEY?.trim() || undefined;
  const model = env.CLAUDE_MODEL?.trim() || 'claude-opus-5-5';
  // No SDK retries: Claude is already the second try, and the caller's deadline is what counts
  const client = apiKey ? new Anthropic({ apiKey, maxRetries: 0, ...(fetchImpl ? { fetch: fetchImpl } : {}) }) : undefined;

  return {
    enabled: Boolean(client),
    model,

    async json<T>({ prompt, schema, system, model: requested = model, effort = 'medium', timeoutMs = 60_000, label = 'Claude' }: ClaudeJsonRequest) {
      if (!client) throw new ClaudeError('ANTHROPIC_API_KEY is not set');
      const started = Date.now();
      let response: Anthropic.Beta.BetaMessage;
      try {
        response = await client.beta.messages.create({
          model: requested,
          max_tokens: 16_000,
          ...(system ? { system } : {}),
          messages: [{ role: 'user', content: claudeContent(prompt) }],
          output_config: { effort, format: { type: 'json_schema', schema } },
          // A policy decline is re-run server-side on the model Anthropic recommends for that category
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        }, { timeout: timeoutMs });
      } catch (err) {
        if (err instanceof ClaudeError) throw err;
        if (err instanceof Anthropic.APIConnectionTimeoutError) throw new ClaudeError(`Claude timed out after ${timeoutMs}ms`);
        if (err instanceof Anthropic.APIError) throw new ClaudeError(`Claude ${err.status ?? ''}: ${err.message}`.slice(0, 300), err.status);
        throw new ClaudeError(`Claude request failed: ${(err as Error).message}`);
      }
      if (response.stop_reason === 'refusal') throw new ClaudeError(`Claude declined (${response.stop_details?.category ?? 'no category'})`);
      if (response.stop_reason === 'max_tokens') throw new ClaudeError('Claude ran out of output tokens');
      const raw = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
      logger.info(label, `Claude (${response.model}) answered in ${Date.now() - started}ms`);
      try {
        return JSON.parse(raw) as T;
      } catch {
        throw new ClaudeError(`Claude returned invalid JSON: ${raw.slice(0, 120)}`);
      }
    },
  };
}
