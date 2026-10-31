import express from 'express';
import type { Router } from 'express';
import { ApiError, errorHandler, notFound } from './http.ts';

export interface ServerModules {
  // Google OAuth and user profile routes, mounted under /auth.
  auth: Router;
  // Internal expense ledger routes, mounted under /api. Omitted when MONGODB_URI or API_KEY is not configured.
  expenses?: Router;
  // AI reel planning routes, mounted under /reels. Omitted when GEMINI_API_KEY is not configured.
  reels?: Router;
}

export function createServer({ auth, expenses, reels }: ServerModules) {
  const app = express();
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  });

  app.get(['/', '/health'], (_req, res) => {
    res.json({
      status: 'ok',
      service: 'ghoomates-backend',
      version: '0.1.0',
      modules: { auth: 'enabled', expenses: expenses ? 'enabled' : 'disabled', reels: reels ? 'enabled' : 'disabled' },
      endpoints: ['/health', '/auth/*', '/api/groups/*', '/reels/plan'],
    });
  });

  app.use('/api', expenses ?? (() => {
    throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Expense API is not configured on this server');
  }));
  app.use('/auth', auth);
  app.use('/reels', reels ?? (() => {
    throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Reel planner is not configured on this server');
  }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
