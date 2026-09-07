# Automation — System B (Email Processing Engine)

Background Celery workers for email ingestion, parsing, and data persistence.

## Architecture

3-Layer Architecture adapted for background workers:

```
Presentation Layer   →  tasks/      (Celery task definitions)
        ↓ calls
Business Logic Layer →  services/   (parsing, scoring, orchestration)
        ↓ calls
Data Access Layer    →  repositories/ + clients/  (DB, MinIO, Outlook API)
```

## Email Processing Pipeline

```
Fetch → Filter → Extract → Parse → Score → Route → Persist → Notify
  │        │         │        │       │       │        │         │
  └─ T1    └─ T2     └─ T3   └─ T4  └─ T5  └─ T6   └─ T7     └─ T8
```

## Parser Tiers

| Tier | Type | Confidence | When |
|------|------|-----------|------|
| 1 | Template | 0.90-0.99 | MVP — exact format match |
| 2 | Regex | 0.60-0.85 | Fallback — pattern matching |
| 3 | AI/LLM | 0.50-0.80 | Phase 4 — Ollama (future) |

## Quick Start

```bash
# From repo root
make worker-start       # Start Celery worker
make beat-start         # Start Celery Beat scheduler
make flower-start       # Start Flower monitoring (port 5555)
```
