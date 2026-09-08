"""
Supplier-Plant junction table — many-to-many mapping between
suppliers and companies/plants. Controls which plants a supplier
can access in the Supplier Portal.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.supplier import Supplier
    from app.models.company import Company


class SupplierPlant(Base):
    __tablename__ = "supplier_plants"
    __table_args__ = (
        UniqueConstraint("supplier_id", "company_id", name="uq_supplier_company"),
    )

    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Foreign keys
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("suppliers.id", ondelete="CASCADE"),
        nullable=False,
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False
    )

    # Denormalized from companies for convenience
    plant_code: Mapped[str] = mapped_column(String(20), nullable=False)

    # Activation
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Registration metadata
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    registered_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    # --- Relationships ---
    supplier: Mapped[Supplier] = relationship(
        "Supplier", back_populates="plant_registrations"
    )
    company: Mapped[Company] = relationship("Company")

    def __repr__(self) -> str:
        return (
            f"<SupplierPlant(id={self.id}, supplier_id={self.supplier_id}, "
            f"company_id={self.company_id}, plant_code={self.plant_code!r})>"
        )
