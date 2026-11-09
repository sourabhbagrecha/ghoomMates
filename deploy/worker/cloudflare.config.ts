// Deploy from this folder with the cf CLI: npm install && cf deploy
import { defineConfig } from 'cf/config';

import * as entrypoint from './src/index.js' with { type: 'cf-worker' };

export default defineConfig({
  worker: {
    name: 'ghoommates-proxy',
    compatibilityDate: '2026-10-01',
    entrypoint,
    domains: ['ghoommates.sourabh.org'],
  },
});
