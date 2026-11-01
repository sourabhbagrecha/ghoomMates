import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { get as httpGet } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import express, { Router } from 'express';
import { createServer } from '../../src/app.ts';
import { createApp } from '../../src/auth/app.ts';
import { createInMemoryOAuthDatabase } from '../../src/auth/database.ts';
import { DEMO_EMAILS, devLoginAllowed, devLoginEmailAllowed } from '../../src/auth/devLogin.ts';
import { createFrontendRouter } from '../../src/frontend.ts';
import { errorHandler, notFound } from '../../src/http.ts';
import { mount, serve } from '../helpers.ts';

// Production serving and the public-URL safeguards: the built web app is served by the API server, and the
// mock sign-in is off unless ALLOW_DEV_LOGIN=true.

const SECRET = 'a-very-secret-test-key-32-characters-minimum';
const stub = (name: string) => Router().use((_req, res) => { res.json({ handledBy: name }); });

// Runs fn with some environment variables set (undefined = unset), then restores them.
async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved = Object.keys(vars).map((key) => [key, process.env[key]] as const);
  const apply = (entries: readonly (readonly [string, string | undefined])[]) => {
    for (const [key, value] of entries) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  apply(Object.entries(vars));
  try {
    return await fn();
  } finally {
    apply(saved);
  }
}

const JS = 'console.log("ghoommates");\n'.repeat(80);

// A fake `vite build` output: hashed assets (one pre-gzipped like the image build does), a public/ file, a secret outside dist.
// It lives under a hidden folder, like a checkout inside .claude/, to show the path of the app itself never counts as a dotfile.
function makeDist() {
  const parent = mkdtempSync(join(tmpdir(), '.ghoommates-dist-'));
  const dist = join(parent, 'dist');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  mkdirSync(join(dist, 'heritage'), { recursive: true });
  writeFileSync(join(parent, 'secret.txt'), 'TOP-SECRET');
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Ghoommates</title><div id="root"></div>');
  writeFileSync(join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(join(dist, 'assets', 'index-abc123.js'), JS);
  writeFileSync(join(dist, 'assets', 'index-abc123.js.gz'), gzipSync(JS));
  writeFileSync(join(dist, 'assets', 'index-abc123.css'), 'body{margin:0}');
  writeFileSync(join(dist, 'heritage', 'fort.jpg'), Buffer.from([0xff, 0xd8, 0xff]));
  return { dist, cleanup: () => rmSync(parent, { recursive: true, force: true }) };
}

test('devLoginAllowed: on for local dev, off in production unless ALLOW_DEV_LOGIN=true', () => {
  assert.equal(devLoginAllowed({}), true);
  assert.equal(devLoginAllowed({ NODE_ENV: 'development' }), true);
  assert.equal(devLoginAllowed({ NODE_ENV: 'test' }), true);
  assert.equal(devLoginAllowed({ NODE_ENV: 'production' }), false);
  assert.equal(devLoginAllowed({ NODE_ENV: 'production', ALLOW_DEV_LOGIN: '' }), false);
  assert.equal(devLoginAllowed({ NODE_ENV: 'production', ALLOW_DEV_LOGIN: 'true' }), true);
  assert.equal(devLoginAllowed({ NODE_ENV: 'production', ALLOW_DEV_LOGIN: ' TRUE ' }), true);
  // Only "true" turns it on; anything else is off, even in local dev
  assert.equal(devLoginAllowed({ ALLOW_DEV_LOGIN: 'false' }), false);
  assert.equal(devLoginAllowed({ ALLOW_DEV_LOGIN: '1' }), false);
  assert.equal(devLoginAllowed({ NODE_ENV: 'production', ALLOW_DEV_LOGIN: 'yes' }), false);
});

test('devLoginEmailAllowed: any email locally, only the demo accounts (or DEV_LOGIN_EMAILS) in production', () => {
  assert.equal(devLoginEmailAllowed('anyone@example.com', {}), true);
  assert.equal(devLoginEmailAllowed('anyone@example.com', { NODE_ENV: 'development' }), true);
  assert.equal(devLoginEmailAllowed('anyone@example.com', { NODE_ENV: 'production' }), false);
  for (const email of DEMO_EMAILS) assert.equal(devLoginEmailAllowed(email.toUpperCase(), { NODE_ENV: 'production' }), true);
  assert.equal(devLoginEmailAllowed('a@example.com', { NODE_ENV: 'production', DEV_LOGIN_EMAILS: 'A@example.com,b@example.com' }), true);
  assert.equal(devLoginEmailAllowed(DEMO_EMAILS[0], { NODE_ENV: 'production', DEV_LOGIN_EMAILS: 'a@example.com' }), false);
  // An empty list falls back to the demo accounts rather than allowing nobody or everybody
  assert.equal(devLoginEmailAllowed(DEMO_EMAILS[0], { NODE_ENV: 'production', DEV_LOGIN_EMAILS: ' , ' }), true);
});

test('POST /auth/dev/login is refused, and /auth/config says so, when dev login is off', async () => {
  const db = createInMemoryOAuthDatabase();
  const login = (server: Awaited<ReturnType<typeof serve>>) => server.request('/auth/dev/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'victim@example.com', name: 'Mallory' }),
  });
  try {
    const off = await serve(mount('/auth', createApp(db, { jwtSecret: SECRET, devLogin: false })));
    try {
      const refused = await login(off);
      assert.equal(refused.status, 403);
      assert.equal((await refused.json()).error.code, 'DEV_LOGIN_DISABLED');
      assert.equal((await (await off.request('/auth/config')).json()).devModeEnabled, false);
    } finally { await off.close(); }
    // Nothing was created for the refused request
    assert.equal(await db.findUserByEmail('victim@example.com'), null);

    const on = await serve(mount('/auth', createApp(db, { jwtSecret: SECRET, devLogin: true })));
    try {
      assert.equal((await login(on)).status, 200);
      assert.equal((await (await on.request('/auth/config')).json()).devModeEnabled, true);
    } finally { await on.close(); }
  } finally {
    await db.terminate();
  }
});

