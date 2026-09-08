"""
Shipment model — physical shipments created by suppliers
via the 4-step wizard in the Supplier Portal.
"""

from __future__ import annotations

import datetime
import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, CompanyScopedMixin

if TYPE_CHECKING:
    from app.models.asn_record import ASNRecord
    from app.models.company import Company
    from app.models.packing_slip import PackingSlip
    from app.models.shipment_line import ShipmentLine
    from app.models.supplier import Supplier
    from app.models.user import User


class Shipment(Base, TimestampMixin, CompanyScopedMixin):
    """A physical shipment created through the supplier portal wizard."""

    __tablename__ = "shipments"

    # ------------------------------------------------------------------
    # Primary key
    # ------------------------------------------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ------------------------------------------------------------------
    # Foreign keys
    # ------------------------------------------------------------------
    # company_id provided by CompanyScopedMixin

    supplier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("suppliers.id"),
        nullable=False,
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )

    # ------------------------------------------------------------------
    # Fields
    # ------------------------------------------------------------------
    shipment_number: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False
    )
    plant_code: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True
    )
    storage_location: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="DRAFT"
    )
    total_boxes: Mapped[int] = mapped_column(
        Integer, default=0
    )
    total_pieces: Mapped[int] = mapped_column(
        Integer, default=0
    )
    ship_date: Mapped[Optional[datetime.date]] = mapped_column(
        Date, nullable=True
    )
    estimated_arrival: Mapped[Optional[datetime.date]] = mapped_column(
        Date, nullable=True
    )
    carrier: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    tracking_number: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )

    # created_at, updated_at provided by TimestampMixin

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    company: Mapped[Company] = relationship("Company")
    supplier: Mapped[Supplier] = relationship(
        "Supplier", back_populates="shipments"
    )
    creator: Mapped[Optional[User]] = relationship(
        "User", foreign_keys=[created_by]
    )
    lines: Mapped[list[ShipmentLine]] = relationship(
        "ShipmentLine",
        back_populates="shipment",
        cascade="all, delete-orphan",
    )
    packing_slips: Mapped[list[PackingSlip]] = relationship(
        "PackingSlip", back_populates="shipment"
    )
    asn_records: Mapped[list[ASNRecord]] = relationship(
        "ASNRecord", back_populates="shipment"
    )

    def __repr__(self) -> str:
        return (
            f"<Shipment(id={self.id}, "
            f"number={self.shipment_number!r}, "
            f"status={self.status!r})>"
        )
