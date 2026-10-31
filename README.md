# Ghoomates

Project scaffold separating frontend, backend, and cloud operations.

```text
ghoomates/
├── frontend/
│   ├── public/                 # Public static assets
│   ├── src/
│   │   ├── assets/             # Imported images and fonts
│   │   ├── components/         # Reusable UI components
│   │   ├── pages/              # Application screens
│   │   ├── hooks/              # Reusable UI logic
│   │   ├── services/           # API clients and integrations
│   │   └── styles/             # Shared styles
│   └── tests/
├── backend/
│   ├── src/                    # API and business logic
│   ├── tests/
│   ├── config/                 # Non-secret configuration
│   └── migrations/             # Database schema changes
├── cloud-ops/
│   ├── docker/                 # Container definitions
│   ├── infrastructure/
│   │   ├── modules/            # Reusable infrastructure
│   │   └── environments/       # dev, staging, prod
│   ├── deploy/                 # Deployment configuration
│   ├── monitoring/             # Dashboards and alerts
│   └── scripts/                # Operational utilities
└── docs/                       # Architecture and development documentation
```

This is a framework-neutral scaffold. No application runtime, dependencies, cloud resources, or deployment pipelines are configured yet. Add setup and run commands when selecting the frontend and backend stacks.

Keep local secrets in ignored environment files and deployment secrets in a secret manager. Commit only sanitized example configuration.
