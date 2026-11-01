import express from 'express';
import type { Router } from 'express';
import { ApiError, errorHandler, notFound } from './http.ts';
import { requestLogger } from './logger.ts';

export interface ServerModules {
  // Google OAuth and user profile routes, mounted under /auth.
  auth: Router;
  // Internal expense ledger routes, mounted under /api. Omitted when the database or API_KEY is not configured.
  expenses?: Router;
  // Trip groups for signed-in users, mounted under /api/trips. Omitted without a database.
  trips?: Router;
  // GhoomMate voice sessions (LiveKit tokens), mounted under /api/voice. Omitted without a database.
  voice?: Router;
  // Live crowd levels at heritage sites, mounted under /api/heritage. Needs no database.
  heritage?: Router;
  // Kaavad Tales: heritage stories, narration and the Heritage Passport, mounted under /api/stories.
  stories?: Router;
  // Signed upload/download routes for the local media fallback, mounted under /api/media.
  media?: Router;
}

export function createServer({ auth, expenses, trips, voice, heritage, stories, media }: ServerModules) {
  const app = express();
  app.disable('x-powered-by');

  // Request logging
  app.use(requestLogger);

  app.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  });

  app.get(['/', '/health'], (_req, res) => {
    res.json({
      status: 'ok',
      service: 'ghoomates-backend',
      version: '0.1.0',
      modules: { auth: 'enabled', trips: trips ? 'enabled' : 'disabled', expenses: expenses ? 'enabled' : 'disabled' },
      endpoints: ['/health', '/auth/*', '/api/trips/*', '/api/voice/session', '/api/heritage/:city/live', '/api/groups/*'],
    });
  });

  // Mounted before the internal /api ledger, whose service-token check would reject user requests.
  app.use('/api/trips', trips ?? (() => {
    throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Trips need a database; set DATABASE_URL or CLOUD_SQL_INSTANCE');
  }));
  app.use('/api/voice', voice ?? (() => {
    throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Voice needs a database; set DATABASE_URL or CLOUD_SQL_INSTANCE');
  }));
  if (heritage) app.use('/api/heritage', heritage);
  if (stories) app.use('/api/stories', stories);
  if (media) app.use('/api/media', media);
  app.use('/api', expenses ?? (() => {
    throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Expense API is not configured on this server');
  }));
  app.use('/auth', auth);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
