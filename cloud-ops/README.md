# Cloud operations

Use `docker/` for container definitions, `deploy/` for deployment configuration, `infrastructure/modules/` for reusable infrastructure, and `infrastructure/environments/` for dev, staging, and production settings. Store dashboards and alerts in `monitoring/` and operational utilities in `scripts/`.

No provider or deployment tooling is configured. If using GitHub Actions, place workflow entry points in the repository root `.github/workflows/` directory. Never commit cloud credentials or infrastructure state.
