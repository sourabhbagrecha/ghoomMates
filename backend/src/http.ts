import express from 'express';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { logger } from './logger.ts';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const MAX_BODY = '64kb';
const parseJson = express.json({ limit: MAX_BODY, type: () => true });
const parseOptionalJson = express.json({ limit: MAX_BODY });

// Parses a JSON body up to 64 KiB. Requests without Content-Type: application/json are rejected with 415.
export const jsonBody: RequestHandler = (req, res, next) => {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use Content-Type: application/json');
  }
  parseJson(req, res, next);
};

// Same as jsonBody with a larger limit, for routes that carry images (e.g. face-match selfies).
export function largeJsonBody(limit: string): RequestHandler {
  const parse = express.json({ limit, type: () => true });
  return (req, res, next) => {
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
      throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use Content-Type: application/json');
    }
    parse(req, res, next);
  };
}

// Best-effort JSON parsing: a missing, oversized, or malformed body leaves req.body as {}.
export const optionalJsonBody: RequestHandler = (req, res, next) => {
  parseOptionalJson(req, res, (err?: unknown) => {
    if (err || !req.body) req.body = {};
    next();
  });
};

export const notFound: RequestHandler = (req) => {
  throw new ApiError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`);
};

// Maps ApiError and body-parser failures to the { error: { code, message } } envelope.
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof ApiError) {
    logger.warn('HTTP', `${req.method} ${req.originalUrl || req.path} -> ${err.status} [${err.code}] ${err.message}`);
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err?.type === 'entity.too.large') {
    const max = Number(err.limit) >= 1024 * 1024 ? `${Math.round(err.limit / 1024 / 1024)} MiB` : `${Math.round((Number(err.limit) || 65536) / 1024)} KiB`;
    logger.warn('HTTP', `${req.method} ${req.originalUrl || req.path} -> 413 [BODY_TOO_LARGE] Request body exceeds ${max}`);
    res.status(413).json({ error: { code: 'BODY_TOO_LARGE', message: `Request body exceeds ${max}` } });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    logger.warn('HTTP', `${req.method} ${req.originalUrl || req.path} -> 400 [INVALID_JSON] Malformed JSON body`);
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Malformed JSON body' } });
    return;
  }
  logger.error('HTTP', `Unhandled error on ${req.method} ${req.originalUrl || req.path}: ${err instanceof Error ? err.message : String(err)}`, err instanceof Error ? err.stack : undefined);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
};
