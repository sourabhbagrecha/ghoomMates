#!/usr/bin/env bash
# Redeploy the current code to the Ghoommates VM (https://ghoommates.sourabh.org).
#
#   deploy/vm.sh            build the web app locally, ship backend + dist, npm ci, restart
#   deploy/vm.sh --env      also replace the server's backend/.env with backend/.env plus the production overrides
#
# The VM: GCE "ghoommates" (e2-small, asia-south1-b, static IP ghoomates-ip). Node 24 runs
# /opt/ghoommates/app/backend/src/index.ts as the systemd unit "ghoommates" on 127.0.0.1:8080; Caddy terminates TLS for
# ghoommates.sourabh.org (Cloudflare A record, DNS only) and proxies to it. Logs: deploy/vm.sh logs
set -euo pipefail

VM="${VM:-ghoommates}"
ZONE="${ZONE:-asia-south1-b}"
PUBLIC_URL="${PUBLIC_URL:-https://ghoommates.sourabh.org}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ssh_vm() { gcloud compute ssh "$VM" --zone "$ZONE" --quiet --command "$1"; }

if [[ "${1:-}" == logs ]]; then
  ssh_vm 'sudo journalctl -u ghoommates --no-pager -n 100'
  exit 0
fi

echo "==> Build the web app"
(cd "$ROOT/frontend" && npm run build)
find "$ROOT/frontend/dist" -type f \( -name '*.js' -o -name '*.css' -o -name '*.svg' -o -name '*.json' \) -size +1k -exec gzip -9 -kf {} +

echo "==> Package and copy"
(cd "$ROOT" && COPYFILE_DISABLE=1 tar czf "$TMP/app.tgz" backend/package.json backend/package-lock.json backend/src backend/migrations frontend/dist)
files=("$TMP/app.tgz")
if [[ "${1:-}" == --env ]]; then
  (
    umask 077
    grep -v -E '^(HOST|PORT|CLIENT_ORIGIN|GOOGLE_REDIRECT_URI|JWT_SECRET|NODE_ENV|SERVE_FRONTEND_DIR|GHOOMATE_AGENT_NAME)=' "$ROOT/backend/.env" > "$TMP/prod.env"
    cat >> "$TMP/prod.env" <<EOF
HOST=127.0.0.1
PORT=8080
NODE_ENV=production
CLIENT_ORIGIN=$PUBLIC_URL
GOOGLE_REDIRECT_URI=$PUBLIC_URL/auth/callback
SERVE_FRONTEND_DIR=/opt/ghoommates/app/frontend/dist
GHOOMATE_AGENT_NAME=ghoomate-prod
EOF
  )
  files+=("$TMP/prod.env")
fi
gcloud compute scp --zone "$ZONE" --quiet "${files[@]}" "$VM:/tmp/"

echo "==> Install and restart"
ssh_vm 'set -e
cd /opt/ghoommates/app
sudo rm -rf backend/src backend/migrations frontend/dist
sudo tar xzf /tmp/app.tgz && rm /tmp/app.tgz
if [ -f /tmp/prod.env ]; then
  # Keep the generated JWT secret so existing sessions stay valid
  sudo grep "^JWT_SECRET=" backend/.env >> /tmp/prod.env || echo "JWT_SECRET=$(openssl rand -hex 32)" >> /tmp/prod.env
  sudo install -m 600 -o ghoommates -g ghoommates /tmp/prod.env backend/.env && rm /tmp/prod.env
fi
sudo chown -R ghoommates:ghoommates /opt/ghoommates/app
cd backend && sudo -u ghoommates npm ci --omit=dev --no-audit --no-fund --loglevel=error
sudo systemctl restart ghoommates'

echo "==> Check $PUBLIC_URL"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "$PUBLIC_URL/health" >/dev/null 2>&1; then echo "  ok $PUBLIC_URL"; exit 0; fi
  sleep 3
done
echo "  no answer from $PUBLIC_URL/health; logs: deploy/vm.sh logs" >&2
exit 1
