#!/usr/bin/env bash
# Deploys GhoomMates to Google Cloud Run: builds the image with Cloud Build (CI builds it on the GitHub runner instead)
# and deploys the web service (the API, the web app and, by default, the GhoomMate voice worker in one, scaling to zero
# when idle). Safe to run again: each step creates what is missing and updates the rest, and every run deploys a new
# revision of the current code.
#
#   deploy/secrets.sh              first, and whenever a secret changes: backend/.env -> Secret Manager
#   deploy/cloudrun.sh             set up, build the image, deploy the web service, make it public, print the URL
#   deploy/cloudrun.sh agent       only with VOICE_IN_WEB=0: the voice worker as its own always-on service (1 instance minimum)
#   deploy/cloudrun.sh all         the web service, and the separate voice agent when VOICE_IN_WEB=0
#   deploy/cloudrun.sh setup       only the APIs, service accounts and permissions
#   deploy/cloudrun.sh build       only build and push the image
#   deploy/cloudrun.sh release     build, then roll the image out to the web service with its settings unchanged (CI)
#   deploy/cloudrun.sh image       print the image a build would push, then its :latest tag (CI pushes these itself)
#   deploy/cloudrun.sh status      URLs, revisions and a health check
#   deploy/cloudrun.sh pause       scale both services down to zero instances (stops most of the Cloud Run cost)
#   deploy/cloudrun.sh resume      back to the usual minimum instances
#
# Look before you leap, nothing is created, changed or deployed:   DRY_RUN=1 deploy/cloudrun.sh all
#
# Settings are environment variables; the defaults are in deploy/common.sh. The ones you may want:
#   PROJECT_ID, REGION, WEB_SERVICE, AGENT_SERVICE, ENV_FILE (default backend/.env)
#   PUBLIC_URL=https://app.example.com   the address people use (default ghoommates.sourabh.org; empty for run.app)
#   PUBLIC_ACCESS=allusers|no-invoker-check|none   who may open the web service (default allusers)
#   ALLOW_DEV_LOGIN=true                 turn on the mock sign-in (read "Sign-in" in backend/docs/deploy.md first)
#   AGENT_NAME=ghoomate-prod             the voice agent's name on LiveKit, for the web service and the worker
#   WEB_MIN_INSTANCES (0), WEB_MAX_INSTANCES (4), VOICE_IN_WEB (1), AGENT_CPU (2), AGENT_MIN_INSTANCES (1) ...
#   SKIP_SETUP=1  skip the APIs/accounts/permissions step on re-deploys
#   SKIP_BUILD=1  deploy IMAGE (default: the :latest image) instead of building one; release too (CI built and pushed it)
#   EXTRA_ENV_KEYS="FOO BAR" / EXTRA_SECRET_KEYS="BAZ"   settings added by other modules, copied like the built-in ones
set -euo pipefail
# shellcheck source=common.sh
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

TMP_LIST=""
cleanup() {
  local file
  for file in $TMP_LIST; do rm -f "$file"; done
}
trap cleanup EXIT

web_sa() { printf '%s@%s.iam.gserviceaccount.com' "$WEB_SA_NAME" "$PROJECT_ID"; }
agent_sa() { printf '%s@%s.iam.gserviceaccount.com' "$AGENT_SA_NAME" "$PROJECT_ID"; }

IMAGE_BASE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$IMAGE_NAME"
IMAGE_LATEST="$IMAGE_BASE:latest"

# --- Helpers ------------------------------------------------------------------------------------------------------
# quietly COMMAND...: runs it (or prints it in a dry run) and shows its output only when it fails.
quietly() {
  if [[ "$DRY_RUN" == 1 ]]; then
    run "$@"
    return 0
  fi
  local out
  out="$("$@" 2>&1)" || { printf '%s\n' "$out" >&2; return 1; }
}

