"""
Shipment Line model — individual line items within a shipment.
Cascades on shipment deletion.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CompanyScopedMixin

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.purchase_order import PurchaseOrder
    from app.models.shipment import Shipment


class ShipmentLine(Base, CompanyScopedMixin):
    """A single line item within a shipment."""

    __tablename__ = "shipment_lines"

    # ------------------------------------------------------------------
    # Primary key
    # ------------------------------------------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ------------------------------------------------------------------
    # Foreign keys
    # ------------------------------------------------------------------
    shipment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shipments.id", ondelete="CASCADE"),
        nullable=False,
    )

    # company_id provided by CompanyScopedMixin

    po_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("purchase_orders.id"),
        nullable=True,
    )

    # ------------------------------------------------------------------
    # Fields
    # ------------------------------------------------------------------
    po_number: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )
    po_line_number: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )
    material_number: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )
    material_description: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    style_number: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )
    color_code: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True
    )
    size: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True
    )
    quantity: Mapped[int] = mapped_column(
        Integer, nullable=False
    )
    unit_of_measure: Mapped[str] = mapped_column(
        String(10), default="PC"
    )

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    shipment: Mapped[Shipment] = relationship(
        "Shipment", back_populates="lines"
    )
    company: Mapped[Company] = relationship("Company")
    purchase_order: Mapped[Optional[PurchaseOrder]] = relationship(
        "PurchaseOrder", back_populates="shipment_lines"
    )

    def __repr__(self) -> str:
        return (
            f"<ShipmentLine(id={self.id}, "
            f"po_number={self.po_number!r}, "
            f"material={self.material_number!r}, "
            f"qty={self.quantity})>"
        )
