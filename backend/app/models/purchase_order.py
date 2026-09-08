"""
Purchase Order model — core business entity.
PO number is the unique key tying admin and supplier data.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Date,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CompanyScopedMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.client import Client
    from app.models.company import Company
    from app.models.email_message import EmailRecord
    from app.models.po_history import POHistory
    from app.models.shipment_line import ShipmentLine
    from app.models.supplier import Supplier


class PurchaseOrder(Base, TimestampMixin, CompanyScopedMixin):
    """Purchase order — NOT soft-deletable, uses own id + timestamp mixin."""

    __tablename__ = "purchase_orders"
    __table_args__ = (
        UniqueConstraint(
            "company_id", "po_number", name="uq_po_company_number"
        ),
    )

    # ------------------------------------------------------------------
    # Primary key
    # ------------------------------------------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ------------------------------------------------------------------
    # Foreign keys
    # ------------------------------------------------------------------
    client_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id"), nullable=True
    )
    client_code: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )
    supplier_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=True
    )
    source_email_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("email_records.id"), nullable=True
    )

    # ------------------------------------------------------------------
    # Core fields
    # ------------------------------------------------------------------
    po_number: Mapped[str] = mapped_column(
        String(50), nullable=False
    )
    style_number: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    quantity: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )
    unit_price: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 4), nullable=True
    )
    total_value: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(14, 2), nullable=True
    )
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, server_default="USD"
    )
    delivery_date: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True
    )
    ship_date: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True
    )
    destination: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="ACTIVE"
    )
    version: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="1"
    )
    extra_data: Mapped[Optional[dict]] = mapped_column(
        JSONB, server_default="{}"
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    company: Mapped[Company] = relationship("Company")
    client: Mapped[Optional[Client]] = relationship(
        "Client", back_populates="purchase_orders"
    )
    supplier: Mapped[Optional[Supplier]] = relationship(
        "Supplier", back_populates="purchase_orders"
    )
    source_email: Mapped[Optional[EmailRecord]] = relationship("EmailRecord")
    history: Mapped[list[POHistory]] = relationship(
        "POHistory", back_populates="purchase_order"
    )
    shipment_lines: Mapped[list[ShipmentLine]] = relationship(
        "ShipmentLine", back_populates="purchase_order"
    )