# The git commit, with a timestamp when tracked files have uncommitted changes, so every build has its own tag.
# Untracked files are ignored: in CI the sign-in step leaves its credentials file in the checkout.
image_tag() {
  local sha
  sha="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || true)"
  if [[ -z "$sha" ]]; then date +%Y%m%d-%H%M%S; return; fi
  if [[ -n "$(git -C "$ROOT" status --porcelain --untracked-files=no 2>/dev/null || true)" ]]; then
    printf '%s-dirty-%s' "$sha" "$(date +%H%M%S)"
  else
    printf '%s' "$sha"
  fi
}

choose_image() {
  if [[ -n "${IMAGE:-}" ]]; then return; fi
  if [[ "${SKIP_BUILD:-0}" == 1 ]]; then IMAGE="$IMAGE_LATEST"; else IMAGE="$IMAGE_BASE:$(image_tag)"; fi
}

# The service URL is known before the first deploy: https://<service>-<project number>.<region>.run.app
resolve_public_url() {
  PUBLIC_URL_GIVEN=0
  if [[ -n "${PUBLIC_URL:-}" ]]; then
    PUBLIC_URL="${PUBLIC_URL%/}"
    PUBLIC_URL_GIVEN=1
    return
  fi
  local number
  number="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)' 2>/dev/null || true)"
  if [[ -z "$number" ]]; then
    if [[ "$DRY_RUN" == 1 ]]; then number="<project-number>"; else die "Could not read the project number of $PROJECT_ID (is gcloud signed in?)"; fi
  fi
  PUBLIC_URL="https://${WEB_SERVICE}-${number}.${REGION}.run.app"
}

# env_open starts a private temp file in the format of `gcloud run deploy --env-vars-file`; env_add appends KEY: 'value'
ENV_TMP=""
env_open() {
  ENV_TMP="$(mktemp)"
  chmod 600 "$ENV_TMP"
  TMP_LIST="$TMP_LIST $ENV_TMP"
}
env_add() {
  [[ -n "$2" ]] || return 0
  local quote="'" doubled="''" value="$2"
  printf "%s: '%s'\n" "$1" "${value//$quote/$doubled}" >> "$ENV_TMP"
}
env_or() { # KEY DEFAULT: the setting from the environment or ENV_FILE, else the default
  local value
  value="$(env_value "$1")"
  if is_placeholder "$value"; then printf '%s' "$2"; else printf '%s' "$value"; fi
}

# The URL of the private face-search service. A localhost value from a dev .env is no use on Cloud Run.
face_search_url() {
  local url
  url="$(env_value FACE_SEARCH_URL)"
  case "$url" in
    https://*) printf '%s' "$url"; return 0 ;;
  esac
  gcloud run services describe "$FACE_SEARCH_SERVICE" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)' 2>/dev/null || true
}

# collect_secrets KEY:required|optional ...  ->  SECRET_PAIRS (for --set-secrets), SECRET_NAMES, SECRET_FOUND (keys)
collect_secrets() {
  SECRET_PAIRS=""; SECRET_NAMES=""; SECRET_FOUND=""
  local item key level name missing=""
  for item in "$@"; do
    key="${item%%:*}"
    level="${item##*:}"
    name="$(secret_name "$key")"
    if secret_exists "$name"; then
      :
    elif [[ "$DRY_RUN" == 1 ]]; then
      warn "secret $name does not exist yet (deploy/secrets.sh creates it); assuming it will for this dry run"
    elif [[ "$level" == required ]]; then
      missing="$missing $key"
      continue
    else
      warn "optional secret $name ($key) not found; deploying without it"
      continue
    fi
    SECRET_PAIRS="${SECRET_PAIRS:+$SECRET_PAIRS,}$key=$name:latest"
    SECRET_NAMES="${SECRET_NAMES:+$SECRET_NAMES }$name"
    SECRET_FOUND="$SECRET_FOUND $key "
  done
  if [[ -n "$missing" ]]; then die "Missing required secret(s):$missing. Run deploy/secrets.sh first."; fi
  return 0
}
have_secret() { case "$SECRET_FOUND" in *" $1 "*) return 0 ;; *) return 1 ;; esac; }

