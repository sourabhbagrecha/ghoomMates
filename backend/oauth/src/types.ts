export interface User {
  id: string; // e.g. usr_1234567890
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
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

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}
