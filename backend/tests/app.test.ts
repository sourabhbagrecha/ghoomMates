import test from 'node:test';
import assert from 'node:assert/strict';
import { Router } from 'express';
import { createServer } from '../src/app.ts';
import { serve } from './helpers.ts';

const stub = (name: string) => Router().use((_req, res) => { res.json({ handledBy: name }); });

test('routes /api/* to expenses and /auth/* to auth', async () => {
  const server = await serve(createServer({ auth: stub('auth'), expenses: stub('expenses') }));
  try {
    const api = await server.request('/api/groups/abc/balances');
    assert.equal((await api.json()).handledBy, 'expenses');

    const auth = await server.request('/auth/me');
    assert.equal((await auth.json()).handledBy, 'auth');

    const health = await server.request('/health');
    assert.equal(health.headers.get('cache-control'), 'no-store');
    const body = await health.json();
    assert.equal(body.status, 'ok');
    assert.deepEqual(body.modules, { auth: 'enabled', expenses: 'enabled', reels: 'disabled' });

    const missing = await server.request('/nope');
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, 'NOT_FOUND');
  } finally {
    await server.close();
  }
});

test('returns 503 for /api/* and /reels/* when their modules are disabled', async () => {
  const server = await serve(createServer({ auth: stub('auth') }));
  try {
    const api = await server.request('/api/groups', { method: 'POST' });
    assert.equal(api.status, 503);
    assert.equal((await api.json()).error.code, 'SERVICE_UNAVAILABLE');

    const reels = await server.request('/reels/plan', { method: 'POST' });
    assert.equal(reels.status, 503);
    assert.equal((await reels.json()).error.code, 'SERVICE_UNAVAILABLE');

    const health = await server.request('/health');
    assert.equal((await health.json()).modules.expenses, 'disabled');
  } finally {
    await server.close();
  }
});