# The web service gets every secret in SECRET_KEYS; only the JWT secret and the database password are required.
web_secret_spec() {
  local key
  for key in $SECRET_KEYS; do
    case "$key" in
      JWT_SECRET|DB_PASSWORD) printf '%s:required ' "$key" ;;
      *) printf '%s:optional ' "$key" ;;
    esac
  done
}

grant_secret_access() { # SERVICE_ACCOUNT SECRET_NAME...
  local account="$1" name
  shift
  for name in "$@"; do
    retry 5 6 quietly gcloud secrets add-iam-policy-binding "$name" --project="$PROJECT_ID" \
      --member="serviceAccount:$account" --role=roles/secretmanager.secretAccessor --format=none
    ok "$name readable by $account"
  done
}

# --- Setup: APIs, registry, service accounts, permissions -----------------------------------------------------------
ensure_service_account() { # NAME DISPLAY_NAME
  local email="$1@$PROJECT_ID.iam.gserviceaccount.com"
  if gcloud iam service-accounts describe "$email" --project="$PROJECT_ID" >/dev/null 2>&1; then
    ok "$email exists"
  else
    run gcloud iam service-accounts create "$1" --project="$PROJECT_ID" --display-name="$2"
  fi
}

grant_project_role() { # SERVICE_ACCOUNT ROLE
  retry 5 6 quietly gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$1" --role="$2" --condition=None --format=none
  ok "$2"
}

setup() {
  step "Google Cloud APIs"
  run gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
    secretmanager.googleapis.com sqladmin.googleapis.com aiplatform.googleapis.com storage.googleapis.com \
    --project="$PROJECT_ID"

  step "Artifact Registry repository $REPO"
  if gcloud artifacts repositories describe "$REPO" --project="$PROJECT_ID" --location="$REGION" >/dev/null 2>&1; then
    ok "exists"
  else
    run gcloud artifacts repositories create "$REPO" --project="$PROJECT_ID" --location="$REGION" \
      --repository-format=docker --description="GhoomMates container images"
  fi

  step "Service accounts"
  ensure_service_account "$WEB_SA_NAME" "GhoomMates web (Cloud Run runtime)"
  ensure_service_account "$AGENT_SA_NAME" "GhoomMates voice agent (Cloud Run runtime)"

  step "What the web service may do ($(web_sa))"
  grant_project_role "$(web_sa)" roles/cloudsql.client        # the Cloud SQL connector (CLOUD_SQL_INSTANCE)
  grant_project_role "$(web_sa)" roles/aiplatform.user        # Vertex AI: images, and Gemini without an API key
  retry 5 6 quietly gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
    --member="serviceAccount:$(web_sa)" --role=roles/storage.objectAdmin
  ok "roles/storage.objectAdmin on gs://$BUCKET"
  # Secret access is granted per secret, when the service is deployed. The voice agent worker needs no project roles.
}

# --- Build ------------------------------------------------------------------------------------------------------
build() {
  step "Build the image with Cloud Build"
  say "  $IMAGE"
  # Naming the (default) source bucket skips gcloud's check that lists every bucket in the project, which the CI
  # account may not do: it can only use this one bucket (deploy/github-ci.sh).
  run gcloud builds submit "$ROOT" --project="$PROJECT_ID" --region="$REGION" \
    --gcs-source-staging-dir="gs://${PROJECT_ID}_cloudbuild/source" \
    --config="$DEPLOY_DIR/cloudbuild.yaml" --substitutions="_IMAGE=$IMAGE,_LATEST=$IMAGE_LATEST"
}

# --- Web service --------------------------------------------------------------------------------------------------
curl_url() { # URL: GET it; a private service needs an identity token
  if [[ "$PUBLIC_ACCESS" == none || "${NOT_PUBLIC:-0}" == 1 ]]; then
    curl -fsS --max-time 20 -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$1"
  else
    curl -fsS --max-time 20 "$1"
  fi
}

