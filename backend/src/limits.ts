import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request, RequestHandler } from 'express';
import type { Db } from 'mongodb';
import { verifyJwt } from './auth/jwt.ts';
import { ApiError } from './http.ts';
import { logger } from './logger.ts';

// Abuse protection, so nobody can run up the bill or take the app down for everyone else. Google sign-in keeps
// strangers out of trip data, but anyone can make a Google account, and some routes need no sign-in at all.
//
//   1. Edge lock: with EDGE_SECRET set, only requests that came through the Cloudflare Worker (it adds the secret) reach
//      the routes; anything sent straight to the run.app address gets 403, so nobody can skip Cloudflare.
//   2. Rate limits per caller (the signed-in user, else the IP address) and per IP, kept in memory on each instance.
//   3. Daily budgets for what costs money per call (Gemini, voice minutes), counted in MongoDB so every instance shares
//      them. A spent Gemini budget is not an outage: every AI feature already falls back to its hand-written answer.
//
// Limits and the reasoning behind each number are in backend/docs/limits.md.

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const verifiedIps = new WeakMap<Request, string>();

/** The caller's IP address. Through the Worker it is the visitor's (CF-Connecting-IP, passed on as X-Client-IP); else
 *  the last X-Forwarded-For entry, the one Cloud Run's front end appended (a client can write anything before it);
 *  else the socket's. */
export function clientIp(req: Request): string {
  const verified = verifiedIps.get(req);
  if (verified) return verified;
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',').map(s => s.trim()).filter(Boolean).at(-1);
  return forwarded || req.socket.remoteAddress || 'unknown';
}

function sameSecret(supplied: unknown, secret: string) {
  if (typeof supplied !== 'string') return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 403 for requests that did not come through the Cloudflare Worker, when EDGE_SECRET is set. The voice worker inside
 *  this server calls the API over loopback, and /health stays open for the deploy script's checks. */
export function edgeGuard(secret: string | undefined): RequestHandler {
  return (req, _res, next) => {
    if (!secret) return next();
    if (sameSecret(req.headers['x-edge-secret'], secret)) {
      const ip = String(req.headers['x-client-ip'] ?? '').trim();
      if (isIP(ip)) verifiedIps.set(req, ip);
      return next();
    }
    if (LOOPBACK.has(req.socket.remoteAddress ?? '') || req.path === '/health') return next();
    throw new ApiError(403, 'FORBIDDEN', 'Open GhoomMates at its public address');
  };
}

/** Sliding-window rate limit: at most `limit` calls per `windowMs` for each key. Memory is bounded by `maxKeys`;
 *  past that the least recently seen key is forgotten (so an attacker spraying addresses can't exhaust memory). */
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number; previous: number }>();
  readonly limit: number;
  readonly windowMs: number;
  private now: () => number;
  private maxKeys: number;

  constructor(limit: number, windowMs: number, now: () => number = Date.now, maxKeys = 50_000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.maxKeys = maxKeys;
  }

  /** Counts a call. Returns 0 when it is allowed, else the seconds until it would be (a refused call doesn't count). */
  take(key: string): number {
    const t = this.now();
    const start = t - (t % this.windowMs);
    let w = this.windows.get(key);
    if (!w || w.start !== start) {
      w = { start, count: 0, previous: w && w.start === start - this.windowMs ? w.count : 0 };
      this.windows.delete(key);
      this.windows.set(key, w);
      if (this.windows.size > this.maxKeys) this.windows.delete(this.windows.keys().next().value!);
    }
    // The previous window's calls fade out linearly over this one
    if (w.previous * (1 - (t - start) / this.windowMs) + w.count >= this.limit) {
      return Math.max(1, Math.ceil((start + this.windowMs - t) / 1000));
    }
    w.count++;
    return 0;
  }
}

/** At most `limit` requests open at once per key, e.g. held voice calls. */
export class ConcurrencyLimiter {
  private open = new Map<string, number>();
  readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  /** A release function when there is room, else null. Releasing more than once is harmless. */
  enter(key: string): (() => void) | null {
    const count = this.open.get(key) ?? 0;
    if (count >= this.limit) return null;
    this.open.set(key, count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const left = (this.open.get(key) ?? 1) - 1;
      if (left > 0) this.open.set(key, left);
      else this.open.delete(key);
    };
  }
}

