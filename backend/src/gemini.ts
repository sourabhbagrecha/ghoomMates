import { GoogleAuth } from 'google-auth-library';
import { logger } from './logger.ts';
import { decodeCredentials } from './storage.ts';

// Shared Gemini client for structured JSON. Calls go to the Gemini Developer API (GEMINI_API_KEY), or to Vertex AI when
// there is no key and VERTEX_PROJECT is set (the GCS_CREDENTIALS_BASE64 service account when present, else Application
// Default Credentials). Images and narration are never generated here: they are prepared ahead of time.
// Every feature keeps a hand-written fallback, so callers check `enabled` and catch GeminiError.

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export type InlineData = { mimeType: string; data: string };
export type GeminiPart = { text: string } | { inlineData: InlineData };

export class GeminiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

export type GeminiModels = {
  // Fast structured text (itinerary-style drafts)
  lite: string;
  // Vision, storytelling and anything where quality matters more than a second of latency
  smart: string;
};

export type JsonRequest = {
  prompt: string | GeminiPart[];
  // Gemini responseSchema (OpenAPI subset: type OBJECT/ARRAY/STRING/NUMBER/INTEGER/BOOLEAN, properties, items, enum, required)
  schema: object;
  system?: string;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  // Short name for logs, e.g. 'Stories'
  label?: string;
};

export type Gemini = {
  readonly enabled: boolean;
  readonly models: GeminiModels;
  json<T>(request: JsonRequest): Promise<T>;
};

export function geminiModels(env: NodeJS.ProcessEnv = process.env): GeminiModels {
  return {
    lite: env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    smart: env.GEMINI_SMART_MODEL || 'gemini-3.5-flash',
  };
}

type Candidate = { content?: { parts?: { text?: string; inlineData?: InlineData }[] }; finishReason?: string };

export function createGemini(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Gemini {
  const key = env.GEMINI_API_KEY?.trim() || undefined;
  const vertexProject = env.VERTEX_PROJECT?.trim() || undefined;
  const vertexLocation = env.VERTEX_LOCATION?.trim() || 'global';
  const models = geminiModels(env);
  let auth: GoogleAuth | undefined;

  async function vertexToken() {
    auth ??= new GoogleAuth({ credentials: decodeCredentials(env) ?? undefined, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const token = await (await auth.getClient()).getAccessToken();
    if (!token.token) throw new GeminiError('No Google credentials for Vertex AI (run gcloud auth application-default login)');
    return token.token;
  }

  async function call(model: string, body: object, timeoutMs: number, label: string): Promise<Candidate> {
    if (!key && !vertexProject) throw new GeminiError('Neither GEMINI_API_KEY nor VERTEX_PROJECT is set');
    const vertex = !key;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const host = vertexLocation === 'global' ? 'aiplatform.googleapis.com' : `${vertexLocation}-aiplatform.googleapis.com`;
      const url = vertex
        ? `https://${host}/v1/projects/${vertexProject}/locations/${vertexLocation}/publishers/google/models/${model}:generateContent`
        : `${API}/${model}:generateContent`;
      const credentials: Record<string, string> = vertex ? { Authorization: `Bearer ${await vertexToken()}` } : { 'x-goog-api-key': key! };
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...credentials },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) throw new GeminiError(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
      const data = await res.json() as { candidates?: Candidate[]; promptFeedback?: { blockReason?: string } };
      const candidate = data.candidates?.[0];
      if (!candidate?.content?.parts?.length) {
        throw new GeminiError(`Gemini returned nothing (${data.promptFeedback?.blockReason ?? candidate?.finishReason ?? 'no candidates'})`);
      }
      logger.info(label, `Gemini (${model}${vertex ? ', Vertex AI' : ''}) answered in ${Date.now() - started}ms`);
      return candidate;
    } catch (err) {
      if (err instanceof GeminiError) throw err;
      const aborted = (err as Error).name === 'AbortError';
      throw new GeminiError(aborted ? `Gemini timed out after ${timeoutMs}ms` : `Gemini request failed: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  const parts = (prompt: string | GeminiPart[]) => (typeof prompt === 'string' ? [{ text: prompt }] : prompt);
  // Gemini 3 models think by default; minimal thinking keeps structured answers fast
  const thinking = (model: string) => (model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: 'minimal' } } : {});

  return {
    enabled: Boolean(key || vertexProject),
    models,

    async json<T>({ prompt, schema, system, model = models.lite, temperature = 0.7, timeoutMs = 40_000, label = 'Gemini' }: JsonRequest) {
      const candidate = await call(model, {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: 'user', parts: parts(prompt) }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature, ...thinking(model) },
      }, timeoutMs, label);
      const raw = candidate.content!.parts!.map(p => p.text ?? '').join('');
      try {
        return JSON.parse(raw) as T;
      } catch {
        throw new GeminiError(`Gemini returned invalid JSON: ${raw.slice(0, 120)}`);
      }
    },
  };
}