make_public() {
  step "Who may open it (PUBLIC_ACCESS=$PUBLIC_ACCESS)"
  case "$PUBLIC_ACCESS" in
    allusers)
      if quietly gcloud run services add-iam-policy-binding "$WEB_SERVICE" --project="$PROJECT_ID" --region="$REGION" \
        --member=allUsers --role=roles/run.invoker --format=none; then
        ok "anyone with the link can open it"
      else
        NOT_PUBLIC=1
        warn "Google Cloud refused to make the service public. If an organisation policy blocks allUsers"
        warn "(iam.allowedPolicyMemberDomains, \"domain restricted sharing\"), either ask an org admin to allow it for this"
        warn "project, or run:  PUBLIC_ACCESS=no-invoker-check deploy/cloudrun.sh   (turns off Cloud Run's IAM check instead)."
      fi ;;
    no-invoker-check)
      run gcloud run services update "$WEB_SERVICE" --project="$PROJECT_ID" --region="$REGION" --no-invoker-iam-check
      ok "Cloud Run's invoker IAM check is off: anyone with the link can open it" ;;
    none)
      say "  left private; open it with: gcloud run services proxy $WEB_SERVICE --project=$PROJECT_ID --region=$REGION" ;;
    *) die "PUBLIC_ACCESS must be allusers, no-invoker-check or none (got: $PUBLIC_ACCESS)" ;;
  esac
}

# If the real address is not the one we predicted (it should be), point the app at the real one.
confirm_url() {
  if [[ "$DRY_RUN" == 1 || "$PUBLIC_URL_GIVEN" == 1 ]]; then return 0; fi
  local urls actual
  urls="$(gcloud run services describe "$WEB_SERVICE" --project="$PROJECT_ID" --region="$REGION" \
    --format='value(metadata.annotations."run.googleapis.com/urls")' 2>/dev/null || true)"
  case "$urls" in
    *"$PUBLIC_URL"*) return 0 ;;
  esac
  actual="$(gcloud run services describe "$WEB_SERVICE" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')"
  warn "The service answers at $actual, not at $PUBLIC_URL; pointing CLIENT_ORIGIN and GOOGLE_REDIRECT_URI at it"
  run gcloud run services update "$WEB_SERVICE" --project="$PROJECT_ID" --region="$REGION" \
    --update-env-vars="CLIENT_ORIGIN=$actual,GOOGLE_REDIRECT_URI=$actual/auth/callback"
  PUBLIC_URL="$actual"
}

verify_web() {
  step "Check $PUBLIC_URL"
  if [[ "$DRY_RUN" == 1 ]]; then say "  (skipped in a dry run)"; return 0; fi
  local attempt body="" page=""
  for attempt in 1 2 3 4 5 6; do
    body="$(curl_url "$PUBLIC_URL/health" 2>/dev/null || true)"
    if [[ -n "$body" ]]; then break; fi
    say "  waiting for the service to answer ($attempt/6)..."
    sleep 5
  done
  case "$body" in
    *'"trips":"enabled"'*) ok "the API answers and the database is connected" ;;
    '') VERIFY_FAILED=1; warn "no answer from $PUBLIC_URL/health. Is it public? Logs: gcloud run services logs read $WEB_SERVICE --region=$REGION --project=$PROJECT_ID --limit=50" ;;
    *) VERIFY_FAILED=1; warn "the API answers but trips are disabled, so the database connection failed. Logs: gcloud run services logs read $WEB_SERVICE --region=$REGION --project=$PROJECT_ID --limit=50" ;;
  esac
  page="$(curl_url "$PUBLIC_URL/" 2>/dev/null || true)"
  case "$page" in
    *'id="root"'*) ok "the web app is served at /" ;;
    *) VERIFY_FAILED=1; warn "$PUBLIC_URL/ did not return the web app" ;;
  esac
}

