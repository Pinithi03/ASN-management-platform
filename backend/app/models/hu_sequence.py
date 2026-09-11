"""
HUSequence model — per-supplier atomic sequence counter for 20-digit Handling Units (HUs).
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.supplier import Supplier


class HUSequence(Base, TimestampMixin):
    __tablename__ = "hu_sequences"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), unique=True, nullable=False, index=True
    )
    last_number: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False
    )

    # Relationships
    supplier: Mapped[Supplier] = relationship(
        "Supplier", backref="hu_sequence"
    )

    def __repr__(self) -> str:
        return f"<HUSequence(supplier_id={self.supplier_id}, last_number={self.last_number})>"
