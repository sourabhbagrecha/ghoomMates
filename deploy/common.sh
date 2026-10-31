# shellcheck shell=bash disable=SC2034
# Settings and helpers shared by deploy/cloudrun.sh and deploy/secrets.sh. Sourced, never run.
# Bash 3.2 compatible (macOS default): no associative arrays, no ${var,,}, no mapfile.
#
# Every setting below can be overridden from the environment, e.g.  WEB_MIN_INSTANCES=0 deploy/cloudrun.sh

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"

# --- Where things live (facts about the shared Ghoomates project) -------------------------------------------------
PROJECT_ID="${PROJECT_ID:-optimal-comfort-510810-d1}"
REGION="${REGION:-asia-south1}"                      # Mumbai: the Cloud SQL instance and the bucket are here too
REPO="${REPO:-ghoomates}"                            # Artifact Registry repository (created by cloud/deploy.sh registry)
IMAGE_NAME="${IMAGE_NAME:-web}"
BUCKET="${BUCKET:-ghoomates}"
SQL_INSTANCE_NAME="${SQL_INSTANCE_NAME:-ghoomates}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-${PROJECT_ID}:${REGION}:${SQL_INSTANCE_NAME}}"
DB_USER="${DB_USER:-ghoomates}"
DB_NAME="${DB_NAME:-ghoomates}"
FACE_SEARCH_SERVICE="${FACE_SEARCH_SERVICE:-face-search}"

# --- What gets deployed -------------------------------------------------------------------------------------------
WEB_SERVICE="${WEB_SERVICE:-ghoomates}"              # the URL is https://<service>-<project number>.<region>.run.app
AGENT_SERVICE="${AGENT_SERVICE:-ghoomates-agent}"
WEB_SA_NAME="${WEB_SA_NAME:-ghoomates-web}"
AGENT_SA_NAME="${AGENT_SA_NAME:-ghoomates-agent}"
# A dedicated voice-agent name for the deployed pair, so a teammate's laptop worker (default name "ghoomate") never
# receives a jury member's session.
AGENT_NAME="${AGENT_NAME:-ghoomate-prod}"
ENV_FILE="${ENV_FILE:-$ROOT/backend/.env}"
# "allusers": anyone with the link (needed for the jury); "no-invoker-check": same, for organisations that forbid
# allUsers bindings; "none": keep it private (reach it with `gcloud run services proxy`).
PUBLIC_ACCESS="${PUBLIC_ACCESS:-allusers}"

# --- Sizing (small on purpose; see "Cost" in backend/docs/deploy.md) --------------------------------------------
WEB_CPU="${WEB_CPU:-1}"
WEB_MEMORY="${WEB_MEMORY:-1Gi}"
WEB_CONCURRENCY="${WEB_CONCURRENCY:-40}"
WEB_MIN_INSTANCES="${WEB_MIN_INSTANCES:-1}"          # 1 = no cold start during the demo; 0 = costs nothing when idle
WEB_MAX_INSTANCES="${WEB_MAX_INSTANCES:-4}"
AGENT_CPU="${AGENT_CPU:-2}"
AGENT_MEMORY="${AGENT_MEMORY:-2Gi}"
AGENT_MIN_INSTANCES="${AGENT_MIN_INSTANCES:-1}"      # the worker must stay connected to LiveKit
AGENT_MAX_INSTANCES="${AGENT_MAX_INSTANCES:-2}"

DRY_RUN="${DRY_RUN:-0}"                              # 1 = print the changes instead of making them

# Never wait on a prompt (e.g. "enable this API?"); the default answers are the safe ones.
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

