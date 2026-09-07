"""
Dependency Injection for API endpoints.

Provides reusable FastAPI dependencies:
    - get_db()          : Yields a SQLAlchemy AsyncSession
    - get_current_user(): Validates JWT and returns current user
    - get_company_id()  : Extracts company_id from token claims
    - require_role()    : RBAC permission check

These are injected via Depends() in endpoint function signatures.
"""

# TODO: Sprint 1 — Implement database session dependency
# TODO: Sprint 2 — Implement auth dependencies (Keycloak JWT validation)
