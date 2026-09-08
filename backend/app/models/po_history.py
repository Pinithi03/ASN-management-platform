"""
PO History model — full change history for purchase orders.
Append-only versioned changelog.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.purchase_order import PurchaseOrder
    from app.models.user import User


class POHistory(Base):
    """Append-only change log for a purchase order."""

    __tablename__ = "po_history"

    # ------------------------------------------------------------------
    # Primary key
    # ------------------------------------------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ------------------------------------------------------------------
    # Foreign keys
    # ------------------------------------------------------------------
    po_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("purchase_orders.id"), nullable=False
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False
    )
    source_email_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("email_records.id"), nullable=True
    )
    changed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    # ------------------------------------------------------------------
    # Fields
    # ------------------------------------------------------------------
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    changed_fields: Mapped[dict] = mapped_column(JSONB, nullable=False)
    change_source: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    purchase_order: Mapped[PurchaseOrder] = relationship(
        "PurchaseOrder", back_populates="history"
    )
    company: Mapped[Company] = relationship("Company")
    changed_by_user: Mapped[Optional[User]] = relationship(
        "User", foreign_keys=[changed_by]
    )
