# Development Guide

## Prerequisites

- Python 3.12+
- Node.js 20+ (LTS)
- Docker + Docker Compose v2
- Git

## Getting Started

```bash
git clone https://github.com/pinithi02/ASN-management-platform.git
cd ASN-management-platform
./scripts/setup.sh
```

## Daily Development

```bash
# Start infrastructure (DB, Redis, RabbitMQ, MinIO, Keycloak)
make infra-up

# In separate terminals:
make backend-dev      # FastAPI dev server (port 8000)
make frontend-dev     # Vite dev server (port 3000)
make worker-start     # Celery worker

# Run tests
make test             # All tests
make backend-test     # Backend only
make frontend-test    # Frontend only

# Linting
make lint             # All linters
```

## Code Style

- **Python**: Ruff (formatter + linter), MyPy (type checking)
- **TypeScript**: ESLint + Prettier (via Vite plugin)
- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, etc.)

## Database Migrations

```bash
# Create a new migration
make db-migrate MSG="add_users_table"

# Apply migrations
make db-upgrade

# Rollback one step
make db-downgrade
```

## Branch Strategy

- `main` — production-ready code
- `develop` — integration branch
- `feature/*` — feature branches (from develop)
- `fix/*` — bug fix branches
