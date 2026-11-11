// The GhoomMate worker's own Cloud Run service (VOICE_AGENT_URL) scales to zero, so the web server wakes it when a
// chat starts and keeps it up while one lasts. Its LiveKit health server answers GET / with 200 only once the worker
// has registered with LiveKit (503 "not connected to livekit" before), and LiveKit drops a dispatch that finds no
// registered worker rather than queueing it. So a session token is handed out only after the worker is ready.
import { GoogleAuth } from 'google-auth-library';
import { idTokenHeaders, isLocalUrl } from '../idToken.ts';
import { logger } from '../logger.ts';

// A cold start (container, Node, the worker's inference process, then registering with LiveKit) takes ~5 to 15 s.
const READY_TIMEOUT_MS = 25_000;
const RETRY_MS = 1000;
const PING_TIMEOUT_MS = 10_000;

export type VoiceAgent = {
  /** Wakes the agent service; true once its worker is registered with LiveKit, false if it isn't within the timeout */
  ready(): Promise<boolean>;
  /** One health check, which counts as a request so Cloud Run keeps the instance (and the call on it) up */
  ping(): Promise<boolean>;
};

type Deps = {
  url: string;
  fetch?: typeof fetch;
  // Returns Authorization headers for the service; defaults to an ID token for this server's own service account
  // (the web service's runtime account on Cloud Run, which has roles/run.invoker on the agent service).
  authHeaders?: (url: string) => Promise<Record<string, string>>;
  timeoutMs?: number;
  retryMs?: number;
  pingTimeoutMs?: number;
};

export function createVoiceAgent({
  url: rawUrl,
  fetch: fetchImpl = fetch,
  authHeaders,
  timeoutMs = READY_TIMEOUT_MS,
  retryMs = RETRY_MS,
  pingTimeoutMs = PING_TIMEOUT_MS,
}: Deps): VoiceAgent {
  const url = rawUrl.replace(/\/+$/, '');
  const headersFor = authHeaders ?? idTokenHeaders(() => new GoogleAuth());

  // GET / on the worker's health server: 200 "OK" when registered, 503 while it connects
  async function check(ms: number) {
    const auth = isLocalUrl(url) ? {} : await headersFor(url);
    const res = await fetchImpl(`${url}/`, { headers: auth, signal: AbortSignal.timeout(ms) });
    const body = await res.text().catch(() => '');
    return { ok: res.ok, detail: `${res.status} ${body.slice(0, 80)}`.trim() };
  }

  return {
    async ready() {
      const started = Date.now();
      const deadline = started + timeoutMs;
      let attempts = 0;
      let last = 'no answer';
      for (;;) {
        attempts += 1;
        try {
          const result = await check(Math.max(1, deadline - Date.now()));
          if (result.ok) {
            const ms = Date.now() - started;
            if (attempts > 1 || ms > 2000) logger.info('Voice', `Voice agent ready after ${ms} ms (${attempts} check(s))`);
            return true;
          }
          last = result.detail;
        } catch (err: any) {
          last = `${err?.name ?? 'Error'} ${err?.message ?? ''}`.trim();
        }
        const wait = Math.min(retryMs, deadline - Date.now());
        if (wait <= 0) break;
        await new Promise(resolve => setTimeout(resolve, wait));
      }
      logger.warn('Voice', `Voice agent not ready after ${Date.now() - started} ms (${attempts} check(s)); last: ${last}`);
      return false;
    },

    async ping() {
      try {
        return (await check(pingTimeoutMs)).ok;
      } catch (err: any) {
        logger.warn('Voice', `Voice agent keepalive failed: ${err?.name ?? 'Error'} ${err?.message ?? ''}`);
        return false;
      }
    },
  };
}
