"""
Parser Template model — defines how to extract data from XML or HTML.
content_type restricted to XML and HTML only (the two parsers).
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ARRAY, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.user import User


class ParserTemplate(BaseModel):
    __tablename__ = "parser_templates"

    # ------------------------------------------------------------------
    # Foreign keys (company_id is NULLABLE — NULL means global template)
    # ------------------------------------------------------------------
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id"), nullable=True
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    # ------------------------------------------------------------------
    # Core fields
    # ------------------------------------------------------------------
    template_code: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False
    )
    client_code: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )
    email_type: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )
    content_type: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True
    )
    field_mappings: Mapped[dict] = mapped_column(
        JSONB, nullable=False
    )
    required_fields: Mapped[Optional[list[str]]] = mapped_column(
        ARRAY(Text), nullable=True
    )
    validation_rules: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )
    version: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="1"
    )
    success_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    fail_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    company: Mapped[Optional[Company]] = relationship("Company")
    creator: Mapped[Optional[User]] = relationship(
        "User", foreign_keys=[created_by]
    )

    def __repr__(self) -> str:
        return (
            f"<ParserTemplate(id={self.id}, "
            f"template_code={self.template_code!r}, "
            f"content_type={self.content_type!r})>"
        )
