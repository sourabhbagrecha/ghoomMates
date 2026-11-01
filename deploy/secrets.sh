#!/usr/bin/env bash
# Puts the sensitive settings from your local backend/.env into Google Secret Manager, where deploy/cloudrun.sh
# picks them up. Values travel to Secret Manager over stdin; they are never printed, logged or put on a command line.
#
#   deploy/secrets.sh            create the secrets, or add a new version when a value changed
#   deploy/secrets.sh --check    list which secrets exist (names only) and which settings are set locally
#
# One secret per setting, named ghoommates-<setting in kebab case> (JWT_SECRET -> ghoommates-jwt-secret):
#   JWT_SECRET             a fresh random value, never the one in backend/.env (that is the dev secret, and the
#                          dev default is public in this repo, so anyone could forge sessions with it)
#   DB_PASSWORD, GOOGLE_CLIENT_SECRET, GCS_CREDENTIALS_BASE64, GEMINI_API_KEY, LIVEKIT_API_KEY, LIVEKIT_API_SECRET,
#   GOOGLE_MAPS_API_KEY    copied from the environment or from backend/.env (an exported variable wins)
# A setting that is missing (or still a placeholder from .env.example) is skipped. Safe to run again: unchanged
# values add no new version, and an existing JWT secret is kept so sessions survive.
#
# Environment: ENV_FILE (default backend/.env), PROJECT_ID, DRY_RUN=1 (show what would happen),
#   ROTATE_JWT_SECRET=1 (replace the JWT secret; everyone is signed out), PRODUCTION_JWT_SECRET=... (use this value
#   instead of generating one), EXTRA_SECRET_KEYS="FOO BAR" (more settings to copy, for keys other modules add).
set -euo pipefail
# shellcheck source=common.sh
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

MODE=apply
case "${1:-}" in
  ''|apply) ;;
  --check|check) MODE=check ;;
  -h|--help|help) sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) die "Unknown option: $1 (see --help)" ;;
esac

preflight

if [[ ! -f "$ENV_FILE" ]]; then
  warn "$ENV_FILE not found; only exported environment variables are used (set ENV_FILE=... to use another file)"
fi

# --- check: names and presence only --------------------------------------------------------------------------------
if [[ "$MODE" == check ]]; then
  step "Secrets in $PROJECT_ID (no values are read or shown)"
  printf '  %-26s %-40s %-14s %s\n' SETTING SECRET "IN SECRET MGR" "SET LOCALLY" >&2
  for key in $SECRET_KEYS; do
    name="$(secret_name "$key")"
    if secret_exists "$name"; then there=yes; else there=no; fi
    if [[ "$key" == JWT_SECRET ]]; then here="n/a (generated)"
    elif is_placeholder "$(env_value "$key")"; then here=no
    else here=yes; fi
    printf '  %-26s %-40s %-14s %s\n' "$key" "$name" "$there" "$here" >&2
  done
  exit 0
fi

# --- apply -----------------------------------------------------------------------------------------------------------
step "Secret Manager API"
run gcloud services enable secretmanager.googleapis.com --project="$PROJECT_ID"

# store NAME VALUE: creates the secret, or adds a version when the value changed. Prints created|updated|unchanged.
store() {
  local name="$1" value="$2" out current
  if [[ "$DRY_RUN" == 1 ]]; then
    echo "would store"
    return 0
  fi
  if secret_exists "$name"; then
    current="$(gcloud secrets versions access latest --secret="$name" --project="$PROJECT_ID" 2>/dev/null || true)"
    if [[ "$current" == "$value" ]]; then
      echo unchanged
      return 0
    fi
    out="$(printf '%s' "$value" | gcloud secrets versions add "$name" --project="$PROJECT_ID" --data-file=- 2>&1)" \
      || { printf '%s\n' "$out" >&2; die "could not add a version to $name"; }
    echo updated
  else
    out="$(printf '%s' "$value" | gcloud secrets create "$name" --project="$PROJECT_ID" --replication-policy=automatic --data-file=- 2>&1)" \
      || { printf '%s\n' "$out" >&2; die "could not create $name"; }
    echo created
  fi
}

report() { printf '  %-36s %-12s %s\n' "$1" "$2" "$3" >&2; }

step "Secrets in project $PROJECT_ID"
for key in $SECRET_KEYS; do
  name="$(secret_name "$key")"

  if [[ "$key" == JWT_SECRET ]]; then
    value="${PRODUCTION_JWT_SECRET:-}"
    how="from PRODUCTION_JWT_SECRET"
    if [[ -z "$value" ]]; then
      if [[ "${ROTATE_JWT_SECRET:-0}" != 1 ]] && [[ "$DRY_RUN" != 1 ]] && secret_exists "$name"; then
        report "$name" kept "existing value (ROTATE_JWT_SECRET=1 replaces it and signs everyone out)"
        continue
      fi
      command -v openssl >/dev/null 2>&1 || die "openssl is needed to generate a JWT secret (or export PRODUCTION_JWT_SECRET=...)"
      value="$(openssl rand -hex 32)"
      how="generated, 64 hex characters"
    fi
    (( ${#value} >= 32 )) || die "PRODUCTION_JWT_SECRET must be at least 32 characters"
    if [[ "$value" == "$(env_value JWT_SECRET)" || "$value" == ghoommates-oauth-jwt-secret-key-32chars-min-dev-2026 ]]; then
      die "PRODUCTION_JWT_SECRET is the dev JWT secret from backend/.env or the repo. Production needs its own: leave it unset to generate one."
    fi
    # store runs in a subshell, so its failure is checked here rather than inside report's arguments
    outcome="$(store "$name" "$value")" || exit 1
    report "$name" "$outcome" "$how"
    continue
  fi

  value="$(env_value "$key")"
  if is_placeholder "$value"; then
    report "$name" skipped "$key is not set in $ENV_FILE or the environment"
    continue
  fi
  outcome="$(store "$name" "$value")" || exit 1
  report "$name" "$outcome" "from $key"
done

if [[ "$DRY_RUN" != 1 ]] && ! secret_exists "$(secret_name DB_PASSWORD)"; then
  say ""
  warn "DB_PASSWORD has no secret yet, and deploy/cloudrun.sh needs it. Put the Cloud SQL password of user $DB_USER in $ENV_FILE"
  warn "(DB_PASSWORD=...) or export it, then run this again."
fi

say ""
say "Next: deploy/cloudrun.sh   (it lets the Cloud Run service accounts read these secrets)"
say "Check later with: deploy/secrets.sh --check"