/** Per-day counters shared by every instance: take() counts one use of `key` today, false once `limit` is reached. */
export interface DailyCounters {
  take(key: string, limit: number): Promise<boolean>;
}

const IST_MS = 330 * 60_000;
/** Days run on India time, like the rest of the app */
const today = (now: number) => new Date(now + IST_MS).toISOString().slice(0, 10);

/** Counters in the usage_counters collection; a TTL index removes each day's counters two days later. */
export function mongoCounters(db: Db, now: () => number = Date.now): DailyCounters {
  const collection = db.collection<{ _id: string; count: number; expires_at: Date }>('usage_counters');
  return {
    async take(key, limit) {
      const t = now();
      try {
        // A full counter fails the filter, so the upsert tries to insert a second document with its _id: E11000
        await collection.updateOne(
          { _id: `${key}:${today(t)}`, count: { $lt: limit } },
          { $inc: { count: 1 }, $setOnInsert: { expires_at: new Date(t + 2 * 86_400_000) } },
          { upsert: true },
        );
        return true;
      } catch (err: any) {
        if (err?.code === 11000) return false;
        // The database is down: let the call through (the in-memory rate limits still apply) rather than fail it
        logger.warn('Limits', `Could not count ${key}: ${err?.message ?? err}`);
        return true;
      }
    },
  };
}

/** Per-instance counters, for a server without a database and for tests. */
export function memoryCounters(now: () => number = Date.now): DailyCounters {
  const counts = new Map<string, number>();
  return {
    async take(key, limit) {
      const day = today(now());
      for (const k of counts.keys()) if (!k.endsWith(day)) counts.delete(k);
      const id = `${key}:${day}`;
      const count = counts.get(id) ?? 0;
      if (count >= limit) return false;
      counts.set(id, count + 1);
      return true;
    },
  };
}

/* Policies */

type Keyed = 'client' | 'ip';

export type Policy = {
  name: string;
  /** Which requests it covers: method and path (req.path as the server sees it, e.g. /api/reels/trips/<id>) */
  methods: string[] | '*';
  path: RegExp;
  /** Per caller (the signed-in user, else the IP) or per IP address */
  per: Keyed;
  perMinute?: number;
  /** A longer window for bursts that are fine once, e.g. uploading a hundred photos */
  perWindow?: { limit: number; windowMs: number };
  /** Durable per-caller budget for the day (India time) */
  perDay?: number;
  /** Durable budget for the day across all callers together */
  perDayAll?: number;
  /** Requests open at once, per caller and instance */
  concurrent?: number;
  message: string;
};

const ID = '[^/]+';

// The defaults. First matching policy of each name applies; a request can match several (e.g. "api" and "ai").
export function defaultPolicies(env: Record<string, string | undefined> = process.env): Policy[] {
  const n = (key: string, fallback: number) => {
    const value = Number(env[key]);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  };
  return [
    // Backstop for every API call. Generous per IP: a hackathon venue or an office puts many people behind one address.
    { name: 'ip', methods: '*', path: /^\/(api|auth)(\/|$)/, per: 'ip', perMinute: n('RATE_LIMIT_IP_PER_MINUTE', 1200), message: 'Too many requests from your network. Give it a minute.' },
    { name: 'client', methods: '*', path: /^\/(api|auth)(\/|$)/, per: 'client', perMinute: n('RATE_LIMIT_PER_MINUTE', 300), message: 'You’re going a bit fast. Give it a minute.' },
    // Sign-in calls Google's token endpoints, and dev login (when it is on) mints sessions
    { name: 'signin', methods: ['GET', 'POST'], path: /^\/auth\/(google\/verify|callback|google\/callback|dev\/login)$/, per: 'ip', perMinute: 20, message: 'Too many sign-in attempts. Try again in a minute.' },
    // Gemini with up to 24 photos on the bigger model: the most expensive call in the app
    { name: 'reel', methods: ['POST'], path: new RegExp(`^/api/reels/trips/${ID}$`), per: 'client', perMinute: 4, perDay: n('REELS_PER_USER_PER_DAY', 40), message: 'That’s a lot of reels. Give GhoomMate a minute.' },
    // Every other route that asks Gemini for an answer
    {
      name: 'ai', methods: ['POST'],
      path: new RegExp(`^/api/(trips/${ID}/itinerary/draft|hospitality/menu|ops/advisories/draft|events/${ID}/ask|makers/${ID}/ask)$`),
      per: 'client', perMinute: 12, perDay: n('AI_PER_USER_PER_DAY', 200), message: 'That’s a lot of questions at once. Give it a minute.',
    },
    // Signed upload URLs: each upload wakes the face indexer and adds to the bucket
    {
      name: 'upload', methods: ['POST'], path: new RegExp(`^/(api/trips/${ID}/uploads|auth/uploads)$`),
      per: 'client', perWindow: { limit: 300, windowMs: 10 * 60_000 }, perDay: n('UPLOADS_PER_USER_PER_DAY', 2000), message: 'That’s a lot of uploads. Give it a few minutes.',
    },
    // A voice call holds a request (and CPU) open while it lasts and is billed per minute by LiveKit and Gemini Live
    {
      name: 'voice', methods: ['POST'], path: /^\/api\/voice\/session$/, per: 'client',
      perMinute: 6, concurrent: 2, perDay: n('VOICE_SESSIONS_PER_USER_PER_DAY', 30), perDayAll: n('VOICE_SESSIONS_PER_DAY', 300), message: 'GhoomMate needs a short break. Try again in a little while.',
    },
  ];
}

