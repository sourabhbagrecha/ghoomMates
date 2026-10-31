import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import type { ClientSession } from 'mongodb';
import { timingSafeEqual } from 'node:crypto';
import { ApiError, integer } from './domain.ts';
import { ExpenseService } from './service.ts';
import { jsonBody } from '../http.ts';
import type { Database } from './database.ts';

const GROUP_PATH = /^\/groups\/[a-zA-Z0-9-]+(?:\/(members|expenses|balances|settlement-suggestions|settlements))?$/;
const GROUP_ID = /^[a-zA-Z0-9-]+$/;

function page(req: Request) {
  const value = (name: string, fallback: number) => typeof req.query[name] === 'string' ? Number(req.query[name]) : fallback;
  return {
    limit: integer(value('limit', 50), 'limit', 1, 100),
    offset: integer(value('offset', 0), 'offset', 0, 1_000_000),
  };
}

// Internal expense ledger routes. Mount under /api.
export function createApp(db: Database, apiKey: string) {
  if (apiKey.length < 32) throw new Error('API_KEY must contain at least 32 characters');
  const service = new ExpenseService(db);
  const expected = Buffer.from(`Bearer ${apiKey}`);
  const router = Router();
  const idempotencyKey = (req: Request) => req.get('idempotency-key') ?? '';

  router.use((req, _res, next) => {
    const supplied = Buffer.from(req.get('authorization') ?? '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new ApiError(401, 'UNAUTHORIZED', 'A valid service bearer token is required');
    }
    next();
  });

  router.param('groupId', (_req, _res, next, groupId: string) => {
    if (!GROUP_ID.test(groupId)) throw new ApiError(404, 'NOT_FOUND', 'Route not found');
    next();
  });

  router.post('/groups', jsonBody, async (req, res) => {
    res.status(201).json(await service.mutate('groups', idempotencyKey(req), req.body, (session) => service.createGroup(req.body, session)));
  });

  router.get('/groups/:groupId', async (req, res) => {
    res.json(await service.group(req.params.groupId));
  });

  router.get('/groups/:groupId/balances', async (req, res) => {
    res.json({ currency: 'INR', balances: await service.balances(req.params.groupId) });
  });

  router.get('/groups/:groupId/settlement-suggestions', async (req, res) => {
    res.json({ currency: 'INR', transfers: await service.suggestions(req.params.groupId) });
  });

  router.get('/groups/:groupId/expenses', async (req, res) => {
    const { limit, offset } = page(req);
    res.json({ items: await service.expenses(req.params.groupId, limit, offset), limit, offset });
  });

  router.get('/groups/:groupId/settlements', async (req, res) => {
    const { limit, offset } = page(req);
    res.json({ items: await service.settlements(req.params.groupId, limit, offset), limit, offset });
  });

  const mutation = (resource: string, action: (groupId: string, input: unknown, session: ClientSession) => Promise<unknown>): RequestHandler =>
    async (req, res) => {
      const { groupId } = req.params as { groupId: string };
      res.status(201).json(await service.mutate(`${groupId}/${resource}`, idempotencyKey(req), req.body, (session) => action(groupId, req.body, session)));
    };
  router.post('/groups/:groupId/members', jsonBody, mutation('members', (id, input, session) => service.addMember(id, input, session)));
  router.post('/groups/:groupId/expenses', jsonBody, mutation('expenses', (id, input, session) => service.addExpense(id, input, session)));
  router.post('/groups/:groupId/settlements', jsonBody, mutation('settlements', (id, input, session) => service.addSettlement(id, input, session)));

  router.use((req) => {
    if (req.path === '/groups' || GROUP_PATH.test(req.path)) {
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not supported for this route');
    }
    throw new ApiError(404, 'NOT_FOUND', 'Route not found');
  });

  return router;
}
