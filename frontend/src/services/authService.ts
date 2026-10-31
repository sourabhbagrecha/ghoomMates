export interface AuthUser {
  id: string;
  googleId?: string;
  email: string;
  emailVerified?: boolean;
  name: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
  createdAt?: string;
}

export interface AuthConfig {
  googleClientId: string | null;
  isConfigured: boolean;
  redirectUri: string;
  clientOrigin: string;
  devModeEnabled: boolean;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
  isNewUser: boolean;
}

const TOKEN_KEY = 'ghoomates:token';
const USER_KEY = 'ghoomates:user';
const ONBOARDED_KEY = 'ghoomates:onboarded';
const NAME_KEY = 'ghoomates:name';

type AuthListener = (user: AuthUser | null) => void;
const listeners = new Set<AuthListener>();

export function subscribeAuth(listener: AuthListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyAuth(user: AuthUser | null) {
  for (const listener of listeners) {
    try {
      listener(user);
    } catch (e) {
      console.error('Error in auth listener:', e);
    }
  }
}

export function decodeJwtPayload(token: string): Partial<AuthUser> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonStr);
    return {
      id: payload.userId,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) return JSON.parse(raw);

    // If not yet in storage, check if there is an active token in the URL hash or query
    if (typeof window !== 'undefined') {
      const hashQuery = window.location.hash.split('?')[1] || '';
      const search = window.location.search.replace(/^\?/, '') || '';
      const params = new URLSearchParams(search || hashQuery);
      const token = params.get('token');
      if (token) {
        const decoded = decodeJwtPayload(token);
        if (decoded && decoded.id && decoded.email) {
          const u: AuthUser = {
            id: decoded.id,
            email: decoded.email,
            name: decoded.name || decoded.email.split('@')[0],
            picture: decoded.picture,
          };
          saveAuthSession(token, u, false);
          return u;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function saveAuthSession(token: string, user: AuthUser, markCompleted = false): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    if (user.name) {
      localStorage.setItem(NAME_KEY, user.name);
    }
    if (markCompleted) {
      localStorage.setItem(ONBOARDED_KEY, '1');
    }
    notifyAuth(user);
  } catch (err) {
    console.error('Failed to save auth session:', err);
  }
}

export function clearAuthSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(ONBOARDED_KEY);
    notifyAuth(null);
  } catch (err) {
    console.error('Failed to clear auth session:', err);
  }
}

export async function fetchAuthConfig(): Promise<AuthConfig> {
  const res = await fetch('/auth/config');
  if (!res.ok) throw new Error('Failed to fetch auth configuration');
  return (await res.json()) as AuthConfig;
}

export async function fetchGoogleAuthUrl(): Promise<string> {
  const res = await fetch('/auth/google/url');
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Failed to get Google auth URL' } }));
    throw new Error(err.error?.message || 'Failed to get Google auth URL');
  }
  const data = await res.json();
  return data.url;
}

export async function loginWithGoogleCredential(credential: string): Promise<AuthResponse> {
  const res = await fetch('/auth/google/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Google verification failed' } }));
    throw new Error(err.error?.message || 'Google verification failed');
  }
  const data = (await res.json()) as AuthResponse;
  saveAuthSession(data.token, data.user, !data.isNewUser);
  return data;
}

export async function loginWithGoogleCode(code: string, redirectUri?: string): Promise<AuthResponse> {
  const res = await fetch('/auth/google/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirectUri }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Google code exchange failed' } }));
    throw new Error(err.error?.message || 'Google code exchange failed');
  }
  const data = (await res.json()) as AuthResponse;
  saveAuthSession(data.token, data.user, !data.isNewUser);
  return data;
}

export async function loginWithDevMock(mock?: { email?: string; name?: string; picture?: string }): Promise<AuthResponse> {
  const res = await fetch('/auth/dev/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mock || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Dev login failed' } }));
    throw new Error(err.error?.message || 'Dev login failed');
  }
  const data = (await res.json()) as AuthResponse;
  saveAuthSession(data.token, data.user, false);
  return data;
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 401) {
        clearAuthSession();
      }
      return null;
    }
    const data = await res.json();
    saveAuthSession(token, data.user);
    return data.user;
  } catch (err) {
    console.warn('Could not verify current user session:', err);
    return getStoredUser();
  }
}

export async function updateUserProfile(patch: { picture?: string; name?: string }): Promise<AuthUser | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch('/auth/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        saveAuthSession(token, data.user);
        return data.user;
      }
    }
  } catch (err) {
    console.warn('Failed to update remote profile:', err);
  }

  const user = getStoredUser();
  if (user) {
    const updated = { ...user, ...patch };
    saveAuthSession(token, updated);
    return updated;
  }
  return null;
}

export async function logoutUser(): Promise<void> {
  try {
    const token = getToken();
    if (token) {
      await fetch('/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  } finally {
    clearAuthSession();
  }
}

