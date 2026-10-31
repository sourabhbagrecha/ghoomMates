import { Router } from 'express';
import type { Request, RequestHandler } from 'express';
import { ApiError } from './types.ts';
import { OAuthService } from './service.ts';
import { assertDevLogin } from './devLogin.ts';
import { jsonBody, optionalJsonBody } from '../http.ts';
import { logger } from '../logger.ts';
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
  // Local dev servers (any localhost port) may call the API; a production server answers only its own client origin.
  const allowLocalhost = process.env.NODE_ENV !== 'production';
  return (req, res, next) => {
    const reqOrigin = req.headers.origin;
    const allowedOrigin = reqOrigin && (reqOrigin === clientOrigin || (allowLocalhost && reqOrigin.startsWith('http://localhost:')))
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

export type AuthAppConfig = OAuthServiceConfig & {
  // Called after a profile update that changed the picture (e.g. to copy the selfie to media storage).
  onPictureSaved?: (userId: string, picture: string) => void;
};

// Google OAuth and user profile routes. Mount under /auth.
export function createApp(db: OAuthDatabase, config: AuthAppConfig) {
  const service = new OAuthService(db, config);
  const clientOrigin = config.clientOrigin || 'http://localhost:5173';
  const router = Router();

  if (service.devLoginEnabled && process.env.NODE_ENV === 'production') {
    logger.warn('Auth', 'Test sign-in is on in production: anyone can sign in as a demo account (DEV_LOGIN_EMAILS, default Aditi and Kabir). Switch it off after the demo.');
  }

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
    const cfg = service.getAuthConfig();
    logger.debug('Auth', `Configuration requested (configured: ${cfg.isConfigured}, devMode: ${cfg.devModeEnabled})`);
    res.json(cfg);
  });

  // Google OAuth URL generation
  router.get('/google/url', (req, res) => {
    const redirectUri = queryString(req.query.redirect_uri);
    const authUrl = service.getGoogleAuthUrl(redirectUri, queryString(req.query.state));
    logger.info('Auth', `Generated Google OAuth redirect URL (redirectUri: ${redirectUri || 'default'})`);
    res.json({ url: authUrl });
  });

  // Google ID token verification (Google Identity Services One-Tap / GIS button)
  router.post('/google/verify', jsonBody, async (req, res) => {
    const credential = req.body.credential || req.body.id_token || req.body.idToken;
    if (!credential) {
      throw new ApiError(400, 'MISSING_CREDENTIAL', 'Google ID credential is required');
    }
    logger.info('Auth', 'Verifying Google ID credential...');
    const result = await service.handleGoogleIdToken(credential);
    logger.info('Auth', `Google ID verified for user: ${result.user.email} (id: ${result.user.id}, new: ${result.isNewUser})`);
    res.json(result);
  });

  // Google OAuth authorization code exchange (POST from client)
  router.post(['/callback', '/google/callback'], jsonBody, async (req, res) => {
    const code = req.body.code;
    const redirectUri = req.body.redirectUri || req.body.redirect_uri;
    if (!code) {
      throw new ApiError(400, 'MISSING_CODE', 'Authorization code is required');
    }
    logger.info('Auth', `Exchanging Google OAuth code (POST) with redirectUri: ${redirectUri || 'default'}`);
    const result = await service.handleGoogleCode(code, redirectUri);
    logger.info('Auth', `Successfully logged in user via Google code: ${result.user.email} (${result.user.name})`);
    res.json(result);
  });

  // Google OAuth authorization code redirect (GET from browser redirect)
  router.get(['/callback', '/google/callback'], async (req, res) => {
    const signInError = (reason: string) => `${clientOrigin}/#/sign-in?error=${encodeURIComponent(reason)}`;
    const code = queryString(req.query.code);
    const error = queryString(req.query.error);

    if (error) {
      logger.error('Auth', `Google OAuth redirect received error from Google: ${error}`);
      return res.redirect(302, signInError(error));
    }

    if (!code) {
      logger.warn('Auth', 'Google OAuth redirect received without authorization code');
      return res.redirect(302, signInError('missing_authorization_code'));
    }

    try {
      logger.info('Auth', 'Handling Google OAuth redirect code exchange from browser...');
      const result = await service.handleGoogleCode(code);
      logger.info('Auth', `Google OAuth exchange successful for: ${result.user.email} (id: ${result.user.id}, new: ${result.isNewUser}) -> redirecting to /#/selfie`);
      res.redirect(302, `${clientOrigin}/#/selfie?token=${encodeURIComponent(result.token)}`);
    } catch (authErr: any) {
      logger.error('Auth', `Google OAuth code exchange failed: ${authErr.message || String(authErr)}`);
      res.redirect(302, signInError(authErr.message || 'google_auth_failed'));
    }
  });

  // Dev mock login for rapid local development; off in production unless ALLOW_DEV_LOGIN=true (see devLogin.ts)
  router.post('/dev/login', optionalJsonBody, async (req, res) => {
    assertDevLogin(service.devLoginEnabled);
    logger.info('Auth', `Dev mock login requested for ${req.body?.email || 'Aditi Sharma (default)'}`);
    const result = await service.devMockLogin(req.body);
    logger.info('Auth', `Dev mock login granted: ${result.user.email} (id: ${result.user.id})`);
    res.json(result);
  });

  // Resolves the Bearer session token into res.locals.user before the body is read.
  const requireUser: RequestHandler = async (req, res, next) => {
    res.locals.user = (await service.verifySessionToken(getBearerToken(req))).user;
    next();
  };

  // Current authenticated user
  router.get('/me', requireUser, (_req, res) => {
    logger.debug('Auth', `Fetched profile for user ${res.locals.user.email} (${res.locals.user.id})`);
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
    logger.info('Auth', `Updating profile for user ${res.locals.user.email} (${res.locals.user.id}): keys=[${Object.keys(patch).join(', ')}]`);
    const updated = await service.updateProfile(res.locals.user.id, patch);
    if (patch.picture) config.onPictureSaved?.(updated.id, patch.picture);
    logger.info('Auth', `Profile updated successfully for user ${res.locals.user.email}`);
    res.json({ user: updated });
  };
  router.patch(['/profile', '/me'], requireUser, jsonBody, updateProfile);
  router.put(['/profile', '/me'], requireUser, jsonBody, updateProfile);

  // Logout
  router.post('/logout', (_req, res) => {
    // Stateless JWT logout (client deletes token; optionally blacklist if stateful)
    logger.info('Auth', 'User logged out (token cleared on client)');
    res.json({ ok: true, message: 'Logged out successfully' });
  });

  return router;
}
