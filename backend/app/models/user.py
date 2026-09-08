"""
User model — synced from Keycloak. Two roles only:
COMPANY_ADMIN (plant admin) and SUPPLIER (external supplier).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, SoftDeleteMixin
from app.models.enums import UserRole  # noqa: F401 — referenced for documentation

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.supplier import Supplier


class User(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("company_id", "email", name="uq_users_company_email"),
    )

    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Tenant scope
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True
    )

    # Keycloak identity
    keycloak_id: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False
    )

    # Profile
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(200))

    # Role — stored as plain string; CHECK constraint enforced at DB level
    role: Mapped[str] = mapped_column(String(50), nullable=False)

    # Supplier link (set for SUPPLIER role; NULL for COMPANY_ADMIN)
    supplier_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=True
    )

    # Activity tracking
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # --- Relationships ---
    company: Mapped[Company] = relationship(
        "Company", back_populates="users"
    )
    supplier: Mapped[Optional[Supplier]] = relationship(
        "Supplier", back_populates="users"
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email!r}, role={self.role!r})>"
