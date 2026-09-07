"""
SQLAlchemy ORM models.

Each model maps to a PostgreSQL table. All models include:
    - company_id for multi-tenant isolation
    - created_at / updated_at timestamps
    - Soft-delete via is_active where applicable
"""
