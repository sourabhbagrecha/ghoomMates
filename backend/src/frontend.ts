import { existsSync } from 'node:fs';
import { basename, extname, join, resolve, sep } from 'node:path';
import express, { Router } from 'express';
import type { RequestHandler, Response } from 'express';
import { logger } from './logger.ts';

// Serves the built web app (frontend/dist) from the same server as the API, so one Cloud Run URL is the whole product.
// Mounted after every API route, so it never shadows one: API-looking paths (/api, /auth, /health) and anything that
// names a file stay a JSON 404 instead of turning into index.html.
// ghoommates.sourabh.org serves the app from the Cloudflare Worker instead (deploy/worker), with the same paths and
// caching rules; this copy serves the run.app address and local production runs. Keep the two in step.

const API_PATH = /^\/(?:api|auth|health)(?:\/|$)/;
const HIDDEN_PATH = /(?:^|\/)\./;
// Text assets that the image build pre-compresses to <file>.gz (see the Dockerfile)
const COMPRESSIBLE = /\.(?:js|mjs|css|svg|json|html|txt|xml|webmanifest)$/i;
const YEAR_SECONDS = 365 * 24 * 60 * 60;

export function createFrontendRouter(dir: string | undefined): Router | undefined {
  const root = dir?.trim() ? resolve(dir.trim()) : '';
  if (!root) return undefined;
  if (!existsSync(join(root, 'index.html'))) {
    logger.warn('Server', `SERVE_FRONTEND_DIR ${root} has no index.html (run "npm run build"); the web app is not served`);
    return undefined;
  }

  const assets = join(root, 'assets') + sep;
  // Vite names everything in assets/ after its content hash, so those files never change. index.html is always
  // revalidated (a new deploy takes effect at once); other files from public/ (favicon, images) get an hour.
  const cacheControl = (res: Response, file: string) => {
    const name = basename(file, '.gz');
    res.setHeader('Cache-Control', file.startsWith(assets) ? `public, max-age=${YEAR_SECONDS}, immutable` : name === 'index.html' ? 'no-cache' : 'public, max-age=3600');
  };

  const router = Router();

  // Clients that accept gzip get <file>.gz, served by express.static as that path (so it keeps its path safety,
  // ETag and 304 handling) but with the original content type. Files without a .gz sibling fall through.
  const gzipped = express.static(root, {
    index: false,
    redirect: false,
    setHeaders: (res, file) => {
      res.type(extname(file.slice(0, -'.gz'.length)));
      res.setHeader('Content-Encoding', 'gzip');
      cacheControl(res, file);
    },
  });
  const preferGzip: RequestHandler = (req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !COMPRESSIBLE.test(req.path)) return next();
    res.vary('Accept-Encoding');
    if (!req.acceptsEncodings('gzip')) return next();
    const url = req.url;
    const query = url.indexOf('?');
    req.url = query === -1 ? `${url}.gz` : `${url.slice(0, query)}.gz${url.slice(query)}`;
    gzipped(req, res, (err?: unknown) => {
      req.url = url;
      next(err);
    });
  };

  router.use(preferGzip);
  router.use(express.static(root, { index: false, redirect: false, setHeaders: cacheControl }));

  // Single-page app fallback: the app routes itself in the browser, so any other page address gets index.html.
  // A path that names a file ("/assets/old.js") or a hidden one ("/.env", "/.git/config") that wasn't found is a 404.
  router.use((req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || API_PATH.test(req.path)) return next();
    if (HIDDEN_PATH.test(req.path) || req.path.slice(req.path.lastIndexOf('/') + 1).includes('.')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile('index.html', { root }, (err) => err && next(err));
  });

  return router;
}
