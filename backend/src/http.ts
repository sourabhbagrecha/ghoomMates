import express from 'express';
import type { ErrorRequestHandler, Request, RequestHandler } from 'express';

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
const parseOptionalJson = express.json({ limit: MAX_BODY });

// Parses a JSON body up to `limit`. Requests without Content-Type: application/json are rejected with 415.
export function jsonBodyUpTo(limit: string): RequestHandler {
  const parseJson = express.json({ limit, type: () => true });
  return (req, res, next) => {
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
      throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use Content-Type: application/json');
    }
    parseJson(req, res, next);
  };
}

// Parses a JSON body up to 64 KiB.
export const jsonBody = jsonBodyUpTo(MAX_BODY);

// Best-effort JSON parsing: a missing, oversized, or malformed body leaves req.body as {}.
export const optionalJsonBody: RequestHandler = (req, res, next) => {
  parseOptionalJson(req, res, (err?: unknown) => {
    if (err || !req.body) req.body = {};
    next();
  });
};

export function getBearerToken(req: Request): string {
  const authHeader = req.headers.authorization || '';
  const [type, token] = authHeader.split(' ');
  if (type?.toLowerCase() !== 'bearer' || !token) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Bearer token is missing or malformed');
  }
  return token.trim();
}

// Allows the configured frontend origin (and any localhost port in development) to call this router.
export function cors(clientOrigin: string): RequestHandler {
  return (req, res, next) => {
    const reqOrigin = req.headers.origin;
    const allowedOrigin = reqOrigin && (reqOrigin === clientOrigin || reqOrigin.startsWith('http://localhost:'))
      ? reqOrigin
      : clientOrigin;

    res.set({
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin',
    });

    // Preflight OPTIONS handler
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  };
}

export const notFound: RequestHandler = (req) => {
  throw new ApiError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`);
};

// Maps ApiError and body-parser failures to the { error: { code, message } } envelope.
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err?.type === 'entity.too.large') {
    const limit = typeof err.limit === 'number' ? `${Math.round(err.limit / 1024)} KiB` : 'the size limit';
    res.status(413).json({ error: { code: 'BODY_TOO_LARGE', message: `Request body exceeds ${limit}` } });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Malformed JSON body' } });
    return;
  }
  console.error('Request failed:', err instanceof Error ? err.message : 'UnknownError');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
};