export type LimitsOptions = {
  /** Verifies session tokens, so limits follow the user rather than their IP. Only the userId is read. */
  jwtSecret: string;
  counters: DailyCounters;
  policies?: Policy[];
  now?: () => number;
};

/** The caller a limit is kept for: the signed-in user (verified token), else the IP address. */
function callerOf(req: Request, jwtSecret: string): string {
  const [type, token] = (req.headers.authorization ?? '').split(' ');
  if (type?.toLowerCase() === 'bearer' && token) {
    try {
      const { userId } = verifyJwt(token.trim(), jwtSecret);
      if (userId) return `user:${userId}`;
    } catch {}
  }
  return `ip:${clientIp(req)}`;
}

/** Applies every matching policy to the request; 429 with Retry-After when one is used up. */
export function rateLimits({ jwtSecret, counters, policies = defaultPolicies(), now = Date.now }: LimitsOptions): RequestHandler {
  const compiled = policies.map(policy => ({
    policy,
    minute: policy.perMinute ? new RateLimiter(policy.perMinute, 60_000, now) : null,
    window: policy.perWindow ? new RateLimiter(policy.perWindow.limit, policy.perWindow.windowMs, now) : null,
    open: policy.concurrent ? new ConcurrencyLimiter(policy.concurrent) : null,
  }));

  return async (req, res, next) => {
    const matched = compiled.filter(({ policy }) => (policy.methods === '*' || policy.methods.includes(req.method)) && policy.path.test(req.path));
    if (!matched.length) return next();
    const caller = callerOf(req, jwtSecret);
    const ip = `ip:${clientIp(req)}`;
    const refuse = (policy: Policy, retryAfter: number, why: string) => {
      logger.warn('Limits', `${caller} hit the "${policy.name}" limit (${why}) on ${req.method} ${req.path}`);
      res.set('Retry-After', String(retryAfter));
      throw new ApiError(429, 'RATE_LIMITED', policy.message);
    };

    for (const { policy, minute, window } of matched) {
      const key = policy.per === 'ip' ? ip : caller;
      const wait = minute?.take(key) || window?.take(key);
      if (wait) refuse(policy, wait, 'rate');
    }
    for (const { policy } of matched) {
      if (policy.perDay && !(await counters.take(`${policy.name}:${caller}`, policy.perDay))) refuse(policy, 3600, 'daily');
      if (policy.perDayAll && !(await counters.take(`${policy.name}:all`, policy.perDayAll))) refuse(policy, 3600, 'daily, all users');
    }
    for (const { policy, open } of matched) {
      if (!open) continue;
      const release = open.enter(caller);
      if (!release) refuse(policy, 30, 'concurrent');
      else res.on('close', release);
    }
    next();
  };
}
