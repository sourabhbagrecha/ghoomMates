import { GoogleAuth, type IdTokenClient } from 'google-auth-library';

// Calls to our private Cloud Run services (face-search, the voice agent) carry a Google ID token whose audience is
// the service URL. A local URL (docker compose, a worker on this laptop) is called without one.

export function isLocalUrl(url: string) {
  return url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
}

/** Authorization headers for a Cloud Run URL, from `auth`'s identity. The client caches and refreshes the token. */
export function idTokenHeaders(auth: () => GoogleAuth) {
  let client: Promise<IdTokenClient> | undefined;
  return async (url: string): Promise<Record<string, string>> => {
    client ??= Promise.resolve().then(() => auth().getIdTokenClient(url));
    const headers = new Headers((await client.then(c => c.getRequestHeaders(url))) as HeadersInit);
    const out: Record<string, string> = {};
    headers.forEach((value, key) => { out[key] = value; });
    return out;
  };
}
