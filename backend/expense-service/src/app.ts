import type { ClientSession } from 'mongodb';
import { timingSafeEqual } from 'node:crypto';
import { ApiError, integer } from './domain.ts';
import { ExpenseService } from './service.ts';
import type { Database } from './database.ts';

const MAX_BODY_BYTES = 64 * 1024;

async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use Content-Type: application/json');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'INVALID_JSON', 'Request body is required');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new ApiError(413, 'BODY_TOO_LARGE', 'Request body exceeds 64 KiB');
    }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ApiError(400, 'INVALID_JSON', 'Malformed JSON body'); }
}

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export function createApp(db: Database, apiKey: string) {
  if (apiKey.length < 32) throw new Error('API_KEY must contain at least 32 characters');
  const service = new ExpenseService(db);
  const expected = Buffer.from(`Bearer ${apiKey}`);

  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/health' && request.method === 'GET') return json({ status: 'ok' });
      const supplied = Buffer.from(request.headers.get('authorization') ?? '');
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        return json({ error: { code: 'UNAUTHORIZED', message: 'A valid service bearer token is required' } }, 401);
      }
      if (url.pathname === '/api/groups' && request.method === 'POST') {
        const input = await readJson(request);
        return json(await service.mutate('groups', request.headers.get('idempotency-key') ?? '', input, (session) => service.createGroup(input, session)), 201);
      }
      const match = /^\/api\/groups\/([a-zA-Z0-9-]+)(?:\/(members|expenses|balances|settlement-suggestions|settlements))?$/.exec(url.pathname);
      if (!match) throw new ApiError(404, 'NOT_FOUND', 'Route not found');
      const [, groupId, resource] = match;
      if (request.method === 'GET') {
        if (!resource) return json(await service.group(groupId));
        if (resource === 'balances') return json({ currency: 'INR', balances: await service.balances(groupId) });
        if (resource === 'settlement-suggestions') return json({ currency: 'INR', transfers: await service.suggestions(groupId) });
        if (resource === 'expenses' || resource === 'settlements') {
          const limit = integer(Number(url.searchParams.get('limit') ?? 50), 'limit', 1, 100);
          const offset = integer(Number(url.searchParams.get('offset') ?? 0), 'offset', 0, 1_000_000);
          const items = resource === 'expenses' ? await service.expenses(groupId, limit, offset) : await service.settlements(groupId, limit, offset);
          return json({ items, limit, offset });
        }
      }
      if (request.method === 'POST' && ['members', 'expenses', 'settlements'].includes(resource)) {
        const input = await readJson(request);
        const action = (session: ClientSession) => resource === 'members' ? service.addMember(groupId, input, session)
          : resource === 'expenses' ? service.addExpense(groupId, input, session) : service.addSettlement(groupId, input, session);
        return json(await service.mutate(`${groupId}/${resource}`, request.headers.get('idempotency-key') ?? '', input, action), 201);
      }
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not supported for this route');
    } catch (error) {
      if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message } }, error.status);
      console.error('Request failed:', error instanceof Error ? error.message : 'UnknownError');
      return json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }, 500);
    }
  };
}
