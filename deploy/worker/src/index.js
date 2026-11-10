// Cloudflare Worker that serves ghoommates.sourabh.org from the Cloud Run service.
// Cloud Run domain mapping is not offered in asia-south1, so the domain is proxied here instead.
const ORIGIN = 'ghoommates-449943395156.asia-south1.run.app';

// Vulnerability scanners probe for these (/.git/config, /wp-login.php, /firebase-key.json...). None of them exist in the
// app, and each probe would wake a Cloud Run instance that is billed for its whole life (it runs the voice worker), so
// they get a 404 here instead.
const DOT_PATH = /\/\.(?!well-known\/)/; // a hidden file or folder anywhere in the path
const SCANNER_PATH = /^\/(wp-|wordpress\/|xmlrpc\.php|phpmyadmin|cgi-bin\/|[^/]+\.json$)/i;
const SCANNER_EXT = /\.(php\d?|aspx?|jsp|cgi|env|ini|sql|bak|old|swp|log|ya?ml|config|zip|tar|t?gz|rar|7z)$/i;

function isScannerProbe(pathname) {
  if (pathname.startsWith('/api/') || pathname.startsWith('/auth/')) return false;
  return DOT_PATH.test(pathname) || SCANNER_PATH.test(pathname) || SCANNER_EXT.test(pathname);
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (isScannerProbe(url.pathname)) return new Response('Not found', { status: 404 });
    url.hostname = ORIGIN; // Cloud Run routes on the Host header, so it must be the run.app name
    return fetch(url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'manual', // pass our own redirects (e.g. after Google sign-in) back to the browser
    });
  },
};
