import type { GoogleTokenInfo, GoogleTokensResponse } from './types.ts';
import { ApiError } from './types.ts';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export function buildGoogleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state?: string;
  scope?: string;
  prompt?: string;
}): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', params.scope || 'openid email profile');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', params.prompt || 'select_account');
  if (params.state) {
    url.searchParams.set('state', params.state);
  }
  return url.toString();
}

export async function exchangeCodeForTokens(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<GoogleTokensResponse> {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = 'Google token exchange failed';
    try {
      const errJson = JSON.parse(errorText);
      message = errJson.error_description || errJson.error || message;
    } catch {}
    throw new ApiError(400, 'GOOGLE_TOKEN_ERROR', message);
  }

  return (await response.json()) as GoogleTokensResponse;
}

export async function verifyGoogleIdToken(idToken: string, expectedClientId?: string): Promise<GoogleTokenInfo> {
  const url = new URL(GOOGLE_TOKENINFO_URL);
  url.searchParams.set('id_token', idToken);

  const response = await fetch(url.toString(), {
    method: 'GET',
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = 'Invalid Google ID token';
    try {
      const errJson = JSON.parse(errorText);
      message = errJson.error_description || errJson.error || message;
    } catch {}
    throw new ApiError(401, 'INVALID_GOOGLE_TOKEN', message);
  }

  const tokenInfo = (await response.json()) as GoogleTokenInfo;

  if (expectedClientId && tokenInfo.aud && tokenInfo.aud !== expectedClientId) {
    throw new ApiError(401, 'GOOGLE_AUD_MISMATCH', 'Google token audience does not match configured Client ID');
  }

  return tokenInfo;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleTokenInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(401, 'GOOGLE_USERINFO_ERROR', 'Failed to retrieve user profile from Google');
  }

  return (await response.json()) as GoogleTokenInfo;
}

