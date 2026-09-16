# API Documentation

## Base URL

- Development: `http://localhost:8000/api/v1`
- Production: `https://<domain>/api/v1`

## Authentication

All endpoints (except `/health` and `/auth/*`) require a Bearer token:

```
Authorization: Bearer <keycloak-jwt>
```

## Endpoint Groups

| Group | Prefix | Description |
|-------|--------|-------------|
| Health | `/health` | Liveness & readiness probes |
| Auth | `/auth` | Login, token refresh, logout |
| Companies | `/companies` | Company CRUD (admin only) |
| Users | `/users` | User management |
| Purchase Orders | `/purchase-orders` | PO CRUD, search, import |
| Emails | `/emails` | Email listing, multi-field search (`search`, `po_number`, `vendor_code`), reprocessing, manual IMAP sync (`/emails/fetch`) |
| ASN | `/asn` | ASN wizard, submission, tracking |
| Dashboard | `/dashboard` | Analytics and statistics |

## Email Search Endpoint Parameters (`GET /api/v1/emails`)

- `search`: Global multi-field query matching email subjects, body text, extracted PO numbers, supplier codes, purchase order descriptions, style numbers, and supplier names.
- `po_number`: Filters specifically by extracted or associated Purchase Order numbers.
- `vendor_code`: Filters specifically by extracted supplier codes or registered supplier names.
- `status`: Filters by email processing state (`PENDING`, `PARSED`, `FAILED`, `COMPLETED`).

## Email Fetch Trigger (`POST /api/v1/emails/fetch`)

- Triggers an immediate background IMAP sync/fetch job to pull down new emails on demand without waiting for Celery Beat interval schedules.

## Interactive Docs

When the backend is running:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