test('dev login follows the environment when the app is not told explicitly', async () => {
  const db = createInMemoryOAuthDatabase();
  const status = async (env: Record<string, string | undefined>) => withEnv(env, async () => {
    const server = await serve(mount('/auth', createApp(db, { jwtSecret: SECRET })));
    try {
      return (await server.request('/auth/dev/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status;
    } finally { await server.close(); }
  });
  try {
    assert.equal(await status({ NODE_ENV: undefined, ALLOW_DEV_LOGIN: undefined }), 200);
    assert.equal(await status({ NODE_ENV: 'production', ALLOW_DEV_LOGIN: undefined }), 403);
    assert.equal(await status({ NODE_ENV: 'production', ALLOW_DEV_LOGIN: 'true' }), 200);
    assert.equal(await status({ NODE_ENV: undefined, ALLOW_DEV_LOGIN: 'false' }), 403);
  } finally {
    await db.terminate();
  }
});

test('on a production server the test sign-in only signs in the demo accounts', async () => {
  const db = createInMemoryOAuthDatabase();
  const signIn = (email: string | undefined, env: Record<string, string | undefined>) => withEnv({ NODE_ENV: 'production', ALLOW_DEV_LOGIN: 'true', DEV_LOGIN_EMAILS: undefined, ...env }, async () => {
    const server = await serve(mount('/auth', createApp(db, { jwtSecret: SECRET })));
    try {
      const res = await server.request('/auth/dev/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(email ? { email } : {}) });
      return { status: res.status, code: res.status === 200 ? '' : (await res.json()).error.code as string };
    } finally { await server.close(); }
  });
  try {
    // The accounts the sign-in page offers, with or without an email in the request
    assert.deepEqual(await signIn('aditi.travels@gmail.com', {}), { status: 200, code: '' });
    assert.deepEqual(await signIn(' Kabir.Mehta@gmail.com ', {}), { status: 200, code: '' });
    assert.deepEqual(await signIn(undefined, {}), { status: 200, code: '' });
    // Anyone else, e.g. a real user, is refused and nothing is created for them
    assert.deepEqual(await signIn('victim@example.com', {}), { status: 403, code: 'DEV_LOGIN_RESTRICTED' });
    assert.equal(await db.findUserByEmail('victim@example.com'), null);
    // DEV_LOGIN_EMAILS replaces the list
    assert.deepEqual(await signIn('tester@example.com', { DEV_LOGIN_EMAILS: 'Tester@example.com, other@example.com' }), { status: 200, code: '' });
    assert.deepEqual(await signIn('aditi.travels@gmail.com', { DEV_LOGIN_EMAILS: 'tester@example.com' }), { status: 403, code: 'DEV_LOGIN_RESTRICTED' });
    // Off stays off
    assert.deepEqual(await signIn('aditi.travels@gmail.com', { ALLOW_DEV_LOGIN: undefined }), { status: 403, code: 'DEV_LOGIN_DISABLED' });
    // Local dev is unrestricted
    assert.deepEqual(await signIn('anyone@example.com', { NODE_ENV: 'development' }), { status: 200, code: '' });
  } finally {
    await db.terminate();
  }
});

test('CORS: localhost dev origins are only allowed outside production', async () => {
  const db = createInMemoryOAuthDatabase();
  const allowedOrigin = (env: Record<string, string | undefined>, origin: string) => withEnv(env, async () => {
    const server = await serve(mount('/auth', createApp(db, { jwtSecret: SECRET, clientOrigin: 'https://app.example.com' })));
    try {
      return (await server.request('/auth/health', { headers: { Origin: origin } })).headers.get('access-control-allow-origin');
    } finally { await server.close(); }
  });
  try {
    assert.equal(await allowedOrigin({ NODE_ENV: undefined }, 'http://localhost:5173'), 'http://localhost:5173');
    assert.equal(await allowedOrigin({ NODE_ENV: 'production' }, 'http://localhost:5173'), 'https://app.example.com');
    assert.equal(await allowedOrigin({ NODE_ENV: 'production' }, 'https://evil.example.net'), 'https://app.example.com');
    assert.equal(await allowedOrigin({ NODE_ENV: 'production' }, 'https://app.example.com'), 'https://app.example.com');
  } finally {
    await db.terminate();
  }
});

test('createFrontendRouter does nothing without a built app', () => {
  assert.equal(createFrontendRouter(undefined), undefined);
  assert.equal(createFrontendRouter(''), undefined);
  assert.equal(createFrontendRouter('   '), undefined);
  assert.equal(createFrontendRouter(join(tmpdir(), 'ghoommates-no-such-dist')), undefined);
});

test('the server serves the built app after the API routes, with an SPA fallback and long-cache assets', async () => {
  const { dist, cleanup } = makeDist();
  const server = await serve(createServer({ auth: stub('auth'), expenses: stub('expenses'), frontend: createFrontendRouter(dist) }));
  const identity = { headers: { 'Accept-Encoding': 'identity' } };
  try {
    // "/" is the app, not the health JSON
    const root = await server.request('/', identity);
    assert.equal(root.status, 200);
    assert.match(root.headers.get('content-type') ?? '', /text\/html/);
    assert.equal(root.headers.get('cache-control'), 'no-cache');
    assert.match(await root.text(), /<div id="root">/);

    // Any other page address gets the app too (it routes itself)
    const deep = await server.request('/trip/photos', identity);
    assert.equal(deep.status, 200);
    assert.match(await deep.text(), /<div id="root">/);

    // API routes still win, and /health is still the JSON status
    assert.equal((await (await server.request('/api/groups/abc/balances')).json()).handledBy, 'expenses');
    assert.equal((await (await server.request('/auth/me')).json()).handledBy, 'auth');
    const health = await server.request('/health');
    assert.equal(health.headers.get('content-type')?.startsWith('application/json'), true);
    assert.equal((await health.json()).status, 'ok');

    // Hashed assets never change: cache them for a year
    const asset = await server.request('/assets/index-abc123.js', identity);
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.match(asset.headers.get('content-type') ?? '', /javascript/);
    assert.equal(asset.headers.get('content-encoding'), null);
    assert.equal(await asset.text(), JS);
    assert.equal((await server.request('/assets/index-abc123.css', identity)).headers.get('cache-control'), 'public, max-age=31536000, immutable');

    // Files from public/ are revalidated after an hour; index.html asked for by name is never cached
    assert.equal((await server.request('/favicon.svg', identity)).headers.get('cache-control'), 'public, max-age=3600');
    assert.equal((await server.request('/heritage/fort.jpg', identity)).headers.get('cache-control'), 'public, max-age=3600');
    assert.equal((await server.request('/index.html', identity)).headers.get('cache-control'), 'no-cache');
    assert.equal((await server.request('/assets/index-abc123.js', identity)).headers.get('x-content-type-options'), 'nosniff');

    // Unknown API paths and missing files stay JSON 404s, never index.html
    for (const path of ['/assets/gone-123.js', '/missing.png', '/.env', '/.git/config']) {
      const missing = await server.request(path, identity);
      assert.equal(missing.status, 404, path);
      assert.equal((await missing.json()).error.code, 'NOT_FOUND', path);
    }

    // Only reads fall back to the app
    const post = await server.request('/', { method: 'POST' });
    assert.equal(post.status, 404);
    assert.equal((await post.json()).error.code, 'NOT_FOUND');
    assert.equal((await server.request('/', { ...identity, method: 'HEAD' })).status, 200);
  } finally {
    await server.close();
    cleanup();
  }
});

test('the SPA fallback never answers API paths', async () => {
  const { dist, cleanup } = makeDist();
  const router = createFrontendRouter(dist);
  assert.ok(router);
  const server = await serve(express().use(router).use(notFound).use(errorHandler));
  try {
    for (const path of ['/api', '/api/trips/1', '/auth', '/auth/nope', '/health', '/health/x']) {
      const res = await server.request(path);
      assert.equal(res.status, 404, path);
      assert.equal((await res.json()).error.code, 'NOT_FOUND', path);
    }
    // Look-alike paths that are not the API are pages of the app
    for (const path of ['/apiary', '/authors', '/healthy']) {
      assert.equal((await server.request(path)).status, 200, path);
    }
  } finally {
    await server.close();
    cleanup();
  }
});

test('the server still shows the health JSON at "/" when no web app is served', async () => {
  const server = await serve(createServer({ auth: stub('auth') }));
  try {
    const root = await server.request('/');
    assert.equal(root.status, 200);
    assert.equal((await root.json()).service, 'ghoommates-backend');
  } finally {
    await server.close();
  }
});

test('clients that accept gzip get the pre-compressed file; others and files without a .gz get the plain one', async () => {
  const { dist, cleanup } = makeDist();
  const server = await serve(createServer({ auth: stub('auth'), frontend: createFrontendRouter(dist) }));
  try {
    // fetch decodes gzip for us; the headers tell which variant came over the wire
    const gz = await server.request('/assets/index-abc123.js', { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(gz.status, 200);
    assert.equal(gz.headers.get('content-encoding'), 'gzip');
    assert.equal(gz.headers.get('vary'), 'Accept-Encoding');
    assert.match(gz.headers.get('content-type') ?? '', /javascript/);
    assert.equal(gz.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(await gz.text(), JS);

    // The query string stays, and a conditional request gets a 304 for the compressed variant
    // (an explicit Cache-Control stops fetch from adding "no-cache" to conditional requests, which defeats the check)
    const etag = gz.headers.get('etag');
    assert.ok(etag);
    const again = await server.request('/assets/index-abc123.js?v=1', { headers: { 'Accept-Encoding': 'gzip', 'If-None-Match': etag, 'Cache-Control': 'max-age=0' } });
    assert.equal(again.status, 304);

    const plain = await server.request('/assets/index-abc123.js', { headers: { 'Accept-Encoding': 'identity' } });
    assert.equal(plain.headers.get('content-encoding'), null);
    assert.equal(plain.headers.get('vary'), 'Accept-Encoding');
    assert.equal(await plain.text(), JS);

    // No .css.gz on disk: served as is, with the right type
    const css = await server.request('/assets/index-abc123.css', { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(css.status, 200);
    assert.equal(css.headers.get('content-encoding'), null);
    assert.match(css.headers.get('content-type') ?? '', /text\/css/);
    assert.equal(await css.text(), 'body{margin:0}');

    // Asking for the .gz file directly is just a file download, not a way past the cache rules
    assert.equal((await server.request('/assets/index-abc123.js.gz', { headers: { 'Accept-Encoding': 'identity' } })).status, 200);
  } finally {
    await server.close();
    cleanup();
  }
});

test('requests cannot read files outside the web app directory', async () => {
  const { dist, cleanup } = makeDist();
  const app = createServer({ auth: stub('auth'), frontend: createFrontendRouter(dist) });
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const { port } = server.address() as AddressInfo;
  // fetch() tidies ../ away, so send the raw request line
  const raw = (path: string) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    httpGet({ host: '127.0.0.1', port, path, headers: { 'Accept-Encoding': 'gzip' } }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    }).on('error', reject);
  });
  try {
    for (const path of ['/..%2fsecret.txt', '/%2e%2e/secret.txt', '/..%2f..%2fsecret.txt', '/assets/..%2f..%2fsecret.txt', '/assets/%2e%2e%2f%2e%2e%2fsecret.txt', '/%00', '/..\\secret.txt']) {
      const res = await raw(path);
      assert.equal(res.body.includes('TOP-SECRET'), false, path);
      // Refused, not found, or (for a path without a file name) just the app itself
      assert.ok([200, 400, 403, 404].includes(res.status), `${path} -> ${res.status}`);
      if (res.status === 200) assert.match(res.body, /<div id="root">/, path);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    cleanup();
  }
});
