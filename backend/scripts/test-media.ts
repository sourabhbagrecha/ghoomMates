// Checks the configured media storage end to end: signed PUT from "the browser", size check, signed GET.
// Usage: node scripts/test-media.ts   (writes one small object under healthcheck/ in the bucket)
import { loadEnv } from '../src/env.ts';
loadEnv();
import { createMediaStorage } from '../src/storage.ts';

const storage = createMediaStorage(process.env.JWT_SECRET || 'x'.repeat(32));
console.log(`Storage: ${storage.description}`);
if (storage.kind === 'local') console.log('GCS is not configured; set GCS_BUCKET and GCS_CREDENTIALS_BASE64 to test it.');
const key = `healthcheck/${Date.now()}.png`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const base = `http://127.0.0.1:${process.env.PORT ?? 3000}`;
const absolute = (url: string) => url.startsWith('/') ? `${base}${url}` : url;

const target = await storage.createUpload(key, 'image/png');
const put = await fetch(absolute(target.url), { method: 'PUT', headers: target.headers, body: png });
console.log(`PUT  ${put.status}`);
if (!put.ok) throw new Error(await put.text());
console.log(`size ${await storage.size(key)} bytes`);
const get = await fetch(absolute(await storage.readUrl(key)));
const same = Buffer.from(await get.arrayBuffer()).equals(png);
console.log(`GET  ${get.status} (${same ? 'content matches' : 'content differs'})`);
if (!same) process.exit(1);
