"""
Email Attachment model — metadata for files extracted from emails.
Actual content stored in MinIO. Cascades on email_record deletion.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CompanyScopedMixin

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.email_message import EmailRecord


class EmailAttachment(Base, CompanyScopedMixin):
    """File attachment extracted from an inbound/outbound email."""

    __tablename__ = "email_attachments"

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
        ForeignKey("email_records.id", ondelete="CASCADE"),
        nullable=False,
    )

    # company_id provided by CompanyScopedMixin

    # ------------------------------------------------------------------
    # Fields
    # ------------------------------------------------------------------
    filename: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    content_type: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    file_size: Mapped[Optional[int]] = mapped_column(
        BigInteger, nullable=True
    )
    minio_bucket: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    minio_key: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    checksum_sha256: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True
    )

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    email_record: Mapped[EmailRecord] = relationship(
        "EmailRecord", back_populates="attachments"
    )
    company: Mapped[Company] = relationship("Company")

    def __repr__(self) -> str:
        return (
            f"<EmailAttachment(id={self.id}, "
            f"filename={self.filename!r}, "
            f"content_type={self.content_type!r})>"
        )
