# Backend — System A (Business Application)

FastAPI REST API serving the React frontend.

## Architecture

Strict 3-Layer Architecture:

```
Presentation Layer   →  api/v1/endpoints/   (FastAPI routers)
        ↓ calls
Business Logic Layer →  services/           (domain logic)
        ↓ calls
Data Access Layer    →  repositories/       (database queries)
```

**Rules:**
- Endpoints call Services — never Repositories directly
- Services call Repositories — never raw SQL
- Repositories never import from Services or Endpoints
- No layer skipping: Endpoint → Service → Repository

## Quick Start

```bash
# From repo root
make backend-install    # Install dependencies
make backend-dev        # Run dev server (port 8000)
make backend-test       # Run tests
make backend-lint       # Lint + type check
```

## Key Directories

| Directory | Layer | Purpose |
|-----------|-------|---------|
| `app/api/v1/endpoints/` | Presentation | HTTP request/response handling |
| `app/services/` | Business Logic | Domain rules, validation, orchestration |
| `app/repositories/` | Data Access | Database queries, external I/O |
| `app/models/` | — | SQLAlchemy ORM models |
| `app/schemas/` | — | Pydantic v2 request/response DTOs |
| `app/core/` | — | Config, security, middleware, exceptions |
| `app/db/` | — | DB session, Alembic migrations |
| `tests/` | — | Unit, integration, e2e tests |

## Environment

See `../.env.example` for required environment variables.
