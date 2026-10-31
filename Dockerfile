# Ghoomates on Cloud Run: the API server and the built web app in one image.
#   web service    node backend/src/index.ts              (the default command)
#   voice worker   node backend/src/voice/agent.ts start  (a second Cloud Run service, same image)
# Build and deploy with deploy/cloudrun.sh; backend/docs/deploy.md has the whole story.

# ---- 1. Web app: Vite build ------------------------------------------------------------------------------
FROM node:24-slim AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build
# Pre-compress the text assets: the server sends <file>.gz to browsers that accept gzip
# (the main bundle is 1.4 MB, about 370 KB gzipped, which is what a phone on venue Wi-Fi downloads first).
RUN find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.svg' -o -name '*.json' \) -size +1k -exec gzip -9 -k {} +

# ---- 2. Server: production dependencies only -------------------------------------------------------------
FROM node:24-slim AS server-deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---- 3. Runtime ----------------------------------------------------------------------------------------------
FROM node:24-slim
# NODE_ENV=production: JWT_SECRET is mandatory, the mock sign-in is off, localhost CORS origins are refused.
# Cloud Run sets PORT; HOST must be 0.0.0.0 or its health check cannot reach the server.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    SERVE_FRONTEND_DIR=/app/frontend/dist
WORKDIR /app
# Node runs the .ts sources directly (type stripping), so there is no server build. Type stripping is off for
# anything under node_modules, so the sources sit in /app/backend/src.
COPY --from=server-deps --chown=node:node /app/backend/node_modules backend/node_modules
COPY --chown=node:node backend/package.json backend/
COPY --chown=node:node backend/src backend/src
COPY --chown=node:node backend/migrations backend/migrations
COPY --from=web --chown=node:node /app/frontend/dist frontend/dist
# Local-disk fallback for uploads when GCS is not configured (not durable on Cloud Run)
RUN mkdir -p backend/uploads && chown node:node backend/uploads
USER node
EXPOSE 8080
CMD ["node", "backend/src/index.ts"]
