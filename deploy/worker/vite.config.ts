import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// The Worker's static assets are the built web app: Vite copies its public folder into the assets upload, and the
// public folder is frontend/dist. The @cloudflare/vite-plugin only uploads assets when that folder is non-empty.
const FRONTEND = fileURLToPath(new URL('../../frontend', import.meta.url));
const FRONTEND_DIST = `${FRONTEND}/dist`;
const YEAR_SECONDS = 365 * 24 * 60 * 60;

// `cf deploy` (and `cf build`) builds the web app first, so the edge copy always matches the checked-out code.
// SKIP_FRONTEND_BUILD=1 reuses an existing frontend/dist. cf resolves this config more than once (and in child
// processes), so the variable is also set after the first build.
function buildFrontend(): Plugin {
  return {
    name: 'ghoommates:build-frontend',
    apply: 'build',
    config() {
      if (process.env.SKIP_FRONTEND_BUILD === '1') return;
      if (!existsSync(`${FRONTEND}/node_modules`)) execSync('npm ci --no-audit --no-fund', { cwd: FRONTEND, stdio: 'inherit' });
      execSync('npm run build', { cwd: FRONTEND, stdio: 'inherit' });
      process.env.SKIP_FRONTEND_BUILD = '1';
    },
  };
}

// Cache rules for the assets, the same as backend/src/frontend.ts: Vite names everything in assets/ after its content
// hash, so those never change; other public files (favicon, images) get an hour. index.html keeps Cloudflare's default
// (public, max-age=0, must-revalidate), so a new deploy takes effect at once. Written as the _headers file, which
// `cf deploy` reads from the assets folder and does not serve. .assetsignore keeps hidden files (public/.gitkeep) out
// of the upload, as the backend does not serve them either.
function cacheHeaders(): Plugin {
  return {
    name: 'ghoommates:cache-headers',
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
    generateBundle() {
      const rules = [`/assets/*\n  Cache-Control: public, max-age=${YEAR_SECONDS}, immutable`];
      for (const entry of readdirSync(FRONTEND_DIST, { withFileTypes: true })) {
        if (entry.name === 'assets' || entry.name === 'index.html' || entry.name.startsWith('.')) continue;
        rules.push(`/${entry.name}${entry.isDirectory() ? '/*' : ''}\n  Cache-Control: public, max-age=3600`);
      }
      this.emitFile({ type: 'asset', fileName: '_headers', source: `${rules.join('\n')}\n` });
      this.emitFile({ type: 'asset', fileName: '.assetsignore', source: '.*\n' });
    },
  };
}

export default defineConfig({
  publicDir: FRONTEND_DIST,
  plugins: [buildFrontend(), cloudflare(), cacheHeaders()],
});
