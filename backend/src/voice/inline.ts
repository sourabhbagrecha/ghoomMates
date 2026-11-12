// VOICE_WORKER=inline: the web server runs the GhoomMate worker (agent.ts) as a child process, so one container serves
// the API and voice. On Cloud Run the web service keeps request-based billing (CPU only while a request is open): a
// call holds its POST /api/voice/session request open for as long as it lasts (see app.ts), which keeps the CPU on
// for the worker and the call. Between calls the instance is throttled and costs nothing; the worker's LiveKit
// connection may drop then and reconnects on the next request.
//
// Throttling can also leave the worker broken for good: its child processes treat 15 s without a ping from it as
// being orphaned and exit (ORPHANED_TIMEOUT in @livekit/agents). It replaces job processes but not its inference
// process, so its health check stays at 503 "inference process not running". The readiness check restarts it then.
//
// Each instance registers its worker under its own agent name, and the session endpoint dispatches to that name, so a
// call's job runs on the instance that holds its request. The worker calls the API on this server's port (BACKEND_URL
// defaults to 127.0.0.1:$PORT).
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { logger } from '../logger.ts';

// In production mode the worker's LiveKit health server listens here (ServerOptions.port in @livekit/agents)
const HEALTH_URL = 'http://127.0.0.1:8081/';
// A cold start (Node, the worker's job process, then registering with LiveKit) takes ~5 to 15 s.
const READY_TIMEOUT_MS = 25_000;
const RETRY_MS = 500;
// A worker this young is still starting, not broken
const RESTART_GRACE_MS = 30_000;

export type VoiceWorker = {
  /** The agent name this worker registers with; sessions must dispatch to it */
  agentName: string;
  /** True once the worker is registered with LiveKit, false if it isn't within the timeout */
  ready(): Promise<boolean>;
  stop(): void;
};

/** This instance's agent name: the shared one plus a random suffix */
export const instanceAgentName = (base: string) => `${base}-${randomBytes(4).toString('hex')}`;

type ReadyOptions = {
  url?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  retryMs?: number;
  /** Called (once per check) when the worker can't recover by itself; it should restart it */
  restart?: () => void;
};

// The only health answer that doesn't clear up on its own: the inference process is gone and nothing restarts it
const BROKEN = 'inference process not running';

// The worker's health server answers GET / with 200 only once it has registered with LiveKit (503 "not connected to
// livekit" before), and LiveKit drops a dispatch that finds no registered worker rather than queueing it.
export function workerReady({ url = HEALTH_URL, fetch: fetchImpl = fetch, timeoutMs = READY_TIMEOUT_MS, retryMs = RETRY_MS, restart }: ReadyOptions = {}) {
  return async () => {
    const started = Date.now();
    const deadline = started + timeoutMs;
    let attempts = 0;
    let last = 'no answer';
    let restarted = false;
    for (;;) {
      attempts += 1;
      try {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
        if (res.ok) {
          const ms = Date.now() - started;
          if (attempts > 1 || ms > 2000) logger.info('Voice', `Voice worker ready after ${ms} ms (${attempts} check(s))`);
          return true;
        }
        last = `${res.status} ${(await res.text().catch(() => '')).slice(0, 80)}`.trim();
        if (restart && !restarted && last.includes(BROKEN)) {
          restarted = true;
          logger.warn('Voice', `Voice worker is broken (${last}); restarting it`);
          restart();
        }
      } catch (err: any) {
        last = `${err?.name ?? 'Error'} ${err?.message ?? ''}`.trim();
      }
      const wait = Math.min(retryMs, deadline - Date.now());
      if (wait <= 0) break;
      await new Promise(resolve => setTimeout(resolve, wait));
    }
    logger.warn('Voice', `Voice worker not ready after ${Date.now() - started} ms (${attempts} check(s)); last: ${last}`);
    return false;
  };
}

/** Starts the worker under `agentName` and restarts it if it crashes (backing off up to 30 s). */
export function startInlineVoiceWorker(agentName: string): VoiceWorker {
  const script = fileURLToPath(new URL('./agent.ts', import.meta.url));
  let child: ChildProcess | undefined;
  let stopped = false;
  let restarting = false;
  let failures = 0;

  let startedAt = 0;
  const start = () => {
    startedAt = Date.now();
    child = spawn(process.execPath, [script, 'start'], { stdio: 'inherit', env: { ...process.env, GHOOMATE_AGENT_NAME: agentName } });
    child.on('exit', (code, signal) => {
      if (stopped) return;
      if (restarting) {
        restarting = false;
        return start();
      }
      if (code === 0) return;
      failures = Date.now() - startedAt > 60_000 ? 0 : failures + 1;
      const delay = Math.min(30_000, 1000 * 2 ** failures);
      logger.warn('Voice', `Voice worker exited (${signal ?? `code ${code}`}); restarting in ${delay / 1000}s`);
      setTimeout(start, delay).unref();
    });
  };
  start();
  logger.info('Voice', `Voice worker running inside the web server as "${agentName}"`);

  return {
    agentName,
    // SIGKILL, not a graceful stop: the new worker needs the health port now, and the old one has nothing to save
    ready: workerReady({
      restart: () => {
        // Two calls starting together both see the broken worker; the second must not kill the fresh one
        if (restarting || Date.now() - startedAt < RESTART_GRACE_MS) return;
        if (!child || child.exitCode !== null || child.signalCode !== null) return;
        restarting = true;
        child.kill('SIGKILL');
      },
    }),
    stop() {
      stopped = true;
      child?.kill('SIGTERM');
    },
  };
}