# --- Output -------------------------------------------------------------------------------------------------------
if [[ -t 2 ]]; then
  C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'; C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_OFF=$'\033[0m'
else
  C_BOLD=''; C_DIM=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_OFF=''
fi
step() { printf '\n%s==> %s%s\n' "$C_BOLD" "$*" "$C_OFF" >&2; }
say()  { printf '%s\n' "$*" >&2; }
ok()   { printf '%s  ok%s %s\n' "$C_GREEN" "$C_OFF" "$*" >&2; }
warn() { printf '%s  warning:%s %s\n' "$C_YELLOW" "$C_OFF" "$*" >&2; }
die()  { printf '%serror:%s %s\n' "$C_RED" "$C_OFF" "$*" >&2; exit 1; }
# need MESSAGE: a precondition failed. Stops a real run; a dry run only notes it, so the rest of the plan still shows.
need() { if [[ "$DRY_RUN" == 1 ]]; then warn "$* (a real run would stop here)"; else die "$*"; fi; }

# Makes a change, or only prints it when DRY_RUN=1. Use it for everything that creates, updates or deploys;
# read-only gcloud calls (describe, list, versions access) are made directly.
run() {
  if [[ "$DRY_RUN" == 1 ]]; then
    printf '%s  [dry-run]%s' "$C_DIM" "$C_OFF" >&2
    printf ' %q' "$@" >&2
    printf '\n' >&2
    return 0
  fi
  "$@"
}

# retry TRIES SECONDS command...   (a new service account takes a few seconds to be visible to IAM)
retry() {
  local tries="$1" delay="$2" attempt=1
  shift 2
  until "$@"; do
    if (( attempt >= tries )); then return 1; fi
    warn "failed, trying again in ${delay}s ($attempt/$tries)"
    sleep "$delay"
    attempt=$((attempt + 1))
  done
}

preflight() {
  command -v gcloud >/dev/null 2>&1 || die "gcloud is not installed (https://cloud.google.com/sdk/docs/install)"
  local account
  account="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -n1 || true)"
  if [[ -z "$account" ]]; then
    if [[ "$DRY_RUN" == 1 ]]; then warn "no active gcloud account (fine for a dry run; run 'gcloud auth login' before the real thing)"
    else die "No active gcloud account. Run: gcloud auth login"; fi
  fi
  say "Project $PROJECT_ID, region $REGION${account:+, signed in as $account}"
  if [[ "$DRY_RUN" == 1 ]]; then say "DRY RUN: nothing will be created, changed or deployed."; fi
  return 0
}

# --- Secrets and settings -----------------------------------------------------------------------------------------
# Sensitive settings live in Secret Manager, one secret per setting, named ghoomates-<setting in kebab case>:
# JWT_SECRET -> ghoomates-jwt-secret. deploy/secrets.sh creates them; deploy/cloudrun.sh mounts them as env vars.
secret_name() { printf 'ghoomates-%s' "$(printf '%s' "$1" | tr 'A-Z_' 'a-z-')"; }

secret_exists() { gcloud secrets describe "$1" --project="$PROJECT_ID" >/dev/null 2>&1; }

# Settings that become secrets. JWT_SECRET and DB_PASSWORD are required; the others switch a feature off when missing.
# EXTRA_SECRET_KEYS="FOO BAR" adds more (a key another module needs).
SECRET_KEYS="JWT_SECRET DB_PASSWORD GOOGLE_CLIENT_SECRET GCS_CREDENTIALS_BASE64 GEMINI_API_KEY LIVEKIT_API_KEY LIVEKIT_API_SECRET GOOGLE_MAPS_API_KEY ${EXTRA_SECRET_KEYS:-}"

# Plain (non-secret) settings copied into the web service's environment when set in the environment or in ENV_FILE.
# EXTRA_ENV_KEYS="FOO BAR" adds more.
PLAIN_KEYS="GOOGLE_CLIENT_ID LIVEKIT_URL GEMINI_MODEL GEMINI_SMART_MODEL GEMINI_IMAGE_MODEL GEMINI_TTS_MODEL DB_POOL_SIZE ${EXTRA_ENV_KEYS:-}"

# env_value KEY: the value from the process environment, else the first non-empty assignment in ENV_FILE.
# The file is parsed, never sourced (values may contain $ or quotes). Quotes around the value are removed, as the
# backend does. Prints nothing when the key is unset.
env_value() {
  local key="$1" value="${!1:-}"
  if [[ -z "$value" && -f "$ENV_FILE" ]]; then
    value="$(sed -n -E "s/^[[:space:]]*${key}=(.*)$/\\1/p" "$ENV_FILE" | tr -d '\r' | sed -E "s/^[\"']//; s/[\"']\$//" | grep -v '^$' | head -n1 || true)"
  fi
  printf '%s' "$value"
}

# Template values from .env.example (replace_with_..., your_...) are not real settings.
is_placeholder() {
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    ''|replace_with*|your_*|your-*|changeme*|'<'*) return 0 ;;
    *) return 1 ;;
  esac
}
