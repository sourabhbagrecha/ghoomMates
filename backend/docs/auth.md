# GhoomMates OAuth Service

Authentication module of the unified GhoomMates backend (routes under `/auth/*`), handling Google OAuth 2.0 login and sign-up flows.

## Features

- **Google OAuth 2.0 Integration**:
  - Authorization code redirect flow (`/auth/google/url` & `/auth/google/callback`)
  - Google Identity Services (GIS) / One-Tap verification (`/auth/google/verify`)
- **JWT Session Tokens**: Standard HMAC-SHA256 stateless session tokens with configurable expiration
- **Cloud SQL Persistence**: Upserts users in the Postgres `users` table (unique `google_id` and lowercase `email`), with in-memory fallback for offline/local development
- **Dev Mode / Test Accounts**: Instant 1-click test accounts for effortless local UI development before configuring Google Cloud credentials
- **CORS & Vite Proxy**: Out-of-the-box preflight and header support for `http://localhost:5173`

---

## Configuration (`.env`)

Copy `.env.example` to `.env`:

```env
HOST=127.0.0.1
PORT=3000
CLIENT_ORIGIN=http://localhost:5173

# Secret for signing session JWTs (minimum 32 characters)
JWT_SECRET=ghoommates-oauth-jwt-secret-key-32chars-min-dev-2026

# Google Cloud OAuth Credentials (from Google Cloud Console -> APIs & Services -> Credentials)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:5173/#/auth/callback

# Google Cloud SQL (Postgres), shared with the expense module
CLOUD_SQL_INSTANCE=optimal-comfort-510810-d1:asia-south1:ghoomates
DB_USER=ghoomates
DB_PASSWORD=...
DB_NAME=ghoomates
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` / `/auth/health` | Health check endpoint |
| `GET` | `/auth/config` | Returns Google Client ID & status (`isConfigured`) |
| `GET` | `/auth/google/url` | Generates Google OAuth 2.0 consent URL |
| `POST` | `/auth/google/verify` | Verifies Google ID credential token (GIS One-Tap) |
| `POST` | `/auth/google/callback` | Exchanges Google auth code for tokens and profile |
| `GET` | `/auth/google/callback` | Browser redirect callback from Google |
| `POST` | `/auth/dev/login` | Local development mock sign-in |
| `GET` | `/auth/me` | Returns current user profile (requires `Bearer <token>`) |
| `POST` | `/auth/logout` | Logs out current session |

---

## Running Locally

```bash
# From repository root
npm run dev:backend

# Or directly in backend/
npm install
npm run dev
```

To run unit tests:
```bash
npm run test:auth
```


### Persisted user profiles

Login creates a user with a unique `username` (the public user ID), name, verified-provider email, `picture`, and `preferences` JSON object. The internal `id` stays stable when a username changes. Users without a chosen username receive a generated one. Existing accounts are backfilled by migration `002_user_profiles.sql`, applied automatically at backend startup.

Authenticated `PATCH /auth/profile` accepts `username`, `name`, `picture`, and `preferences`. Usernames normalize to lowercase without a leading `@`, use 3–64 letters, numbers, dots or underscores, and return 409 if taken. Preferences merge at the top level; nested values are replaced. `GET /auth/me` and login responses return the saved profile. Subsequent logins retain custom names, photos and preferences. Email comes from the login provider.

Onboarding saves the chosen username, name, photo and avatar colour. Profile settings and quiz preferences also save to the backend. Photos are stored in the existing picture column as compressed data URLs. Persistent storage requires DATABASE_URL or the Cloud SQL environment configuration; the in-memory development database resets on restart.
