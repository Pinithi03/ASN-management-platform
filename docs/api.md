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
| Emails | `/emails` | Email listing, status, reprocessing |
| ASN | `/asn` | ASN wizard, submission, tracking |
| Dashboard | `/dashboard` | Analytics and statistics |

## Interactive Docs

When the backend is running:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
