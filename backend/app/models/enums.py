"""
Shared enums for the ANS Management Platform.

All status and type enums used across models are defined here
for consistency and single-source-of-truth.
"""

import enum


class UserRole(str, enum.Enum):
    """Portal roles — matches Keycloak realm roles."""
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    SUPPLIER = "SUPPLIER"

    # Legacy aliases for migration (old DB rows may still have these)
    @classmethod
    def _missing_(cls, value: str):
        """Map legacy role names to the portal roles."""
        _LEGACY = {
            "COMPANY_ADMIN": cls.ADMIN,
            "OPERATOR": cls.ADMIN,
            "REVIEWER": cls.ADMIN,
            "VIEWER": cls.ADMIN,
        }
        return _LEGACY.get(value)


ROLE_PERMISSIONS: dict[str, list[str]] = {
    "SUPER_ADMIN": ["*"],
    "ADMIN": ["*"],
    "SUPPLIER": [
        "supplier:own_po",
        "supplier:own_shipment",
        "supplier:own_asn",
        "supplier:own_profile",
        "supplier:own_email",
    ],
}


class EmailDirection(str, enum.Enum):
    """Direction of an email record."""
    INBOUND = "INBOUND"    # From supplier, polled via IMAP
    OUTBOUND = "OUTBOUND"  # To supplier, sent via SMTP


class EmailStatus(str, enum.Enum):
    """Processing status of an email record."""
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    PARSED = "PARSED"
    COMMITTED = "COMMITTED"
    SENT = "SENT"          # Used for outbound emails
    ERROR = "ERROR"


class EmailType(str, enum.Enum):
    """Classification of email content."""
    PO_UPDATE = "PO_UPDATE"
    SHIPMENT_XML = "SHIPMENT_XML"
    AMENDMENT = "AMENDMENT"
    GENERAL = "GENERAL"
    UNKNOWN = "UNKNOWN"


class ParserType(str, enum.Enum):
    """Only two parsers: XML (lxml/XPath) and HTML (BeautifulSoup)."""
    XML = "XML"
    HTML = "HTML"


class POStatus(str, enum.Enum):
    """Purchase order lifecycle status."""
    ACTIVE = "ACTIVE"
    PARTIAL = "PARTIAL"
    UPDATED = "UPDATED"
    XML_SENT = "XML_SENT"
    SHIPMENT_RECEIVED = "SHIPMENT_RECEIVED"
    SHIPPED = "SHIPPED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"


class ShipmentStatus(str, enum.Enum):
    """Shipment lifecycle status."""
    DRAFT = "DRAFT"
    PACKING = "PACKING"
    PACKED = "PACKED"
    XML_SENT = "XML_SENT"
    RECEIVED = "RECEIVED"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    DISPATCHED = "DISPATCHED"
    DELIVERED = "DELIVERED"


class ASNStatus(str, enum.Enum):
    """ASN record lifecycle status (per KB 09)."""
    DRAFT = "DRAFT"
    VALIDATED = "VALIDATED"
    XML_SENT = "XML_SENT"
    SUBMITTED = "SUBMITTED"
    RECEIVED = "RECEIVED"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    FAILED = "FAILED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class ChangeSource(str, enum.Enum):
    """Source of a PO change for po_history."""
    EMAIL_AUTO = "EMAIL_AUTO"
    MANUAL = "MANUAL"
    SYSTEM = "SYSTEM"
    XML_SEND = "XML_SEND"


class AuditAction(str, enum.Enum):
    """Audit log action types."""
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    EMAIL_RECEIVED = "EMAIL_RECEIVED"
    EMAIL_PARSED = "EMAIL_PARSED"
    EMAIL_SENT = "EMAIL_SENT"
    SHIPMENT_CREATED = "SHIPMENT_CREATED"
    ASN_SENT = "ASN_SENT"
    ASN_ACCEPTED = "ASN_ACCEPTED"
    SUPPLIER_REGISTERED = "SUPPLIER_REGISTERED"
    SUPPLIER_UPDATED = "SUPPLIER_UPDATED"
    CONFIG_CHANGED = "CONFIG_CHANGED"
    TEMPLATE_UPDATED = "TEMPLATE_UPDATED"
