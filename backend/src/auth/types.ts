export interface User {
  id: string; // e.g. usr_1234567890
  username: string; // Public user ID; internal id remains stable.
  preferences: Record<string, unknown>;
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  givenName?: string;
  familyName?: string;
  // Profile photo URL: the selfie's mediaUrl unless the user picked another photo (or an older external URL)
  picture?: string;
  // Face-match selfie URL (mediaUrl of users.selfie_key); its face embedding is made on upload by the face-indexer
  selfie?: string;
  locale?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
}

export interface GoogleTokenInfo {
  sub: string;
  email: string;
  email_verified?: string | boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
  aud?: string;
  iss?: string;
  exp?: string;
}

export interface GoogleTokensResponse {
  access_token: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  refresh_token?: string;
}

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  picture?: string;
  iat: number;
  exp: number;
}

export interface AuthResult {
  user: User;
  token: string;
  isNewUser: boolean;
}

export { ApiError } from '../http.ts';