deploy_web() {
  step "Web service $WEB_SERVICE"
  resolve_public_url
  say "  address: $PUBLIC_URL"
  # shellcheck disable=SC2046
  collect_secrets $(web_secret_spec)
  if [[ "${ALLOW_DEV_LOGIN:-}" != true ]]; then
    if ! have_secret GOOGLE_CLIENT_SECRET; then
      need "There is no way to sign in: GOOGLE_CLIENT_SECRET is not in Secret Manager and ALLOW_DEV_LOGIN is not true. Run deploy/secrets.sh."
    fi
    if is_placeholder "$(env_value GOOGLE_CLIENT_ID)"; then
      need "There is no way to sign in: GOOGLE_CLIENT_ID is not set in $ENV_FILE or the environment, and ALLOW_DEV_LOGIN is not true."
    fi
  fi
  if ! have_secret GCS_CREDENTIALS_BASE64; then
    warn "GCS_CREDENTIALS_BASE64 is missing: photos would be written to the container's temporary disk and vanish."
  fi
  if [[ "${ALLOW_DEV_LOGIN:-}" == true ]]; then
    warn "ALLOW_DEV_LOGIN=true: anyone with the link can sign in as the demo accounts (Aditi Sharma, Kabir Mehta; or DEV_LOGIN_EMAILS) without Google."
    warn "Real users stay out of reach, but whatever those accounts can see, the jury and the internet can. Redeploy without it after the demo."
  fi
  # shellcheck disable=SC2086
  grant_secret_access "$(web_sa)" $SECRET_NAMES

  env_open
  env_add CLIENT_ORIGIN "$PUBLIC_URL"
  env_add GOOGLE_REDIRECT_URI "$PUBLIC_URL/auth/callback"
  env_add CLOUD_SQL_INSTANCE "$CLOUD_SQL_INSTANCE"
  env_add DB_USER "$DB_USER"
  env_add DB_NAME "$DB_NAME"
  env_add GCS_BUCKET "$BUCKET"
  env_add VERTEX_PROJECT "$(env_or VERTEX_PROJECT "$PROJECT_ID")"
  env_add VERTEX_LOCATION "$(env_or VERTEX_LOCATION global)"
  env_add FACE_SEARCH_URL "$(face_search_url)"
  env_add GHOOMATE_AGENT_NAME "$AGENT_NAME"
  if [[ "${ALLOW_DEV_LOGIN:-}" == true ]]; then
    env_add ALLOW_DEV_LOGIN true
    env_add DEV_LOGIN_EMAILS "${DEV_LOGIN_EMAILS:-}"
  fi
  local key value
  for key in $PLAIN_KEYS; do
    value="$(env_value "$key")"
    if ! is_placeholder "$value"; then env_add "$key" "$value"; fi
  done
  # The voice worker inside this service keeps a LiveKit connection open between requests, so it needs CPU outside
  # requests (billed only while an instance is up; with no minimum instances it scales to zero) and gen2 for WebRTC.
  local voice_flags=(--cpu-throttling)
  if [[ "$VOICE_IN_WEB" == 1 ]]; then
    env_add VOICE_WORKER inline
    env_add GHOOMATE_MODEL "$(env_value GHOOMATE_MODEL)"
    env_add GHOOMATE_VOICE "$(env_value GHOOMATE_VOICE)"
    env_add GHOOMATE_IDLE_PROCESSES "$(env_value GHOOMATE_IDLE_PROCESSES)"
    voice_flags=(--no-cpu-throttling --execution-environment=gen2)
  fi
  say "  environment: $(cut -d: -f1 "$ENV_TMP" | tr '\n' ' ')"
  say "  secrets:     $(printf '%s' "$SECRET_PAIRS" | tr ',' '\n' | cut -d= -f1 | tr '\n' ' ')"

  # The service is made public afterwards (make_public), not with a flag, so a re-deploy never flips access off and on.
  run gcloud run deploy "$WEB_SERVICE" \
    --project="$PROJECT_ID" --region="$REGION" \
    --image="$IMAGE" \
    --service-account="$(web_sa)" \
    --port=8080 \
    --cpu="$WEB_CPU" --memory="$WEB_MEMORY" --concurrency="$WEB_CONCURRENCY" --timeout=300 \
    --min-instances="$WEB_MIN_INSTANCES" --max-instances="$WEB_MAX_INSTANCES" \
    --cpu-boost "${voice_flags[@]}" \
    --env-vars-file="$ENV_TMP" \
    --set-secrets="$SECRET_PAIRS"

  confirm_url
  make_public
  verify_web
}

