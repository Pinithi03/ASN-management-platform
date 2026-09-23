# ANS Management Platform

> Multi-company Email Automation & ASN (Advanced Shipping Notice) Management Platform for the Oniverse Group garment manufacturing plants.

## Overview

This platform serves **5 apparel manufacturing plants** (Sirio, Benji, Omega Line, Alpha Apparels, Vavuniya Apparels), automating email-based PO data ingestion and managing the full ASN lifecycle from purchase order to SAP submission.

### Key Capabilities

- **Email Automation** — Automatically ingests ~1,500 emails/day across 5 plants, parses PO data with confidence scoring, and routes to auto-commit or human review
- **ASN Management** — 4-step wizard for creating shipping notices (PO Selection → Packing → Barcode Generation → IUNGO/SAP Submission)
- **Multi-Tenant** — Shared infrastructure with strict data isolation per company (PostgreSQL Row-Level Security)
- **RBAC** — 5 role levels (Super Admin → Viewer) via Keycloak + Microsoft Outlook login

## Architecture

**Monorepo** with two systems following **3-Layer Architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│                    Nginx (Reverse Proxy)                     │
├──────────────────────┬──────────────────────────────────────┤
│   System A           │   System B                           │
│   Business App       │   Automation Engine                  │
│                      │                                      │
│   React ──→ FastAPI  │   Celery Workers ──→ RabbitMQ       │
│   (frontend/) (backend/)│   (automation/)                   │
│                      │                                      │
│   3-Layer:           │   3-Layer:                           │
│   Routes → Services  │   Tasks → Services                  │
│         → Repos      │        → Repos/Clients              │
├──────────────────────┴──────────────────────────────────────┤
│   PostgreSQL  │  Redis  │  RabbitMQ  │  MinIO  │  Keycloak │
└──────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Shadcn/ui |
| Backend API | Python 3.12, FastAPI, SQLAlchemy 2.0, Pydantic v2 |
| Automation | Celery 5.4, RabbitMQ 3.13 |
| Database | PostgreSQL 16 (with RLS) |
| Cache | Redis 7 |
| Storage | MinIO (S3-compatible, on-premise) |
| Auth | Keycloak 25+ (OIDC, Microsoft Entra ID) |
| Proxy | Nginx |
| Deployment | Docker Compose |

## Quick Start

```bash
# Clone
git clone https://github.com/pinithi02/ASN-management-platform.git
cd ASN-management-platform

# Setup (installs deps, starts infrastructure)
make setup

# Development (run each in a separate terminal)
make backend-dev       # FastAPI (port 8000)
make frontend-dev      # Vite (port 3000)
make worker-start      # Celery worker

# Or start everything via Docker
make docker-up
```

## Repository Structure

```
ASN-management-platform/
├── backend/           # System A — FastAPI REST API
├── automation/        # System B — Celery email processing workers
├── frontend/          # React SPA
├── packages/shared/   # Shared contracts (enums, events, schemas)
├── docker/            # Docker Compose, Nginx, Keycloak config
├── scripts/           # Setup, seed, healthcheck scripts
├── docs/              # Architecture, API, deployment docs
├── .github/workflows/ # CI pipeline
├── Makefile           # Development commands (run `make help`)
└── .env.example       # Environment variable template
```

## Development Commands

Run `make help` for all available targets. Key commands:

| Command | Description |
|---------|-------------|
| `make setup` | First-time setup |
| `make backend-dev` | Start backend (port 8000) |
| `make frontend-dev` | Start frontend (port 3000) |
| `make worker-start` | Start Celery worker |
| `make infra-up` | Start DB, Redis, RabbitMQ, MinIO, Keycloak |
| `make test` | Run all tests |
| `make lint` | Run all linters |
| `make docker-up` | Start everything via Docker |

## Documentation

- [Architecture Overview](docs/architecture.md)
- [Development Guide](docs/development.md)
- [API Documentation](docs/api.md)
- [Deployment Guide](docs/deployment.md)

## Development Notes & Pending Data Mappings

- **Admin Dashboard — Plant Operations Graph**: The interactive bar chart on the Admin Dashboard (`AdminDashboard.tsx`) is fully wired with metric toggles (`ASNs Dispatched`, `Emails Parsed`, `Success %`) and hover tooltips. The metrics currently display mock plant operational data and will be mapped to live backend DB aggregation endpoints in an upcoming sprint.

## License

Proprietary — SIRIO.LTD / Oniverse Group
