# Ghoomates OAuth Service

Authentication module of the unified Ghoomates backend (routes under `/auth/*`), handling Google OAuth 2.0 login and sign-up flows.

## Features

- **Google OAuth 2.0 Integration**:
  - Authorization code redirect flow (`/auth/google/url` & `/auth/google/callback`)
  - Google Identity Services (GIS) / One-Tap verification (`/auth/google/verify`)
- **JWT Session Tokens**: Standard HMAC-SHA256 stateless session tokens with configurable expiration
- **MongoDB / Firestore Persistence**: Auto-indexes and upserts users in the `users` collection, with seamless in-memory fallback for offline/local development
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
JWT_SECRET=ghoomates-oauth-jwt-secret-key-32chars-min-dev-2026

# Google Cloud OAuth Credentials (from Google Cloud Console -> APIs & Services -> Credentials)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:5173/#/auth/callback

# Google Cloud Firestore / MongoDB URI
MONGODB_URI=mongodb://...
DATABASE_NAME=splitwise
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

