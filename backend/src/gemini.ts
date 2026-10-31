import { GoogleAuth } from 'google-auth-library';
import { logger } from './logger.ts';

// Shared Gemini client: structured JSON, images and speech.
// Text and speech go to the Gemini Developer API (GEMINI_API_KEY). Images go to Vertex AI when VERTEX_PROJECT is
// set (Application Default Credentials: `gcloud auth application-default login` locally, the service account on
// Cloud Run), since API-key image quota is often zero. Without a key, text and speech fall back to Vertex too.
// Every feature keeps a hand-written fallback, so callers check `enabled` / `imageEnabled` and catch GeminiError.

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
  // Image generation and editing ("Nano Banana")
  image: string;
  // Speech synthesis
  tts: string;
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

export type ImageRequest = {
  prompt: string;
  // Reference images to edit or restyle
  images?: InlineData[];
  model?: string;
  // '1:1', '3:4', '4:3', '4:5', '9:16', '16:9' …
  aspectRatio?: string;
  timeoutMs?: number;
  label?: string;
};

export type SpeechRequest = {
  // What to say. Style directions can lead the text ("Read like a village storyteller: …").
  text: string;
  // Prebuilt voice for a single narrator (e.g. 'Charon', 'Kore', 'Puck', 'Sulafat')
  voice?: string;
  // Two named speakers for a dialogue; the text must prefix lines with "<name>: "
  speakers?: { name: string; voice: string }[];
  model?: string;
  timeoutMs?: number;
  label?: string;
};

export type Gemini = {
  // Text and speech are available
  readonly enabled: boolean;
  // Image generation is available
  readonly imageEnabled: boolean;
  readonly models: GeminiModels;
  json<T>(request: JsonRequest): Promise<T>;
  image(request: ImageRequest): Promise<{ mimeType: string; data: Buffer; text: string }>;
  // A ready-to-play WAV (16-bit mono PCM)
  speech(request: SpeechRequest): Promise<Buffer>;
};

export function geminiModels(env: NodeJS.ProcessEnv = process.env): GeminiModels {
  return {
    lite: env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    smart: env.GEMINI_SMART_MODEL || 'gemini-3.5-flash',
    // On Vertex the 2.5 image model is the one generally available; the API key may list newer ones
    image: env.GEMINI_IMAGE_MODEL || (env.VERTEX_PROJECT ? 'gemini-2.5-flash-image' : 'gemini-3.1-flash-image'),
    tts: env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts',
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
    auth ??= new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const token = await (await auth.getClient()).getAccessToken();
    if (!token.token) throw new GeminiError('No Google credentials for Vertex AI (run gcloud auth application-default login)');
    return token.token;
  }

  async function call(model: string, body: object, timeoutMs: number, label: string, vertex = !key): Promise<Candidate> {
    if (!key && !vertexProject) throw new GeminiError('Neither GEMINI_API_KEY nor VERTEX_PROJECT is set');
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
    imageEnabled: Boolean(key || vertexProject),
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

    async image({ prompt, images = [], model = models.image, aspectRatio, timeoutMs = 90_000, label = 'Gemini' }: ImageRequest) {
      const candidate = await call(model, {
        contents: [{ role: 'user', parts: [{ text: prompt }, ...images.map(inlineData => ({ inlineData }))] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'], ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}) },
      }, timeoutMs, label, Boolean(vertexProject));
      const found = candidate.content!.parts!.find(p => p.inlineData?.data);
      if (!found?.inlineData) throw new GeminiError('Gemini returned no image');
      const text = candidate.content!.parts!.map(p => p.text ?? '').join('').trim();
      return { mimeType: found.inlineData.mimeType || 'image/png', data: Buffer.from(found.inlineData.data, 'base64'), text };
    },

    async speech({ text, voice = 'Charon', speakers, model = models.tts, timeoutMs = 90_000, label = 'Gemini' }: SpeechRequest) {
      const speechConfig = speakers?.length
        ? { multiSpeakerVoiceConfig: { speakerVoiceConfigs: speakers.map(s => ({ speaker: s.name, voiceConfig: { prebuiltVoiceConfig: { voiceName: s.voice } } })) } }
        : { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } };
      const candidate = await call(model, {
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig },
      }, timeoutMs, label);
      const audio = candidate.content!.parts!.find(p => p.inlineData?.data)?.inlineData;
      if (!audio) throw new GeminiError('Gemini returned no audio');
      const pcm = Buffer.from(audio.data, 'base64');
      // Raw PCM comes back as e.g. "audio/L16;codec=pcm;rate=24000"
      const rate = Number(/rate=(\d+)/.exec(audio.mimeType)?.[1]) || 24_000;
      return audio.mimeType.includes('wav') ? pcm : wavFromPcm(pcm, rate);
    },
  };
}

/** Wraps 16-bit little-endian mono PCM in a WAV header so browsers can play it. */
export function wavFromPcm(pcm: Buffer, sampleRate = 24_000, channels = 1) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
