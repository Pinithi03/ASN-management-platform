# Deployment Guide

## Development (Local)

```bash
make docker-up        # All services via Docker Compose
```

## Staging (Render)

See KB 10 — Deployment & Docker for Render configuration.

## Production (On-Premise)

### Hardware Requirements

- CPU: 11+ cores (recommended 16)
- RAM: 7.5+ GB (recommended 16 GB)
- Storage: 500 GB+ SSD (2.7 TB/year projected for attachments)

### Steps

1. Clone repo to production server
2. Copy `.env.example` to `.env` and fill in production values
3. Configure SSL certificates in `docker/nginx/`
4. Run `docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up -d`
5. Import Keycloak realm: `docker/keycloak/realm-export.json`
6. Run database migrations: `make db-upgrade`
7. Seed initial data: `make db-seed`
8. Verify: `./scripts/healthcheck.sh`

### Backup Strategy

- PostgreSQL: Daily pg_dump (retain 30 days)
- MinIO: Bucket replication or rsync
- Keycloak: Realm export
