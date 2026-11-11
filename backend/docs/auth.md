# GhoomMates OAuth Service

Authentication module of the unified GhoomMates backend (routes under `/auth/*`), handling Google OAuth 2.0 login and sign-up flows.

## Features

- **Google OAuth 2.0 Integration**:
  - Authorization code redirect flow (`/auth/google/url` & `/auth/google/callback`)
  - Google Identity Services (GIS) / One-Tap verification (`/auth/google/verify`)
- **JWT Session Tokens**: Standard HMAC-SHA256 stateless session tokens with configurable expiration
- **MongoDB Persistence**: Upserts users in the MongoDB Atlas `users` collection (unique indexes on `google_id`, lowercase `email` and `username`), with in-memory fallback for offline/local development
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

# MongoDB Atlas, shared with every other module
MONGODB_CONNECTION_STRING=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/
MONGODB_DB=ghoomates
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
| `POST` | `/auth/uploads` | Signed upload URL for a selfie or profile photo (requires `Bearer <token>`) |
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

Login creates a user with a unique `username` (the public user ID), name, verified-provider email, `picture`, and `preferences` JSON object. The internal `id` (`usr_…`, the document's `_id`) stays stable when a username changes. Users without a chosen username receive a generated one (their `id`, in the MongoDB store).

Authenticated `PATCH /auth/profile` accepts `username`, `name`, `preferences`, `selfieKey`, `pictureKey` and `picture`. Usernames normalize to lowercase without a leading `@`, use 3–64 letters, numbers, dots or underscores, and return 409 if taken. Preferences merge at the top level; nested values are replaced, and keys containing `.` or starting with `$` are dropped. `GET /auth/me` and login responses return the saved profile. Subsequent logins retain custom names, photos and preferences. Email comes from the login provider.

### Selfie and profile photo

Pictures are never stored inline. They go browser → media bucket like trip photos:

1. `POST /auth/uploads { kind: 'selfie' | 'avatar', contentType: 'image/jpeg' | 'image/png' | 'image/webp', size }` returns `{ key, upload }`, a signed `PUT` URL for `users/<userId>/selfies/<uuid>.<ext>` or `users/<userId>/avatars/<uuid>.<ext>` (at most 6 MiB).
2. The browser `PUT`s the image there (the app sends a 640 px JPEG).
3. `PATCH /auth/profile { selfieKey }` records the face-match selfie (`users.selfie_key`). It also becomes the profile photo unless `pictureKey` is sent too. `{ pictureKey }` sets another uploaded picture as the profile photo, `{ picture: '' }` removes the photo, and `{ selfieKey: null }` deletes the selfie (and the photo, when it was the selfie). The key must be this user's and the upload must exist (400 `UPLOAD_NOT_FOUND` otherwise). A `data:` picture is refused with 400 `PICTURE_UPLOAD_REQUIRED`.

`users.picture` holds a stable URL, `/api/media/<key>`, which redirects to a fresh signed read URL (the bucket is private and signed URLs expire, so a signed URL can't be stored). Responses also carry `selfie`, the selfie's URL. Replaced or deleted pictures are deleted from the bucket.

As soon as a selfie lands in the bucket, the face-indexer (Eventarc, `cloud/faces/indexer.py`) embeds its largest face into `selfie_faces`, so the first find-me search is as fast as every later one (see [trips.md](trips.md#face-matching)).

Accounts from before this change may still have a `data:` URL in `picture`. `node scripts/migrate-selfies.ts` (add `--dry-run` to preview) moves each one into the bucket as the user's selfie.

Onboarding saves the chosen username, name, selfie, photo and avatar colour. Profile settings and quiz preferences also save to the backend. Persistent storage requires `MONGODB_CONNECTION_STRING`; the in-memory development database resets on restart.
