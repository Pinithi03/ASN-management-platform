"""
SQLAlchemy ORM models.
Import all models here so Alembic can detect them.
"""

# Base classes and mixins
from app.models.base import Base, BaseModel, TimestampMixin, SoftDeleteMixin, CompanyScopedMixin

# Enums
from app.models.enums import (
    UserRole,
    EmailDirection,
    EmailStatus,
    EmailType,
    ParserType,
    POStatus,
    ShipmentStatus,
    ASNStatus,
    ChangeSource,
    AuditAction,
)

# Domain models — import order follows FK dependency chain
from app.models.company import Company
from app.models.supplier import Supplier
from app.models.supplier_plant import SupplierPlant
from app.models.user import User
from app.models.client import Client
from app.models.email_message import EmailRecord
from app.models.email_attachment import EmailAttachment
from app.models.parsed_data import ParsedData
from app.models.purchase_order import PurchaseOrder
from app.models.po_history import POHistory
from app.models.shipment import Shipment
from app.models.shipment_line import ShipmentLine
from app.models.packing_slip import PackingSlip
from app.models.asn import ASNRecord
from app.models.parser_template import ParserTemplate
from app.models.audit_log import AuditLog

__all__ = [
    # Base
    "Base",
    "BaseModel",
    "TimestampMixin",
    "SoftDeleteMixin",
    "CompanyScopedMixin",
    # Enums
    "UserRole",
    "EmailDirection",
    "EmailStatus",
    "EmailType",
    "ParserType",
    "POStatus",
    "ShipmentStatus",
    "ASNStatus",
    "ChangeSource",
    "AuditAction",
    # Models
    "Company",
    "Supplier",
    "SupplierPlant",
    "User",
    "Client",
    "EmailRecord",
    "EmailAttachment",
    "ParsedData",
    "PurchaseOrder",
    "POHistory",
    "Shipment",
    "ShipmentLine",
    "PackingSlip",
    "ASNRecord",
    "ParserTemplate",
    "AuditLog",
]
