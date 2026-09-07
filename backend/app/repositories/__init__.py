"""
Data Access Layer.

Repositories encapsulate all database queries, external API calls,
and I/O operations. They return domain models or DTOs, never raw
database rows.

Rules:
    - Repositories NEVER import from services/ or api/
    - Repositories handle SQLAlchemy sessions, query building, and transactions
    - One Repository per aggregate root (Company, PurchaseOrder, ASN, etc.)
"""
