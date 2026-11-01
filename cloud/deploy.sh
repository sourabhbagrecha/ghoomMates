#!/usr/bin/env bash
# Deploys face-indexer and face-search to Cloud Run, wired to the photo bucket through Eventarc.
#
# Run one step at a time, in this order (README "Deploy" explains every command and flag):
#   ./deploy.sh apis        enable the Google Cloud APIs
#   ./deploy.sh registry    create the Artifact Registry repository
#   ./deploy.sh accounts    create the three service accounts
#   ./deploy.sh iam         grant project and bucket roles
#   ./deploy.sh migrate     create pgvector, face_photos and faces in Cloud SQL
#   ./deploy.sh build       build the image with Cloud Build and push it
#   ./deploy.sh indexer     deploy face-indexer
#   ./deploy.sh search      deploy face-search
#   ./deploy.sh invokers    let the trigger call face-indexer and the backend call face-search
#   ./deploy.sh triggers    create the Eventarc triggers (finalized + deleted)
#   ./deploy.sh backfill    index photos uploaded before the trigger existed (safe to rerun)
#   ./deploy.sh status      show URLs and triggers
# Redeploying code later: ./deploy.sh build && ./deploy.sh indexer && ./deploy.sh search
#
# Settings below can be overridden from the environment, e.g. MIN_SEARCH_INSTANCES=1 ./deploy.sh search
set -euo pipefail

cd "$(dirname "$0")"

PROJECT_ID="${PROJECT_ID:-optimal-comfort-510810-d1}"
REGION="${REGION:-asia-south1}"              # Mumbai; the bucket is in asia-south1 too (Eventarc requires a match)
BUCKET="${BUCKET:-ghoomates}"
REPO="${REPO:-ghoomates}"
TAG="${TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
IMAGE="${IMAGE:-${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/faces:${TAG}}"

INDEXER_SA="face-indexer@${PROJECT_ID}.iam.gserviceaccount.com"
SEARCH_SA="face-search@${PROJECT_ID}.iam.gserviceaccount.com"
TRIGGER_SA="face-trigger@${PROJECT_ID}.iam.gserviceaccount.com"
# Identity the backend uses to call face-search (it already has this account's key in GCS_CREDENTIALS_BASE64).
BACKEND_SA="${BACKEND_SA:-ghoomates-storage@${PROJECT_ID}.iam.gserviceaccount.com}"

MAX_INDEXER_INSTANCES="${MAX_INDEXER_INSTANCES:-10}"
MAX_SEARCH_INSTANCES="${MAX_SEARCH_INSTANCES:-3}"
MIN_SEARCH_INSTANCES="${MIN_SEARCH_INSTANCES:-0}"

load_database_url() {
  if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
    DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -n1 | cut -d= -f2-)"
  fi
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "Set DATABASE_URL in cloud/.env (see .env.example)" >&2
    exit 1
  fi
}

# Writes a Cloud Run env vars file (YAML) to a private temp file and prints its path.
env_file() {
  load_database_url
  local file
  file="$(mktemp)"
  chmod 600 "$file"
  {
    echo "SERVICE: '$1'"
    echo "LOG_LEVEL: 'INFO'"
    echo "DATABASE_URL: '${DATABASE_URL//\'/\'\'}'"
  } > "$file"
  echo "$file"
}

step_apis() {
  gcloud services enable \
    run.googleapis.com \
    eventarc.googleapis.com \
    pubsub.googleapis.com \
    storage.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    iam.googleapis.com \
    logging.googleapis.com \
    --project="$PROJECT_ID"
}

step_registry() {
  gcloud artifacts repositories create "$REPO" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --repository-format=docker \
    --description="Ghoommates container images"
}

step_accounts() {
  gcloud iam service-accounts create face-indexer --project="$PROJECT_ID" \
    --display-name="Ghoommates face-indexer (Cloud Run runtime)"
  gcloud iam service-accounts create face-search --project="$PROJECT_ID" \
    --display-name="Ghoommates face-search (Cloud Run runtime)"
  gcloud iam service-accounts create face-trigger --project="$PROJECT_ID" \
    --display-name="Ghoommates Eventarc trigger identity"
}

