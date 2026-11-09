// VOICE_WORKER=inline: the web server runs the GhoomMate worker (agent.ts) as a child process, so one Cloud Run service
// with CPU always allocated and no minimum instances serves both. The worker is connected to LiveKit whenever the app
// has an instance up and costs nothing when nobody is around. It calls the API on this server's port (BACKEND_URL
// defaults to 127.0.0.1:$PORT).
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { logger } from '../logger.ts';

/** Starts the worker and restarts it if it crashes (backing off up to 30 s). Returns a function that stops it. */
export function startInlineVoiceWorker(): () => void {
  const script = fileURLToPath(new URL('./agent.ts', import.meta.url));
  let child: ChildProcess | undefined;
  let stopped = false;
  let failures = 0;

  const start = () => {
    const startedAt = Date.now();
    child = spawn(process.execPath, [script, 'start'], { stdio: 'inherit' });
    child.on('exit', (code, signal) => {
      if (stopped || code === 0) return;
      failures = Date.now() - startedAt > 60_000 ? 0 : failures + 1;
      const delay = Math.min(30_000, 1000 * 2 ** failures);
      logger.warn('Voice', `Voice worker exited (${signal ?? `code ${code}`}); restarting in ${delay / 1000}s`);
      setTimeout(start, delay).unref();
    });
  };
  start();
  logger.info('Voice', 'Voice worker running inside the web server (VOICE_WORKER=inline)');

  return () => {
    stopped = true;
    child?.kill('SIGTERM');
  };
}
