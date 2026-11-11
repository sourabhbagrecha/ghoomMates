# GhoomMates

Group travel app. Members join a trip group, share photos (filter to photos they appear in), generate reels/stories, split expenses, and get an itinerary built from every member's preferences.

**Hackathon project:** demoable, end-to-end vision beats production hardening. Prefer the simplest working path; mock or stub anything slow to build rather than leaving a feature missing.

## Layout

- `frontend/`: React 19 + TS + Vite SPA (hash routing, `src/pages/*`). Design rules and tokens: `frontend/DESIGN_GUIDELINES.md`, so read it before UI work and use tokens from `src/styles/tokens.css`, never raw values.
- `backend/`: one Node.js + TS + Express server (runs `.ts` directly, no build); modules in `src/<module>/` (`auth`, `expenses`, ...), routed by path prefix in `src/app.ts`. MongoDB Atlas (official `mongodb` driver); collections and indexes are declared in `src/schema.ts` and created on startup. Per-module docs in `backend/docs/`.
- `cloud/`: Python Cloud Run functions, event-driven (Eventarc on GCS uploads). Async work: face detection, face embeddings, Atlas Vector Search updates, reel/story rendering.

## Stack decisions

- GCP for compute and media: Cloud Run, GCS for media, Google OAuth. Database: MongoDB Atlas (`MONGODB_CONNECTION_STRING`).
- Vectors: Atlas Vector Search in the same Atlas database (no separate vector store).
- AI: Gemini / Vertex AI for itinerary, reel/story generation, and vision/embeddings.
- Backend + frontend: Node.js 22.18+, npm for packages, `node:test` for backend tests. No Bun.

## Commands

All from repo root:

```bash
npm install          # installs root, backend/, frontend/
npm run dev          # backend + frontend together; Vite proxies /auth and /api to backend
npm test             # backend tests
npm run typecheck    # backend
npm run lint && npm run build   # frontend
```

**Dev servers are user-owned.** The user runs `npm run dev` in their own terminal so they can see the logs. Claude never starts, restarts or kills the backend/frontend dev servers (no background `npm run dev`, `vite`, `node --watch`, no `pkill`). If a change needs a server, ask the user to start or restart it and paste the relevant logs.

## Conventions

- New backend feature = new `src/<module>/` folder + its collections/indexes in `src/schema.ts` + route prefix in `src/app.ts` + short doc in `backend/docs/`.
- Multi-document writes go through `transaction()` in `src/db.ts`; there are no foreign keys, so deletes cascade in code. Tests use a real in-process MongoDB via `tests/mongo.ts`.
- Uploads go client → GCS → cloud function → DB. The backend never does heavy media processing inline.
- Secrets live only in `.env` files (gitignored); add new keys to `backend/.env.example`.
- gcloud cli is already authenticated
- Cloudflare (DNS for sourabh.org, the `deploy/worker` proxy): use the `cf` CLI, already authenticated. Not wrangler.
