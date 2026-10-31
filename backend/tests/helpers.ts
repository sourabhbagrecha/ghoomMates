import express from 'express';
import type { Router } from 'express';
import type { AddressInfo } from 'node:net';
import { errorHandler, notFound } from '../src/http.ts';

type Listener = { listen: express.Express['listen'] };

// Serves an Express app on an ephemeral port and returns a fetch bound to it.
export async function serve(app: Listener) {
  const server = await new Promise<ReturnType<Listener['listen']>>((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', (err?: Error) => err ? reject(err) : resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    request: (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${port}${path}`, init),
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}

// Mounts a single module router with the shared 404 and error envelope, like createServer does.
export function mount(path: string, router: Router) {
  return express().use(path, router).use(notFound).use(errorHandler);
}
