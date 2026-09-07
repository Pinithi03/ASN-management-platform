# Architecture Overview

For the full architecture decision document, see the project knowledge base:
**KB 01 — System Overview**

## Quick Reference

### Two-System Design

| System | Purpose | Stack | Entry Points |
|--------|---------|-------|-------------|
| **A** — Business App | REST API + Web UI | FastAPI + React | HTTP requests via Nginx |
| **B** — Automation | Email processing pipeline | Celery + RabbitMQ | Timer-triggered (Beat) + queue messages |

### 3-Layer Architecture (both systems)

```
Presentation Layer   →  Controllers / Tasks    (HTTP or queue entry)
        ↓ calls
Business Logic Layer →  Services               (domain rules)
        ↓ calls
Data Access Layer    →  Repositories / Clients  (DB, APIs, storage)
```

### Key Rules

1. **No layer skipping** — endpoints/tasks call services, services call repositories
2. **Multi-tenant isolation** — every query includes `company_id`
3. **Shared contracts** — `packages/shared/` holds enums, events, schemas used by both systems
4. **Upsert over insert** — PO data uses `ON CONFLICT DO UPDATE` with version tracking

See individual KB files (02–13) for detailed subsystem documentation.
