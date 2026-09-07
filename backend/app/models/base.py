"""
Base model class for all SQLAlchemy ORM models.

Provides:
    - UUID primary key (id)
    - Multi-tenant column (company_id)
    - Timestamp columns (created_at, updated_at)
    - Soft-delete column (is_active)
    - Common __repr__ method
"""

# TODO: Sprint 1 (EP-01) — Implement base model with DeclarativeBase
# from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
# from sqlalchemy import DateTime, Boolean, func
# import uuid
