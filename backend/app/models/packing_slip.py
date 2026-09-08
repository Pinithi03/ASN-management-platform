"""
Packing Slip model — one packing slip per box in a shipment.
Replaces the old handling_unit model.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CompanyScopedMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.shipment import Shipment


class PackingSlip(Base, TimestampMixin, CompanyScopedMixin):
    __tablename__ = "packing_slips"

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
        UUID(as_uuid=True), ForeignKey("shipments.id"), nullable=False
    )

    # ------------------------------------------------------------------
    # Core fields
    # ------------------------------------------------------------------
    slip_number: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False
    )
    box_number: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )
    hu_number: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )
    barcode_data: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )
    net_weight: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 3), nullable=True
    )
    gross_weight: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 3), nullable=True
    )
    dimensions: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="DRAFT"
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    shipment: Mapped[Shipment] = relationship(
        "Shipment", back_populates="packing_slips"
    )
    company: Mapped[Company] = relationship("Company")

    def __repr__(self) -> str:
        return (
            f"<PackingSlip(id={self.id}, slip_number={self.slip_number!r}, "
            f"shipment_id={self.shipment_id})>"
        )
