"""
Audit Log model — immutable, append-only audit trail.
Records every significant action in the system.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CompanyScopedMixin

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.user import User


class AuditLog(Base, CompanyScopedMixin):
    """Immutable audit log — no updated_at, no soft-delete."""

    __tablename__ = "audit_logs"

    # ------------------------------------------------------------------
    # Primary key
    # ------------------------------------------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ------------------------------------------------------------------
    # Foreign keys
    # ------------------------------------------------------------------
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    # ------------------------------------------------------------------
    # Core fields
    # ------------------------------------------------------------------
    action: Mapped[str] = mapped_column(
        String(50), nullable=False
    )
    entity_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    old_values: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True
    )
    new_values: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True
    )
    ip_address: Mapped[Optional[str]] = mapped_column(
        String(45), nullable=True
    )
    user_agent: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    # "metadata" is reserved in SQLAlchemy; use metadata_ as Python attr
    metadata_: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, server_default="{}"
    )

    # Append-only — own created_at, no updated_at
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP,
        nullable=False,
        server_default=func.now(),
        default=lambda: datetime.now(timezone.utc),
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    company: Mapped[Company] = relationship("Company")
    user: Mapped[Optional[User]] = relationship("User")

    def __repr__(self) -> str:
        return (
            f"<AuditLog(id={self.id}, action={self.action!r}, "
            f"entity_type={self.entity_type!r}, entity_id={self.entity_id})>"
        )
