#!/usr/bin/env bash
# One-time setup so .github/workflows/deploy.yml can deploy to Cloud Run. Safe to run again.
#
# GitHub Actions signs in to Google with Workload Identity Federation: GitHub hands the job a short-lived token that
# names the repository and branch, and Google swaps it for access as the ghoommates-deployer service account. No key
# is stored in GitHub. Only pushes to main of this repository (matched by its numeric id, so a renamed or recreated
# repository does not inherit access) are accepted.
#
# What ghoommates-deployer may do:
#   roles/cloudbuild.builds.editor, roles/serviceusage.serviceUsageConsumer   submit the image build
#   roles/logging.viewer                                                    stream the build log into the job
#   roles/storage.admin on gs://<project>_cloudbuild only                   upload the source for the build
#   roles/run.developer                                                     roll out a new revision
#   roles/iam.serviceAccountUser on the Cloud Build and web runtime accounts  run the build and the revision as them
# It cannot read Secret Manager, the database or the photo bucket.
#
#   DRY_RUN=1 deploy/github-ci.sh   prints every change instead of making it
set -euo pipefail
# shellcheck source=common.sh
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

GITHUB_REPO="${GITHUB_REPO:-sourabhbagrecha/ghoomates}"
POOL="${POOL:-github}"
PROVIDER="${PROVIDER:-ghoomates}"
DEPLOYER_NAME="${DEPLOYER_NAME:-ghoommates-deployer}"

# quietly COMMAND...: runs it (or prints it in a dry run) and shows its output only when it fails.
quietly() {
  if [[ "$DRY_RUN" == 1 ]]; then run "$@"; return 0; fi
  local out
  out="$("$@" 2>&1)" || { printf '%s\n' "$out" >&2; return 1; }
}

preflight
number="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
repo_id="$(gh api "repos/$GITHUB_REPO" --jq .id)"
deployer="$DEPLOYER_NAME@$PROJECT_ID.iam.gserviceaccount.com"
build_sa="$(gcloud builds get-default-service-account --project="$PROJECT_ID" --region="$REGION" --format='value(serviceAccountEmail)')"
build_sa="${build_sa##*/}"
say "  $GITHUB_REPO is repository id $repo_id; Cloud Build runs as $build_sa"

step "APIs"
run gcloud services enable iamcredentials.googleapis.com sts.googleapis.com --project="$PROJECT_ID"

step "Workload identity pool $POOL and provider $PROVIDER"
if gcloud iam workload-identity-pools describe "$POOL" --project="$PROJECT_ID" --location=global >/dev/null 2>&1; then
  ok "pool exists"
else
  run gcloud iam workload-identity-pools create "$POOL" --project="$PROJECT_ID" --location=global --display-name="GitHub Actions"
fi
if gcloud iam workload-identity-pools providers describe "$PROVIDER" --project="$PROJECT_ID" --location=global \
  --workload-identity-pool="$POOL" >/dev/null 2>&1; then
  ok "provider exists"
else
  run gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --project="$PROJECT_ID" --location=global \
    --workload-identity-pool="$POOL" --display-name="$GITHUB_REPO, main" \
    --issuer-uri=https://token.actions.githubusercontent.com \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository_id=='$repo_id' && assertion.ref=='refs/heads/main'"
fi

step "Service account $deployer"
if gcloud iam service-accounts describe "$deployer" --project="$PROJECT_ID" >/dev/null 2>&1; then
  ok "exists"
else
  run gcloud iam service-accounts create "$DEPLOYER_NAME" --project="$PROJECT_ID" --display-name="Ghoommates deploys from GitHub Actions"
fi
retry 5 6 quietly gcloud iam service-accounts add-iam-policy-binding "$deployer" --project="$PROJECT_ID" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$number/locations/global/workloadIdentityPools/$POOL/attribute.repository_id/$repo_id"
ok "pushes to main of $GITHUB_REPO may act as it"

step "What it may do"
for role in roles/cloudbuild.builds.editor roles/serviceusage.serviceUsageConsumer roles/logging.viewer roles/run.developer; do
  retry 5 6 quietly gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$deployer" --role="$role" --condition=None
  ok "$role"
done
retry 5 6 quietly gcloud storage buckets add-iam-policy-binding "gs://${PROJECT_ID}_cloudbuild" \
  --member="serviceAccount:$deployer" --role=roles/storage.admin
ok "roles/storage.admin on gs://${PROJECT_ID}_cloudbuild"
for account in "$build_sa" "$WEB_SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"; do
  retry 5 6 quietly gcloud iam service-accounts add-iam-policy-binding "$account" --project="$PROJECT_ID" \
    --member="serviceAccount:$deployer" --role=roles/iam.serviceAccountUser
  ok "roles/iam.serviceAccountUser on $account"
done

say ""
say "Done. .github/workflows/deploy.yml uses:"
say "  workload_identity_provider: projects/$number/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
say "  service_account: $deployer"
