// Cloudflare Worker for ghoommates.sourabh.org. The built web app is served from Cloudflare's edge as static assets
// (frontend/dist, uploaded by `cf deploy`), and only the backend's paths are forwarded to the Cloud Run service. Cloud
// Run domain mapping is not offered in asia-south1, so the domain is proxied here instead.
//
// Cloud Run bills an instance for its whole life (it runs the voice worker), about 15 minutes for every wake from idle,
// so page loads from bots, link previews and signed-out visitors must never reach it. Cloudflare serves a request that
// names a file in frontend/dist (/, /assets/*, /favicon.png...) without running this code; this code runs for the
// backend's paths, media files (byte ranges) and anything that is not a file. Frontend changes therefore need a Worker
// deploy too (CI does it, see backend/docs/deploy.md).
const ORIGIN = 'ghoommates-449943395156.asia-south1.run.app';

// Everything the browser needs from the server: the API (incl. /api/media and /api/reels/tiles), Google sign-in
// (/auth/callback is the OAuth redirect URI) and /health, which the app pings during a voice call to keep the instance
// up. Keep in sync with runWorkerFirst in cloudflare.config.ts and API_PATH in backend/src/frontend.ts.
const BACKEND_PATH = /^\/(?:api|auth|health)(?:\/|$)/;

// Vulnerability scanners probe for these (/.git/config, /wp-login.php, /firebase-key.json...). None of them exist in the
// app, and each probe would wake a Cloud Run instance, so they get a 404 here instead.
const DOT_PATH = /\/\.(?!well-known\/)/; // a hidden file or folder anywhere in the path
const SCANNER_PATH = /^\/(wp-|wordpress\/|xmlrpc\.php|phpmyadmin|cgi-bin\/|[^/]+\.json$)/i;
const SCANNER_EXT = /\.(php\d?|aspx?|jsp|cgi|env|ini|sql|bak|old|swp|log|ya?ml|config|zip|tar|t?gz|rar|7z)$/i;

function isScannerProbe(pathname) {
  if (pathname.startsWith('/api/') || pathname.startsWith('/auth/')) return false;
  return DOT_PATH.test(pathname) || SCANNER_PATH.test(pathname) || SCANNER_EXT.test(pathname);
}

const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });

// Single-page app fallback, as backend/src/frontend.ts does it: the app routes itself in the browser, so any other page
// address gets index.html (always revalidated). A path that names a file ("/assets/old.js") or a hidden one
// ("/.well-known/...") that wasn't found is a 404.
async function serveApp(request, env, url) {
  const { pathname } = url;
  if (request.method !== 'GET' && request.method !== 'HEAD') return notFound();
  if (pathname.includes('/.') || pathname.slice(pathname.lastIndexOf('/') + 1).includes('.')) return notFound();
  const page = await env.ASSETS.fetch(new URL('/', url), { method: request.method, headers: request.headers });
  const response = new Response(page.body, page);
  response.headers.set('Cache-Control', 'no-cache');
  return response;
}

// Cloudflare answers a Range request for a static asset with the whole file (200), and Safari will not play or seek
// audio without byte ranges, so media files (the story narration, /stories/<site>/<lang>.m4a) run this Worker first
// (runWorkerFirst in cloudflare.config.ts) and get one range cut out of the file here, as express.static does.
const MEDIA_PATH = /\.(?:m4a|mp3|mp4|webm)$/i;
const RANGE = /^bytes=(\d*)-(\d*)$/;

async function serveMedia(request, env) {
  const file = await env.ASSETS.fetch(request);
  if (file.status === 404) return notFound();
  const range = RANGE.exec(request.headers.get('Range') ?? '');
  const ifRange = request.headers.get('If-Range');
  if (file.status !== 200 || request.method !== 'GET' || !range || (ifRange && ifRange !== file.headers.get('ETag'))) {
    const response = new Response(file.body, file);
    response.headers.set('Accept-Ranges', 'bytes');
    return response;
  }
  const bytes = await file.arrayBuffer();
  const size = bytes.byteLength;
  // "bytes=500-" is from 500 to the end, "bytes=-500" the last 500 bytes
  let start = range[1] === '' ? size - Number(range[2]) : Number(range[1]);
  let end = range[1] === '' || range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1);
  start = Math.max(start, 0);
  const headers = new Headers(file.headers);
  headers.set('Accept-Ranges', 'bytes');
  if ((range[1] === '' && range[2] === '') || start > end || start >= size) {
    headers.set('Content-Range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (isScannerProbe(url.pathname)) return notFound();
    if (MEDIA_PATH.test(url.pathname) && !BACKEND_PATH.test(url.pathname)) return serveMedia(request, env);
    if (!BACKEND_PATH.test(url.pathname)) return serveApp(request, env, url);
    url.hostname = ORIGIN; // Cloud Run routes on the Host header, so it must be the run.app name
    return fetch(url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'manual', // pass our own redirects (e.g. after Google sign-in) back to the browser
    });
  },
};
