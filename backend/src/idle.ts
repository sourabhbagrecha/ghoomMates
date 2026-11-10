// IDLE_EXIT_MINUTES: Cloud Run keeps an idle instance for up to 15 minutes after its last request, and with CPU always
// allocated (the inline voice worker) that idle time is billed. There is no setting for it, so the server exits once
// nothing has come in for a few minutes and the instance stops; the next visitor gets a cold start.
// A voice call sends this server no requests by itself; the web app pings /health every minute while one is live.
import type { Server } from 'node:http';
import { logger } from './logger.ts';

/** Calls onIdle once the server has had no request in flight for `minutes`. */
export function exitWhenIdle(server: Server, minutes: number, onIdle: () => void) {
  const limit = minutes * 60_000;
  let inFlight = 0;
  let lastActivity = Date.now();
  server.on('request', (_req, res) => {
    inFlight++;
    lastActivity = Date.now();
    res.on('close', () => {
      inFlight--;
      lastActivity = Date.now();
    });
  });
  const timer = setInterval(() => {
    if (inFlight > 0 || Date.now() - lastActivity < limit) return;
    clearInterval(timer);
    logger.info('Server', `No requests for ${minutes} min; exiting so Cloud Run stops this instance`);
    onIdle();
  }, Math.min(limit, 15_000));
  timer.unref();
}
