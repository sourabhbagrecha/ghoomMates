import { ApiError } from './types.ts';
import { OAuthService } from './service.ts';
import type { OAuthDatabase } from './database.ts';
import type { OAuthServiceConfig } from './service.ts';

const MAX_BODY_BYTES = 64 * 1024;

async function readJson(request: Request): Promise<any> {
  const ctype = request.headers.get('content-type')?.split(';')[0].trim();
  if (ctype !== 'application/json') {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use Content-Type: application/json');
  }

  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'INVALID_JSON', 'Request body is required');

  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new ApiError(413, 'BODY_TOO_LARGE', 'Request body exceeds 64 KiB');
    }
    chunks.push(value);
  }

  try {
    const str = Buffer.concat(chunks).toString('utf8');
    return JSON.parse(str);
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Malformed JSON body');
  }
}

function getBearerToken(request: Request): string {
  const authHeader = request.headers.get('authorization') || '';
  const [type, token] = authHeader.split(' ');
  if (type?.toLowerCase() !== 'bearer' || !token) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Bearer token is missing or malformed');
  }
  return token.trim();
}

function corsHeaders(request: Request, clientOrigin: string): Record<string, string> {
  const reqOrigin = request.headers.get('origin');
  const allowedOrigin = reqOrigin && (reqOrigin === clientOrigin || reqOrigin.startsWith('http://localhost:'))
    ? reqOrigin
    : clientOrigin;

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

function json(value: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

export function createApp(db: OAuthDatabase, config: OAuthServiceConfig) {
  const service = new OAuthService(db, config);
  const clientOrigin = config.clientOrigin || 'http://localhost:5173';

  return async (request: Request): Promise<Response> => {
    const cors = corsHeaders(request, clientOrigin);

    // Preflight OPTIONS handler
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: cors,
      });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;

      // Health check
      if ((path === '/health' || path === '/auth/health') && method === 'GET') {
        return json({ status: 'ok', service: 'ghoomates-oauth', version: '0.1.0' }, 200, cors);
      }

      // Public OAuth configuration info (whether Google is configured, Client ID)
      if (path === '/auth/config' && method === 'GET') {
        return json(service.getAuthConfig(), 200, cors);
      }

      // Google OAuth URL generation
      if (path === '/auth/google/url' && method === 'GET') {
        const redirectUri = url.searchParams.get('redirect_uri') || undefined;
        const state = url.searchParams.get('state') || undefined;
        const authUrl = service.getGoogleAuthUrl(redirectUri, state);
        return json({ url: authUrl }, 200, cors);
      }

      // Google ID token verification (Google Identity Services One-Tap / GIS button)
      if (path === '/auth/google/verify' && method === 'POST') {
        const body = await readJson(request);
        const credential = body.credential || body.id_token || body.idToken;
        if (!credential) {
          throw new ApiError(400, 'MISSING_CREDENTIAL', 'Google ID credential is required');
        }
        const result = await service.handleGoogleIdToken(credential);
        return json(result, 200, cors);
      }

      // Google OAuth authorization code exchange (POST from client)
      if ((path === '/auth/callback' || path === '/auth/google/callback') && method === 'POST') {
        const body = await readJson(request);
        const code = body.code;
        const redirectUri = body.redirectUri || body.redirect_uri;
        if (!code) {
          throw new ApiError(400, 'MISSING_CODE', 'Authorization code is required');
        }
        const result = await service.handleGoogleCode(code, redirectUri);
        return json(result, 200, cors);
      }

      // Google OAuth authorization code redirect (GET from browser redirect)
      if ((path === '/auth/callback' || path === '/auth/google/callback') && method === 'GET') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          console.error('Google OAuth redirect error:', error);
          const redirectError = `${clientOrigin}/#/sign-in?error=${encodeURIComponent(error)}`;
          return Response.redirect(redirectError, 302);
        }

        if (!code) {
          throw new ApiError(400, 'MISSING_CODE', 'Authorization code missing from redirect');
        }

        const result = await service.handleGoogleCode(code);
        const destination = 'selfie';
        const target = `${clientOrigin}/#/${destination}?token=${encodeURIComponent(result.token)}`;
        return Response.redirect(target, 302);
      }

      // Dev mock login for rapid local development
      if (path === '/auth/dev/login' && method === 'POST') {
        const body = await readJson(request).catch(() => ({}));
        const result = await service.devMockLogin(body);
        return json(result, 200, cors);
      }

      // Current authenticated user
      if (path === '/auth/me' && method === 'GET') {
        const token = getBearerToken(request);
        const { user } = await service.verifySessionToken(token);
        return json({ user }, 200, cors);
      }

      // Update user profile (e.g. selfie photo)
      if ((path === '/auth/profile' || path === '/auth/me') && (method === 'PATCH' || method === 'PUT')) {
        const token = getBearerToken(request);
        const { user: currentUser } = await service.verifySessionToken(token);
        const body = await readJson(request);
        const updated = await service.updateProfile(currentUser.id, {
          picture: body.picture,
          name: body.name,
        });
        return json({ user: updated }, 200, cors);
      }

      // Logout
      if (path === '/auth/logout' && method === 'POST') {
        // Stateless JWT logout (client deletes token; optionally blacklist if stateful)
        return json({ ok: true, message: 'Logged out successfully' }, 200, cors);
      }

      throw new ApiError(404, 'NOT_FOUND', `Route ${method} ${path} not found`);
    } catch (err: any) {
      if (err instanceof ApiError) {
        return json({ error: { code: err.code, message: err.message } }, err.status, cors);
      }
      console.error('OAuth API internal error:', err);
      return json({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500, cors);
    }
  };
}
