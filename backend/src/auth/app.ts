import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import { ApiError } from './types.ts';
import { OAuthService } from './service.ts';
import { jsonBody, optionalJsonBody } from '../http.ts';
import type { ProfilePatch, OAuthDatabase } from './database.ts';
import type { OAuthServiceConfig } from './service.ts';

function getBearerToken(req: Request): string {
  const authHeader = req.headers.authorization || '';
  const [type, token] = authHeader.split(' ');
  if (type?.toLowerCase() !== 'bearer' || !token) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Bearer token is missing or malformed');
  }
  return token.trim();
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function cors(clientOrigin: string): RequestHandler {
  return (req, res, next) => {
    const reqOrigin = req.headers.origin;
    const allowedOrigin = reqOrigin && (reqOrigin === clientOrigin || reqOrigin.startsWith('http://localhost:'))
      ? reqOrigin
      : clientOrigin;

    res.set({
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin',
    });

    // Preflight OPTIONS handler
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  };
}

// Google OAuth and user profile routes. Mount under /auth.
export function createApp(db: OAuthDatabase, config: OAuthServiceConfig) {
  const service = new OAuthService(db, config);
  const clientOrigin = config.clientOrigin || 'http://localhost:5173';
  const router = Router();

  router.use(cors(clientOrigin));

  // Health check & module info
  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'ghoomates-oauth',
      version: '0.1.0',
      frontendUrl: clientOrigin,
      endpoints: [
        '/auth/health',
        '/auth/config',
        '/auth/google/url',
        '/auth/google/verify',
        '/auth/callback',
        '/auth/me',
        '/auth/profile',
      ],
    });
  });

  // Public OAuth configuration info (whether Google is configured, Client ID)
  router.get('/config', (_req, res) => {
    res.json(service.getAuthConfig());
  });

  // Google OAuth URL generation
  router.get('/google/url', (req, res) => {
    const authUrl = service.getGoogleAuthUrl(queryString(req.query.redirect_uri), queryString(req.query.state));
    res.json({ url: authUrl });
  });

  // Google ID token verification (Google Identity Services One-Tap / GIS button)
  router.post('/google/verify', jsonBody, async (req, res) => {
    const credential = req.body.credential || req.body.id_token || req.body.idToken;
    if (!credential) {
      throw new ApiError(400, 'MISSING_CREDENTIAL', 'Google ID credential is required');
    }
    res.json(await service.handleGoogleIdToken(credential));
  });

  // Google OAuth authorization code exchange (POST from client)
  router.post(['/callback', '/google/callback'], jsonBody, async (req, res) => {
    const code = req.body.code;
    const redirectUri = req.body.redirectUri || req.body.redirect_uri;
    if (!code) {
      throw new ApiError(400, 'MISSING_CODE', 'Authorization code is required');
    }
    res.json(await service.handleGoogleCode(code, redirectUri));
  });

  // Google OAuth authorization code redirect (GET from browser redirect)
  router.get(['/callback', '/google/callback'], async (req, res) => {
    const signInError = (reason: string) => `${clientOrigin}/#/sign-in?error=${encodeURIComponent(reason)}`;
    const code = queryString(req.query.code);
    const error = queryString(req.query.error);

    if (error) {
      console.error('Google OAuth redirect error:', error);
      return res.redirect(302, signInError(error));
    }

    if (!code) {
      console.error('Google OAuth missing authorization code');
      return res.redirect(302, signInError('missing_authorization_code'));
    }

    try {
      const result = await service.handleGoogleCode(code);
      res.redirect(302, `${clientOrigin}/#/selfie?token=${encodeURIComponent(result.token)}`);
    } catch (authErr: any) {
      console.error('Google OAuth code exchange error:', authErr);
      res.redirect(302, signInError(authErr.message || 'google_auth_failed'));
    }
  });

  // Dev mock login for rapid local development
  router.post('/dev/login', optionalJsonBody, async (req, res) => {
    res.json(await service.devMockLogin(req.body));
  });

  // Resolves the Bearer session token into res.locals.user before the body is read.
  const requireUser: RequestHandler = async (req, res, next) => {
    res.locals.user = (await service.verifySessionToken(getBearerToken(req))).user;
    next();
  };

  // Current authenticated user
  router.get('/me', requireUser, (_req, res) => {
    res.json({ user: res.locals.user });
  });

  // Update user profile (e.g. selfie photo)
  const updateProfile: RequestHandler = async (req, res) => {
    // Only fields present in the body change
    const patch: ProfilePatch = {};
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new ApiError(400, 'INVALID_PROFILE', 'Profile must be an object');
    }
    if ('username' in req.body) {
      if (typeof req.body.username !== 'string') throw new ApiError(400, 'INVALID_USERNAME', 'Username must be a string');
      const username = req.body.username.replace(/^@/, '').toLowerCase().trim();
      if (!/^[a-z0-9._]{3,64}$/.test(username)) throw new ApiError(400, 'INVALID_USERNAME', 'Use 3–64 letters, numbers, dots or underscores');
      patch.username = username;
    }
    if ('preferences' in req.body) {
      if (!req.body.preferences || typeof req.body.preferences !== 'object' || Array.isArray(req.body.preferences)) {
        throw new ApiError(400, 'INVALID_PREFERENCES', 'Preferences must be a JSON object');
      }
      patch.preferences = req.body.preferences;
    }
    if (typeof req.body.picture === 'string') patch.picture = req.body.picture;
    if (typeof req.body.name === 'string' && req.body.name.trim()) patch.name = req.body.name.trim();
    const updated = await service.updateProfile(res.locals.user.id, patch);
    res.json({ user: updated });
  };
  router.patch(['/profile', '/me'], requireUser, jsonBody, updateProfile);
  router.put(['/profile', '/me'], requireUser, jsonBody, updateProfile);

  // Logout
  router.post('/logout', (_req, res) => {
    // Stateless JWT logout (client deletes token; optionally blacklist if stateful)
    res.json({ ok: true, message: 'Logged out successfully' });
  });

  return router;
}
