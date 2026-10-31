import { createApp } from './app.ts';
import { openDatabase } from './database.ts';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Automatically load .env if present
try {
  const envPath = resolve(import.meta.dirname, '../.env');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...vals] = trimmed.split('=');
    if (key && vals.length > 0 && !process.env[key]) {
      process.env[key] = vals.join('=').replace(/^["']|["']$/g, '');
    }
  }
} catch {}

const apiKey = process.env.API_KEY ?? '';
if (apiKey.length < 32) throw new Error('Set API_KEY to a secret of at least 32 characters in .env');
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
const hostname = process.env.HOST ?? '127.0.0.1';

const db = await openDatabase();
const fetchHandler = createApp(db, apiKey);

let serverClose: () => Promise<void>;

if (typeof (globalThis as any).Bun !== 'undefined') {
  const bunServer = (globalThis as any).Bun.serve({
    hostname,
    port,
    maxRequestBodySize: 64 * 1024,
    fetch: fetchHandler,
  });
  console.log(`Ghoomates expense API listening at ${bunServer.url}`);
  serverClose = async () => { await bunServer.stop(); };
} else {
  const nodeServer = http.createServer(async (req, res) => {
    try {
      const url = `http://${req.headers.host || `${hostname}:${port}`}${req.url}`;
      const method = req.method || 'GET';
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = ['GET', 'HEAD'].includes(method) ? undefined : Buffer.concat(chunks);
      const webReq = new Request(url, { method, headers, body });
      const webRes = await fetchHandler(webReq);
      res.statusCode = webRes.status;
      webRes.headers.forEach((val, key) => res.setHeader(key, val));
      const resBody = Buffer.from(await webRes.arrayBuffer());
      res.end(resBody);
    } catch (err) {
      console.error('Server error:', err);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }));
    }
  });

  await new Promise<void>((resolve) => nodeServer.listen(port, hostname, () => resolve()));
  console.log(`Ghoomates expense API listening at http://${hostname}:${port}`);
  serverClose = () => new Promise<void>((resolve, reject) => nodeServer.close((err) => err ? reject(err) : resolve()));
}

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await serverClose();
  await db.terminate();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
