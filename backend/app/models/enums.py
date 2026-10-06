"""
Shared enums for the ANS Management Platform.

All status and type enums used across models are defined here
for consistency and single-source-of-truth.
"""

import enum


class UserRole(str, enum.Enum):
    """RBAC Roles for Oniverse Multi-tenant Platform."""
    SUPER_ADMIN = "SUPER_ADMIN"
    COMPANY_ADMIN = "COMPANY_ADMIN"
    OPERATOR = "OPERATOR"
    REVIEWER = "REVIEWER"
    VIEWER = "VIEWER"
    SUPPLIER = "SUPPLIER"


ROLE_PERMISSIONS: dict[str, list[str]] = {
    "SUPER_ADMIN": ["*"],
    "COMPANY_ADMIN": [
        "po:read", "po:write",
        "supplier:read", "supplier:write", "supplier:credentials",
        "email:read", "email:reprocess",
        "asn:read", "asn:write",
        "user:read", "user:write",
        "audit:read",
    ],
    "OPERATOR": [
        "po:read", "po:write",
        "supplier:read",
        "asn:read", "asn:write",
        "shipment:read", "shipment:write",
    ],
    "REVIEWER": [
        "po:read", "email:read", "asn:read", "audit:read",
    ],
    "VIEWER": [
        "po:read", "shipment:read", "asn:read",
    ],
    "SUPPLIER": [
        "supplier:own_po",
        "supplier:own_shipment",
        "supplier:own_asn",
        "supplier:own_profile",
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
    XML_SENT = "XML_SENT"              # PO update XML sent to supplier
    SHIPMENT_RECEIVED = "SHIPMENT_RECEIVED"  # Supplier shipment XML received
    SHIPPED = "SHIPPED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"


class ShipmentStatus(str, enum.Enum):
    """Shipment lifecycle status."""
    DRAFT = "DRAFT"
    PACKING = "PACKING"
    PACKED = "PACKED"
    XML_SENT = "XML_SENT"      # Shipment XML emailed to admin
    RECEIVED = "RECEIVED"      # Admin received the XML
    ACCEPTED = "ACCEPTED"      # Admin accepted
    REJECTED = "REJECTED"      # Admin rejected
    DISPATCHED = "DISPATCHED"
    DELIVERED = "DELIVERED"


class ASNStatus(str, enum.Enum):
    """ASN record lifecycle status (per KB 09)."""
    DRAFT = "DRAFT"            # Supplier created, not yet validated
    VALIDATED = "VALIDATED"    # Passed schema/business validation
    XML_SENT = "XML_SENT"     # ASN XML emailed to admin
    SUBMITTED = "SUBMITTED"   # Admin forwarded to IUNGO/SAP
    RECEIVED = "RECEIVED"     # Admin acknowledged receipt
    ACCEPTED = "ACCEPTED"     # Accepted by admin/IUNGO
    REJECTED = "REJECTED"     # Rejected by admin/IUNGO
    FAILED = "FAILED"         # System failure during processing
    COMPLETED = "COMPLETED"   # IUNGO/SAP confirmed, goods shipped
    CANCELLED = "CANCELLED"   # Cancelled by supplier or admin


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
