// Cloudflare Worker that serves ghoommates.sourabh.org from the Cloud Run service.
// Cloud Run domain mapping is not offered in asia-south1, so the domain is proxied here instead.
const ORIGIN = 'ghoommates-449943395156.asia-south1.run.app';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.hostname = ORIGIN; // Cloud Run routes on the Host header, so it must be the run.app name
    return fetch(url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'manual', // pass our own redirects (e.g. after Google sign-in) back to the browser
    });
  },
};