step_iam() {
  # face-indexer reads uploaded photos from the bucket (read only).
  gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
    --member="serviceAccount:${INDEXER_SA}" \
    --role="roles/storage.objectViewer"

  # The trigger identity receives events from Eventarc.
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${TRIGGER_SA}" \
    --role="roles/eventarc.eventReceiver" \
    --condition=None

  # Cloud Storage publishes bucket notifications to Pub/Sub on Eventarc's behalf.
  local gcs_agent
  gcs_agent="$(gcloud storage service-agent --project="$PROJECT_ID")"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${gcs_agent}" \
    --role="roles/pubsub.publisher" \
    --condition=None

  # Not needed with the direct DATABASE_URL connection. Grant these only if you switch to the Cloud SQL
  # connector (roles/cloudsql.client) or move the password into Secret Manager (secretAccessor):
  # for sa in "$INDEXER_SA" "$SEARCH_SA"; do
  #   gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${sa}" --role="roles/cloudsql.client" --condition=None
  #   gcloud secrets add-iam-policy-binding ghoommates-db-url --project="$PROJECT_ID" --member="serviceAccount:${sa}" --role="roles/secretmanager.secretAccessor"
  # done
}

step_migrate() {
  load_database_url
  # Uses the image docker compose builds locally (docker compose build migrate); no Python setup needed.
  docker run --rm -e DATABASE_URL="$DATABASE_URL" ghoommates-faces:local python -m faces.migrate
}

step_build() {
  gcloud builds submit . \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --config=cloudbuild.yaml \
    --substitutions="_IMAGE=${IMAGE}"
  echo "Built ${IMAGE}"
}

step_indexer() {
  local env status=0
  env="$(env_file indexer)"
  gcloud run deploy face-indexer \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --image="$IMAGE" \
    --service-account="$INDEXER_SA" \
    --no-allow-unauthenticated \
    --ingress=internal \
    --execution-environment=gen2 \
    --cpu=2 \
    --memory=4Gi \
    --concurrency=1 \
    --timeout=300 \
    --min-instances=0 \
    --max-instances="$MAX_INDEXER_INSTANCES" \
    --cpu-boost \
    --env-vars-file="$env" || status=$?
  rm -f "$env"
  return "$status"
}

step_search() {
  local env status=0
  env="$(env_file search)"
  gcloud run deploy face-search \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --image="$IMAGE" \
    --service-account="$SEARCH_SA" \
    --no-allow-unauthenticated \
    --ingress=all \
    --execution-environment=gen2 \
    --cpu=2 \
    --memory=4Gi \
    --concurrency=1 \
    --timeout=60 \
    --min-instances="$MIN_SEARCH_INSTANCES" \
    --max-instances="$MAX_SEARCH_INSTANCES" \
    --cpu-boost \
    --env-vars-file="$env" || status=$?
  rm -f "$env"
  return "$status"
}

step_invokers() {
  gcloud run services add-iam-policy-binding face-indexer \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --member="serviceAccount:${TRIGGER_SA}" \
    --role="roles/run.invoker"
  gcloud run services add-iam-policy-binding face-search \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --member="serviceAccount:${BACKEND_SA}" \
    --role="roles/run.invoker"
}

step_triggers() {
  gcloud eventarc triggers create face-indexer-finalized \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --destination-run-service=face-indexer \
    --destination-run-region="$REGION" \
    --destination-run-path=/ \
    --event-filters="type=google.cloud.storage.object.v1.finalized" \
    --event-filters="bucket=${BUCKET}" \
    --service-account="$TRIGGER_SA"
  gcloud eventarc triggers create face-indexer-deleted \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --destination-run-service=face-indexer \
    --destination-run-region="$REGION" \
    --destination-run-path=/ \
    --event-filters="type=google.cloud.storage.object.v1.deleted" \
    --event-filters="bucket=${BUCKET}" \
    --service-account="$TRIGGER_SA"
}

step_backfill() {
  load_database_url
  # Runs the indexer locally (local image, your Application Default Credentials) over existing trip photos.
  docker run --rm \
    -e DATABASE_URL="$DATABASE_URL" \
    -e BUCKET="$BUCKET" \
    -e PREFIX="trips/" \
    -e GOOGLE_CLOUD_PROJECT="$PROJECT_ID" \
    -e GOOGLE_APPLICATION_CREDENTIALS=/adc.json \
    -v "${HOME}/.config/gcloud/application_default_credentials.json:/adc.json:ro" \
    ghoommates-faces:local python -m faces.backfill
}

step_status() {
  gcloud run services list --project="$PROJECT_ID" --region="$REGION" \
    --filter="metadata.name~^face-" --format="table(metadata.name,status.url,status.latestReadyRevisionName)"
  gcloud eventarc triggers list --project="$PROJECT_ID" --location="$REGION"
}

usage() {
  sed -n '2,/^set /p' "$0" | sed '$d'
  exit 1
}

[[ $# -eq 1 ]] || usage
case "$1" in
  apis|registry|accounts|iam|migrate|build|indexer|search|invokers|triggers|backfill|status) "step_$1" ;;
  *) usage ;;
esac
