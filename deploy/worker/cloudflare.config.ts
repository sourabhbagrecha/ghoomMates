// Deploy from this folder with the cf CLI: npm install && cf deploy (it builds frontend/ first; see vite.config.ts)
import { bindings, defineConfig } from 'cf/config';

import * as entrypoint from './src/index.js' with { type: 'cf-worker' };

export default defineConfig({
  worker: {
    name: 'ghoommates-proxy',
    compatibilityDate: '2026-10-01',
    entrypoint,
    domains: ['ghoommates.sourabh.org'],
    // The built web app (frontend/dist, wired in vite.config.ts) is served from Cloudflare's edge without running the
    // Worker. The backend's paths always run the Worker, which forwards them to Cloud Run; media files run it for byte
    // ranges; any other path that is not a file runs it too (notFoundHandling 'none'), and it answers those itself
    // (src/index.js). A '*' here matches across slashes.
    assets: {
      notFoundHandling: 'none',
      runWorkerFirst: ['/api/*', '/auth/*', '/health', '/*.m4a', '/*.mp3', '/*.mp4', '/*.webm'],
    },
    env: {
      ASSETS: bindings.assets(),
    },
  },
});
