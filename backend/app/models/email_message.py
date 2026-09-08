"""
Email Record model — every email fetched from IMAP or sent via SMTP.
Table renamed from email_messages to email_records per KB 05.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CompanyScopedMixin

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.email_attachment import EmailAttachment
    from app.models.parsed_data import ParsedData
    from app.models.supplier import Supplier
    from app.models.user import User


class EmailRecord(Base, CompanyScopedMixin):
    """Inbound or outbound email record, scoped to a company."""

    __tablename__ = "email_records"
    __table_args__ = (
        UniqueConstraint(
            "company_id", "message_id", name="uq_email_company_message"
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
    supplier_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=True
    )
    processed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    # ------------------------------------------------------------------
    # Email identification
    # ------------------------------------------------------------------
    message_id: Mapped[str] = mapped_column(
        String(500), nullable=False
    )
    from_address: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    to_address: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    subject: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    body_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    body_html: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ------------------------------------------------------------------
    # Timestamps
    # ------------------------------------------------------------------
    received_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )
    processed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    # ------------------------------------------------------------------
    # Status and classification
    # ------------------------------------------------------------------
    direction: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default="INBOUND"
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="QUEUED"
    )
    email_type: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )
    error_message: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    retry_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    company: Mapped[Company] = relationship("Company")
    supplier: Mapped[Optional[Supplier]] = relationship("Supplier")
    processed_by_user: Mapped[Optional[User]] = relationship(
        "User", foreign_keys=[processed_by]
    )
    attachments: Mapped[list[EmailAttachment]] = relationship(
        "EmailAttachment",
        back_populates="email_record",
        cascade="all, delete-orphan",
    )
    parsed_data: Mapped[list[ParsedData]] = relationship(
        "ParsedData", back_populates="email_record"
    )
