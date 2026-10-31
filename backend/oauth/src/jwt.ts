import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SessionPayload } from './types.ts';
import { ApiError } from './types.ts';

function base64UrlEncode(data: Buffer | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

export function signJwt(payload: Omit<SessionPayload, 'iat' | 'exp'>, secret: string, expiresInSeconds = 7 * 24 * 60 * 60): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: SessionPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const message = `${headerB64}.${payloadB64}`;

  const hmac = createHmac('sha256', secret);
  hmac.update(message);
  const signatureB64 = base64UrlEncode(hmac.digest());

  return `${message}.${signatureB64}`;
}

export function verifyJwt(token: string, secret: string): SessionPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new ApiError(401, 'INVALID_TOKEN', 'Malformed JWT token');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const message = `${headerB64}.${payloadB64}`;

  const hmac = createHmac('sha256', secret);
  hmac.update(message);
  const expectedSig = base64UrlEncode(hmac.digest());

  const sigBuf = Buffer.from(signatureB64);
  const expectedBuf = Buffer.from(expectedSig);

  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new ApiError(401, 'INVALID_SIGNATURE', 'Token signature verification failed');
  }

  try {
    const payload: SessionPayload = JSON.parse(base64UrlDecode(payloadB64));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      throw new ApiError(401, 'TOKEN_EXPIRED', 'Token has expired');
    }

    return payload;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(401, 'INVALID_PAYLOAD', 'Unable to parse token payload');
  }
}

