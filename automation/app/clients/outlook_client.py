"""
Microsoft Graph API client for Outlook email access.

Handles:
    - OAuth2 token management (per-company credentials via Keycloak)
    - Email listing and fetching (Microsoft Graph v1.0)
    - Attachment downloading
    - Rate limit handling and pagination

Uses: httpx.AsyncClient with retry logic
"""

# TODO: Sprint 3 (EP-04) — Implement
