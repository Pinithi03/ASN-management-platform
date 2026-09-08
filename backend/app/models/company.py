"""
Company model — root tenant table.
Each row represents one Oniverse plant. Stores IMAP/SMTP
connection details, MinIO bucket, and company-specific settings.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, SoftDeleteMixin

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.email_message import EmailRecord
    from app.models.client import Client
    from app.models.purchase_order import PurchaseOrder
    from app.models.shipment import Shipment
    from app.models.audit_log import AuditLog


class Company(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "companies"

    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Identity
    code: Mapped[str] = mapped_column(
        String(20), unique=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    # IMAP configuration (inbound emails from suppliers)
    imap_host: Mapped[Optional[str]] = mapped_column(String(255))
    imap_port: Mapped[int] = mapped_column(Integer, default=993)
    imap_username: Mapped[Optional[str]] = mapped_column(String(255))
    imap_password: Mapped[Optional[str]] = mapped_column(Text)  # Encrypted at rest
    imap_folder: Mapped[str] = mapped_column(String(100), default="INBOX")
    imap_poll_interval_seconds: Mapped[int] = mapped_column(Integer, default=120)
    imap_use_ssl: Mapped[bool] = mapped_column(Boolean, default=True)

    # SMTP configuration (outbound emails to suppliers)
    smtp_host: Mapped[Optional[str]] = mapped_column(String(255))
    smtp_port: Mapped[int] = mapped_column(Integer, default=587)
    smtp_username: Mapped[Optional[str]] = mapped_column(String(255))
    smtp_password: Mapped[Optional[str]] = mapped_column(Text)  # Encrypted at rest
    smtp_from_address: Mapped[Optional[str]] = mapped_column(String(255))
    smtp_use_tls: Mapped[bool] = mapped_column(Boolean, default=True)

    # MinIO storage
    minio_bucket: Mapped[Optional[str]] = mapped_column(String(100))

    # Flexible settings
    settings: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")

    # --- Relationships ---
    users: Mapped[list[User]] = relationship(
        "User", back_populates="company"
    )
    email_records: Mapped[list[EmailRecord]] = relationship(
        "EmailRecord", back_populates="company"
    )
    clients: Mapped[list[Client]] = relationship(
        "Client", back_populates="company"
    )
    purchase_orders: Mapped[list[PurchaseOrder]] = relationship(
        "PurchaseOrder", back_populates="company"
    )
    shipments: Mapped[list[Shipment]] = relationship(
        "Shipment", back_populates="company"
    )
    audit_logs: Mapped[list[AuditLog]] = relationship(
        "AuditLog", back_populates="company"
    )

    def __repr__(self) -> str:
        return f"<Company(id={self.id}, code={self.code!r}, name={self.name!r})>"