# --- Voice agent worker -----------------------------------------------------------------------------------------
deploy_agent() {
  step "Voice agent worker $AGENT_SERVICE"
  resolve_public_url
  collect_secrets LIVEKIT_API_KEY:required LIVEKIT_API_SECRET:required
  local livekit_url
  livekit_url="$(env_value LIVEKIT_URL)"
  if is_placeholder "$livekit_url"; then die "LIVEKIT_URL is not set (in $ENV_FILE or the environment)"; fi
  if [[ "$DRY_RUN" != 1 ]] && ! gcloud run services describe "$WEB_SERVICE" --project="$PROJECT_ID" --region="$REGION" >/dev/null 2>&1; then
    warn "The web service $WEB_SERVICE is not deployed yet; the worker calls it at $PUBLIC_URL (run deploy/cloudrun.sh first)."
  fi
  # shellcheck disable=SC2086
  grant_secret_access "$(agent_sa)" $SECRET_NAMES

  env_open
  env_add LIVEKIT_URL "$livekit_url"
  env_add BACKEND_URL "$PUBLIC_URL"
  env_add GHOOMATE_AGENT_NAME "$AGENT_NAME"
  env_add GHOOMATE_MODEL "$(env_value GHOOMATE_MODEL)"
  env_add GHOOMATE_VOICE "$(env_value GHOOMATE_VOICE)"
  env_add GHOOMATE_IDLE_PROCESSES "$(env_value GHOOMATE_IDLE_PROCESSES)"
  say "  environment: $(cut -d: -f1 "$ENV_TMP" | tr '\n' ' ')"

  # The worker dials out to LiveKit and never receives requests, so it stays private. Its HTTP health port is 8081.
  # Always-on CPU and one instance minimum keep it connected between sessions. gen2 for the native WebRTC libraries.
  run gcloud run deploy "$AGENT_SERVICE" \
    --project="$PROJECT_ID" --region="$REGION" \
    --image="$IMAGE" \
    --service-account="$(agent_sa)" \
    --command=node --args=backend/src/voice/agent.ts,start \
    --port=8081 \
    --no-cpu-throttling --execution-environment=gen2 \
    --cpu="$AGENT_CPU" --memory="$AGENT_MEMORY" \
    --min-instances="$AGENT_MIN_INSTANCES" --max-instances="$AGENT_MAX_INSTANCES" \
    --no-allow-unauthenticated --ingress=internal \
    --env-vars-file="$ENV_TMP" \
    --set-secrets="$SECRET_PAIRS"

  step "Voice agent check"
  say "  The worker should log \"registered worker\" within a few seconds:"
  say "  gcloud run services logs read $AGENT_SERVICE --region=$REGION --project=$PROJECT_ID --limit=30"
}

# CI: a new revision from the new image. Environment, secrets and service account stay as the last full deploy left
# them, so this needs neither backend/.env nor Secret Manager access.
release_web() {
  step "Release to $WEB_SERVICE"
  run gcloud run services update "$WEB_SERVICE" --project="$PROJECT_ID" --region="$REGION" --image="$IMAGE"
  verify_web
  if [[ "$VERIFY_FAILED" == 1 ]]; then die "the new revision does not look healthy (see above)"; fi
  ok "released $IMAGE"
}

# --- Status, pause, resume ------------------------------------------------------------------------------------------
cmd_status() {
  step "Cloud Run services"
  gcloud run services list --project="$PROJECT_ID" --region="$REGION" --filter='metadata.name~^ghoommates' \
    --format='table(metadata.name,status.url,status.latestReadyRevisionName,spec.template.spec.serviceAccountName)'
  resolve_public_url
  verify_web
}

