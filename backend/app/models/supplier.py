"""
Supplier model — external supplier organizations.
Can be registered with multiple plants via supplier_plants junction.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, SoftDeleteMixin

if TYPE_CHECKING:
    from app.models.supplier_plant import SupplierPlant
    from app.models.user import User
    from app.models.purchase_order import PurchaseOrder
    from app.models.shipment import Shipment
    from app.models.asn_record import ASNRecord


class Supplier(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "suppliers"

    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Business identifier
    supplier_code: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False
    )

    # Organization details
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_name: Mapped[Optional[str]] = mapped_column(String(200))
    phone: Mapped[Optional[str]] = mapped_column(String(50))
    address: Mapped[Optional[str]] = mapped_column(Text)
    country: Mapped[Optional[str]] = mapped_column(String(100))

    # --- Relationships ---
    plant_registrations: Mapped[list[SupplierPlant]] = relationship(
        "SupplierPlant", back_populates="supplier", cascade="all, delete-orphan"
    )
    users: Mapped[list[User]] = relationship(
        "User", back_populates="supplier"
    )
    purchase_orders: Mapped[list[PurchaseOrder]] = relationship(
        "PurchaseOrder", back_populates="supplier"
    )
    shipments: Mapped[list[Shipment]] = relationship(
        "Shipment", back_populates="supplier"
    )
    asn_records: Mapped[list[ASNRecord]] = relationship(
        "ASNRecord", back_populates="supplier"
    )

    def __repr__(self) -> str:
        return f"<Supplier(id={self.id}, code={self.supplier_code!r}, name={self.name!r})>"
