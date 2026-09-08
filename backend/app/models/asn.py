"""
ASN Record model — Advanced Shipping Notification records.
Generated from shipment data, validated, and tracked through
the full ASN lifecycle.
Table name: asn_records (was 'asns' in the stub).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CompanyScopedMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.shipment import Shipment
    from app.models.supplier import Supplier
    from app.models.user import User


class ASNRecord(Base, TimestampMixin, CompanyScopedMixin):
    __tablename__ = "asn_records"

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
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=False
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    # ------------------------------------------------------------------
    # Core fields
    # ------------------------------------------------------------------
    asn_number: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False
    )
    xml_content: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    xml_validated: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="DRAFT"
    )
    sent_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP, nullable=True
    )
    accepted_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP, nullable=True
    )
    rejection_reason: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    shipment: Mapped[Shipment] = relationship(
        "Shipment", back_populates="asn_records"
    )
    company: Mapped[Company] = relationship("Company")
    supplier: Mapped[Supplier] = relationship(
        "Supplier", back_populates="asn_records"
    )
    creator: Mapped[Optional[User]] = relationship(
        "User", foreign_keys=[created_by]
    )

    def __repr__(self) -> str:
        return (
            f"<ASNRecord(id={self.id}, asn_number={self.asn_number!r}, "
            f"status={self.status!r})>"
        )
