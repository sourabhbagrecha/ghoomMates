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
  // Makers of Udaipur: crafts, makers, fair prices and workshop bookings, mounted under /api/makers. Browsing needs no database.
  makers?: Router;
  // Green Trip impact (footprint, crowd-hours, local spend, pledges), mounted under /api/impact. Omitted without a database.
  impact?: Router;
  // Signed upload/download routes for the local media fallback, mounted under /api/media.
  media?: Router;
  // The built web app (frontend/dist) with a single-page-app fallback, mounted after every API route. Production only (SERVE_FRONTEND_DIR).
  frontend?: Router;
  // Heritage Ops: crowd forecasts from squads' plans and advisories, mounted under /api/ops. Works without a database.
  ops?: Router;
  // Squad Miniature: trip photos painted in Udaipur's painting traditions, mounted under /api/artworks. Omitted without a database.
  artworks?: Router;
}

export function createServer({ auth, expenses, trips, voice, heritage, media, frontend, ops, makers, artworks, impact }: ServerModules) {
  const app = express();
  app.disable('x-powered-by');

  // Request logging
  app.use(requestLogger);

  app.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  });

  // With the web app served from here, "/" is the app; /health stays the JSON status.
  if (frontend) app.get('/', frontend);

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
  app.use('/api/artworks', artworks ?? (() => {
    throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Artworks need a database; set DATABASE_URL or CLOUD_SQL_INSTANCE');
  }));
  app.use('/api/impact', impact ?? (() => {
    throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Impact needs a database; set DATABASE_URL or CLOUD_SQL_INSTANCE');
  }));
  if (heritage) app.use('/api/heritage', heritage);
  if (makers) app.use('/api/makers', makers);
  if (media) app.use('/api/media', media);
  if (ops) app.use('/api/ops', ops);
  app.use('/api', expenses ?? (() => {
    throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Expense API is not configured on this server');
  }));
  app.use('/auth', auth);

  // The web app comes last so it can never shadow an API route.
  if (frontend) app.use(frontend);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
