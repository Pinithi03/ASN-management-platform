"""
Client model — known buyers/brands per company.
Used by email classifier to identify senders and select parser templates.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, CompanyScopedMixin

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.purchase_order import PurchaseOrder


class Client(BaseModel, CompanyScopedMixin):
    """Known buyer/brand scoped to a company."""

    __tablename__ = "clients"
    __table_args__ = (
        UniqueConstraint(
            "company_id", "client_code", name="uq_clients_company_code"
        ),
    )

    # ------------------------------------------------------------------
    # Fields
    # ------------------------------------------------------------------
    client_code: Mapped[str] = mapped_column(
        String(50), nullable=False
    )
    client_name: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )
    email_patterns: Mapped[Optional[list[str]]] = mapped_column(
        ARRAY(Text), nullable=True
    )
    default_template_id: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    company: Mapped[Company] = relationship("Company")
    purchase_orders: Mapped[list[PurchaseOrder]] = relationship(
        "PurchaseOrder", back_populates="client"
    )
