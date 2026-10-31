import express from 'express';
import type { Router } from 'express';
import { ApiError, errorHandler, notFound } from './http.ts';
import { requestLogger } from './logger.ts';

export interface ServerModules {
  // Google OAuth and user profile routes, mounted under /auth.
  auth: Router;
  // Internal expense ledger routes, mounted under /api. Omitted when the database or API_KEY is not configured.
  expenses?: Router;
}

export function createServer({ auth, expenses }: ServerModules) {
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
      modules: { auth: 'enabled', expenses: expenses ? 'enabled' : 'disabled' },
      endpoints: ['/health', '/auth/*', '/api/groups/*'],
    });
  });

  app.use('/api', expenses ?? (() => {
    throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Expense API is not configured on this server');
  }));
  app.use('/auth', auth);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
