"""
Parsed Data model — output of the parsing pipeline.
parser_used limited to 'XML' or 'HTML' (the only two parsers).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CompanyScopedMixin

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.email_message import EmailRecord


class ParsedData(Base, CompanyScopedMixin):
    """Output of the XML or HTML parsing pipeline for an email."""

    __tablename__ = "parsed_data"

    # ------------------------------------------------------------------
    # Primary key
    # ------------------------------------------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ------------------------------------------------------------------
    # Foreign keys
    # ------------------------------------------------------------------
    email_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("email_records.id"),
        nullable=False,
    )

    # company_id provided by CompanyScopedMixin

    # ------------------------------------------------------------------
    # Fields
    # ------------------------------------------------------------------
    parser_used: Mapped[str] = mapped_column(
        String(50), nullable=False
    )
    template_id: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    raw_extracted: Mapped[dict] = mapped_column(
        JSONB, nullable=False
    )
    normalized: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True
    )
    validation_errors: Mapped[list] = mapped_column(
        JSONB, nullable=False, server_default="[]"
    )
    po_number_extracted: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )
    supplier_id_extracted: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    email_record: Mapped[EmailRecord] = relationship(
        "EmailRecord", back_populates="parsed_data"
    )
    company: Mapped[Company] = relationship("Company")

    def __repr__(self) -> str:
        return (
            f"<ParsedData(id={self.id}, "
            f"parser_used={self.parser_used!r}, "
            f"po_number={self.po_number_extracted!r})>"
        )
