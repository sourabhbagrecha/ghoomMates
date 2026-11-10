import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { exitWhenIdle } from '../src/idle.ts';

test('exitWhenIdle waits for in-flight requests, then for the idle limit', async () => {
  let release = () => {};
  const server = createServer((_req, res) => { release = () => res.end('ok'); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  let idleAt = 0;
  exitWhenIdle(server, 0.002, () => { idleAt = Date.now(); }); // 120 ms

  const response = fetch(`http://127.0.0.1:${port}/`, { headers: { connection: 'close' } });
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(idleAt, 0, 'a request in flight keeps the server up');

  release();
  await (await response).text();
  const finishedAt = Date.now();
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.ok(idleAt >= finishedAt + 100, 'exits only after the limit has passed since the last request');
  server.close();
});
