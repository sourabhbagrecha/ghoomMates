import { ApiError } from '../http.ts';

// Whether POST /auth/dev/login (the mock sign-in) works.
//
// The mock login signs in as whatever email it is given, so on a public URL it could become any real user. Hence:
//   ALLOW_DEV_LOGIN=true   on
//   ALLOW_DEV_LOGIN=<else> off
//   not set                on for local dev, off when NODE_ENV=production (the Docker image sets it)
// And on a production server where it was switched on anyway, it only signs in the demo accounts (below).
export function devLoginAllowed(env: Record<string, string | undefined> = process.env): boolean {
  const flag = env.ALLOW_DEV_LOGIN?.trim().toLowerCase();
  if (flag) return flag === 'true';
  return env.NODE_ENV !== 'production';
}

// The two accounts the sign-in page offers as quick test accounts.
export const DEMO_EMAILS = ['aditi.travels@gmail.com', 'kabir.mehta@gmail.com'];

// Local dev can use any email. A production server only the demo accounts, or the ones in DEV_LOGIN_EMAILS (comma-separated).
export function devLoginEmailAllowed(email: string, env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV !== 'production') return true;
  const listed = env.DEV_LOGIN_EMAILS?.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean) ?? [];
  return (listed.length ? listed : DEMO_EMAILS).includes(email.trim().toLowerCase());
}

export function assertDevLogin(enabled: boolean) {
  if (!enabled) throw new ApiError(403, 'DEV_LOGIN_DISABLED', 'Test sign-in is switched off on this server. Continue with Google instead.');
}

export function assertDevLoginEmail(email: string) {
  if (!devLoginEmailAllowed(email)) throw new ApiError(403, 'DEV_LOGIN_RESTRICTED', 'Test sign-in on this server is only for the demo accounts. Continue with Google instead.');
}
