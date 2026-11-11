#!/usr/bin/env bash
# Deploys face-indexer to Cloud Run, wired to the photo bucket through Eventarc. Find-me search runs in the backend
# (backend/src/trips/faces.ts), which queries the faces vector index directly.
#
# Run one step at a time, in this order (README "Deploy" explains every command and flag):
#   ./deploy.sh apis        enable the Google Cloud APIs
#   ./deploy.sh registry    create the Artifact Registry repository
#   ./deploy.sh accounts    create the two service accounts
#   ./deploy.sh iam         grant project and bucket roles
#   ./deploy.sh migrate     create the face_photos / faces indexes and the vector search index in Atlas
#   ./deploy.sh build       build the image with Cloud Build and push it
#   ./deploy.sh indexer     deploy face-indexer
#   ./deploy.sh invokers    let the trigger call face-indexer
#   ./deploy.sh triggers    create the Eventarc triggers (finalized + deleted)
#   ./deploy.sh backfill    index photos uploaded before the trigger existed (safe to rerun)
#   ./deploy.sh status      show URLs and triggers
# Redeploying code later: ./deploy.sh build && ./deploy.sh indexer
#
# Settings below can be overridden from the environment, e.g. MAX_INDEXER_INSTANCES=5 ./deploy.sh indexer
set -euo pipefail

cd "$(dirname "$0")"

PROJECT_ID="${PROJECT_ID:-optimal-comfort-510810-d1}"
REGION="${REGION:-asia-south1}"              # Mumbai; the bucket is in asia-south1 too (Eventarc requires a match)
BUCKET="${BUCKET:-ghoomates}"
REPO="${REPO:-ghoomates}"
TAG="${TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
IMAGE="${IMAGE:-${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/faces:${TAG}}"

INDEXER_SA="face-indexer@${PROJECT_ID}.iam.gserviceaccount.com"
TRIGGER_SA="face-trigger@${PROJECT_ID}.iam.gserviceaccount.com"

MAX_INDEXER_INSTANCES="${MAX_INDEXER_INSTANCES:-10}"

load_mongodb_settings() {
  if [[ -z "${MONGODB_CONNECTION_STRING:-}" && -f .env ]]; then
    MONGODB_CONNECTION_STRING="$(grep -E '^MONGODB_CONNECTION_STRING=' .env | head -n1 | cut -d= -f2-)"
  fi
  if [[ -z "${MONGODB_DB:-}" && -f .env ]]; then
    MONGODB_DB="$(grep -E '^MONGODB_DB=' .env | head -n1 | cut -d= -f2-)"
  fi
  MONGODB_DB="${MONGODB_DB:-ghoomates}"
  if [[ -z "${MONGODB_CONNECTION_STRING:-}" ]]; then
    echo "Set MONGODB_CONNECTION_STRING in cloud/.env (see .env.example)" >&2
    exit 1
  fi
}

# Writes a Cloud Run env vars file (YAML) to a private temp file and prints its path.
env_file() {
  load_mongodb_settings
  local file
  file="$(mktemp)"
  chmod 600 "$file"
  {
    echo "LOG_LEVEL: 'INFO'"
    echo "MONGODB_CONNECTION_STRING: '${MONGODB_CONNECTION_STRING//\'/\'\'}'"
    echo "MONGODB_DB: '${MONGODB_DB//\'/\'\'}'"
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
    --description="GhoomMates container images"
}

step_accounts() {
  gcloud iam service-accounts create face-indexer --project="$PROJECT_ID" \
    --display-name="GhoomMates face-indexer (Cloud Run runtime)"
  gcloud iam service-accounts create face-trigger --project="$PROJECT_ID" \
    --display-name="GhoomMates Eventarc trigger identity"
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

  # Not needed while MONGODB_CONNECTION_STRING is passed as an env var. Grant this only if you move it into
  # Secret Manager:
  # gcloud secrets add-iam-policy-binding ghoommates-mongodb-uri --project="$PROJECT_ID" --member="serviceAccount:${INDEXER_SA}" --role="roles/secretmanager.secretAccessor"
}

step_migrate() {
  load_mongodb_settings
  # Uses the image docker compose builds locally (docker compose build migrate); no Python setup needed.
  docker run --rm -e MONGODB_CONNECTION_STRING="$MONGODB_CONNECTION_STRING" -e MONGODB_DB="$MONGODB_DB" \
    ghoommates-faces:local python -m faces.migrate
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
  env="$(env_file)"
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

step_invokers() {
  gcloud run services add-iam-policy-binding face-indexer \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --member="serviceAccount:${TRIGGER_SA}" \
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
  load_mongodb_settings
  # Runs the indexer locally (local image, your Application Default Credentials) over existing trip photos.
  docker run --rm \
    -e MONGODB_CONNECTION_STRING="$MONGODB_CONNECTION_STRING" \
    -e MONGODB_DB="$MONGODB_DB" \
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
  apis|registry|accounts|iam|migrate|build|indexer|invokers|triggers|backfill|status) "step_$1" ;;
  *) usage ;;
esac
