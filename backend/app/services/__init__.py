"""
Business Logic Layer.

Services contain domain logic, validation, orchestration, and
cross-cutting concerns. They call Repositories for data access
and are called by API endpoints (Presentation Layer).

Rules:
    - Services NEVER import from api/ (no upward dependencies)
    - Services call Repositories, never raw SQL or ORM queries
    - Services may call other Services for cross-domain orchestration
"""
