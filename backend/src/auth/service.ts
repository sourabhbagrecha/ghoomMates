import type { ProfilePatch, OAuthDatabase } from './database.ts';
import { assertDevLogin, assertDevLoginEmail, devLoginAllowed } from './devLogin.ts';
import { buildGoogleAuthUrl, exchangeCodeForTokens, fetchGoogleUserInfo, verifyGoogleIdToken } from './google.ts';
import { signJwt, verifyJwt } from './jwt.ts';
import type { AuthResult, GoogleTokenInfo, User } from './types.ts';
import { ApiError } from './types.ts';

// Uploaded selfies are stored as data URLs; kept out of the token, they would push the
// Authorization header past the server's header size limit. Clients read them from /auth/me.
function tokenPicture(picture?: string): string | undefined {
  return picture && !picture.startsWith('data:') ? picture : undefined;
}

export interface OAuthServiceConfig {
  jwtSecret: string;
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri?: string;
  clientOrigin?: string;
  // Whether the mock sign-in works. Defaults to devLoginAllowed(): ALLOW_DEV_LOGIN, else on unless NODE_ENV=production.
  devLogin?: boolean;
}

export class OAuthService {
  private db: OAuthDatabase;
  private config: OAuthServiceConfig;

  constructor(db: OAuthDatabase, config: OAuthServiceConfig) {
    this.db = db;
    this.config = config;
    if (this.config.jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters');
    }
  }

  get devLoginEnabled(): boolean {
    return this.config.devLogin ?? devLoginAllowed();
  }

  getAuthConfig() {
    return {
      googleClientId: this.config.googleClientId || null,
      isConfigured: Boolean(this.config.googleClientId && this.config.googleClientSecret),
      redirectUri: this.config.googleRedirectUri || 'http://localhost:5173/auth/callback',
      clientOrigin: this.config.clientOrigin || 'http://localhost:5173',
      devModeEnabled: this.devLoginEnabled,
    };
  }

  getGoogleAuthUrl(customRedirectUri?: string, state?: string): string {
    const clientId = this.config.googleClientId;
    if (!clientId) {
      throw new ApiError(
        400,
        'GOOGLE_OAUTH_NOT_CONFIGURED',
        'GOOGLE_CLIENT_ID is not configured in backend/.env. You can set up Google Cloud credentials or use dev mock sign-in for local testing.'
      );
    }
    const redirectUri = customRedirectUri || this.config.googleRedirectUri || `${this.config.clientOrigin || 'http://localhost:5173'}/auth/callback`;
    return buildGoogleAuthUrl({
      clientId,
      redirectUri,
      state,
    });
  }

  async handleGoogleIdToken(idToken: string): Promise<AuthResult> {
    if (!idToken || typeof idToken !== 'string') {
      throw new ApiError(400, 'INVALID_REQUEST', 'Google credential id_token is required');
    }

    const tokenInfo = await verifyGoogleIdToken(idToken, this.config.googleClientId);

    if (!tokenInfo.email) {
      throw new ApiError(400, 'MISSING_EMAIL', 'Google account does not have an email address');
    }

    const { user, isNew } = await this.db.upsertGoogleUser({
      googleId: tokenInfo.sub,
      email: tokenInfo.email,
      emailVerified: tokenInfo.email_verified === 'true' || tokenInfo.email_verified === true,
      name: tokenInfo.name || tokenInfo.email.split('@')[0],
      givenName: tokenInfo.given_name,
      familyName: tokenInfo.family_name,
      locale: tokenInfo.locale,
    });

    const token = signJwt(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        picture: tokenPicture(user.picture),
      },
      this.config.jwtSecret
    );

    return { user, token, isNewUser: isNew };
  }

  async handleGoogleCode(code: string, customRedirectUri?: string): Promise<AuthResult> {
    if (!this.config.googleClientId || !this.config.googleClientSecret) {
      throw new ApiError(
        400,
        'GOOGLE_OAUTH_NOT_CONFIGURED',
        'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not configured in backend/.env'
      );
    }

    const redirectUri =
      customRedirectUri || this.config.googleRedirectUri || `${this.config.clientOrigin || 'http://localhost:5173'}/auth/callback`;

    const tokenResponse = await exchangeCodeForTokens({
      code,
      clientId: this.config.googleClientId,
      clientSecret: this.config.googleClientSecret,
      redirectUri,
    });

    let googleProfile: GoogleTokenInfo;

    if (tokenResponse.id_token) {
      googleProfile = await verifyGoogleIdToken(tokenResponse.id_token, this.config.googleClientId);
    } else {
      googleProfile = await fetchGoogleUserInfo(tokenResponse.access_token);
    }

    if (!googleProfile.email) {
      throw new ApiError(400, 'MISSING_EMAIL', 'Google account has no associated email');
    }

    const { user, isNew } = await this.db.upsertGoogleUser({
      googleId: googleProfile.sub,
      email: googleProfile.email,
      emailVerified: googleProfile.email_verified === true || googleProfile.email_verified === 'true',
      name: googleProfile.name || googleProfile.email.split('@')[0],
      givenName: googleProfile.given_name,
      familyName: googleProfile.family_name,
      locale: googleProfile.locale,
    });

    const token = signJwt(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        picture: tokenPicture(user.picture),
      },
      this.config.jwtSecret
    );

    return { user, token, isNewUser: isNew };
  }

  async devMockLogin(input?: { email?: string; name?: string }): Promise<AuthResult> {
    assertDevLogin(this.devLoginEnabled);
    const email = input?.email?.trim() || 'aditi.travels@gmail.com';
    assertDevLoginEmail(email);
    const name = input?.name?.trim() || 'Aditi Sharma';
    const googleId = `dev_google_${Buffer.from(email).toString('hex').slice(0, 16)}`;

    const { user, isNew } = await this.db.upsertGoogleUser({
      googleId,
      email,
      emailVerified: true,
      name,
      givenName: name.split(' ')[0],
      familyName: name.split(' ').slice(1).join(' ') || undefined,
    });

    const token = signJwt(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        picture: tokenPicture(user.picture),
      },
      this.config.jwtSecret
    );

    return { user, token, isNewUser: isNew };
  }

  async updateProfile(userId: string, patch: ProfilePatch): Promise<User> {
    const user = await this.db.updateUserProfile(userId, patch);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'User profile not found');
    return user;
  }

  async getUserById(userId: string): Promise<User> {
    const user = await this.db.findUserById(userId);
    if (!user) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'User profile not found');
    }
    return user;
  }

  async verifySessionToken(token: string): Promise<{ user: User; session: ReturnType<typeof verifyJwt> }> {
    const session = verifyJwt(token, this.config.jwtSecret);
    const user = await this.getUserById(session.userId);
    return { user, session };
  }
}