set_min_instances() { # SERVICE COUNT
  if gcloud run services describe "$1" --project="$PROJECT_ID" --region="$REGION" >/dev/null 2>&1 || [[ "$DRY_RUN" == 1 ]]; then
    run gcloud run services update "$1" --project="$PROJECT_ID" --region="$REGION" --min-instances="$2"
  else
    say "  $1 is not deployed; skipping"
  fi
}

# --- Summary --------------------------------------------------------------------------------------------------------
summary() {
  local client_id headline="GhoomMates is on Cloud Run:  $PUBLIC_URL"
  client_id="$(env_value GOOGLE_CLIENT_ID)"
  if [[ "$DRY_RUN" == 1 ]]; then headline="Dry run done, nothing was deployed. It would live at:  $PUBLIC_URL"; fi
  cat >&2 <<EOF

${C_BOLD}$headline${C_OFF}

One manual step for Google sign-in (gcloud cannot do it):
  https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID
  Open the OAuth 2.0 client ${client_id:-(the one whose id is GOOGLE_CLIENT_ID)} and add
    Authorized redirect URI:       $PUBLIC_URL/auth/callback
    Authorized JavaScript origin:  $PUBLIC_URL
  Then publish the OAuth consent screen (APIs & Services -> OAuth consent screen), or add the jury's Google
  accounts as test users, otherwise only you can sign in.

Before the demo, walk through the checklist in backend/docs/deploy.md.
Logs:    gcloud run services logs read $WEB_SERVICE --region=$REGION --project=$PROJECT_ID --limit=50
Pause:   deploy/cloudrun.sh pause    (scales to zero when you are done)
EOF
  if [[ "${NOT_PUBLIC:-0}" == 1 ]]; then
    warn "The service is NOT public yet (see the warning above), so the jury cannot open it."
    return 2
  fi
}

usage() {
  sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
}

main() {
  local command="${1:-web}"
  NOT_PUBLIC=0
  VERIFY_FAILED=0
  case "$command" in
    -h|--help|help) usage; return 0 ;;
    web|deploy|agent|all|setup|build|release|status|pause|resume) ;;
    image) choose_image; printf '%s\n%s\n' "$IMAGE" "$IMAGE_LATEST"; return 0 ;;  # no gcloud needed
    *) usage >&2; die "Unknown command: $command" ;;
  esac

  preflight
  case "$command" in
    setup)
      setup ;;
    build)
      choose_image; build ;;
    release)
      choose_image
      if [[ "${SKIP_BUILD:-0}" != 1 ]]; then build; fi
      release_web ;;
    status)
      cmd_status ;;
    pause)
      step "Scale to zero"
      set_min_instances "$WEB_SERVICE" 0
      set_min_instances "$AGENT_SERVICE" 0
      say "  Cloud Run is idle now. The Cloud SQL instance keeps running (and billing): see backend/docs/deploy.md." ;;
    resume)
      step "Back to the usual minimum instances"
      set_min_instances "$WEB_SERVICE" "$WEB_MIN_INSTANCES"
      set_min_instances "$AGENT_SERVICE" "$AGENT_MIN_INSTANCES" ;;
    web|deploy)
      if [[ "${SKIP_SETUP:-0}" != 1 ]]; then setup; fi
      choose_image
      if [[ "${SKIP_BUILD:-0}" != 1 ]]; then build; fi
      deploy_web
      summary ;;
    agent)
      if [[ "${SKIP_SETUP:-0}" != 1 ]]; then setup; fi
      choose_image
      if [[ "${SKIP_BUILD:-0}" != 1 ]]; then build; fi
      deploy_agent ;;
    all)
      if [[ "${SKIP_SETUP:-0}" != 1 ]]; then setup; fi
      choose_image
      if [[ "${SKIP_BUILD:-0}" != 1 ]]; then build; fi
      deploy_web
      if [[ "$VOICE_IN_WEB" == 1 ]]; then say "  VOICE_IN_WEB=1: the web service runs the voice worker; no agent service"; else deploy_agent; fi
      summary ;;
  esac
}

main "$@"
