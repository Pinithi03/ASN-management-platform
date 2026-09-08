"""
Shared enums for the ANS Management Platform.

All status and type enums used across models are defined here
for consistency and single-source-of-truth.
"""

import enum


class UserRole(str, enum.Enum):
    """Two roles only: plant admin or external supplier."""
    COMPANY_ADMIN = "COMPANY_ADMIN"
    SUPPLIER = "SUPPLIER"


class EmailDirection(str, enum.Enum):
    """Direction of an email record."""
    INBOUND = "INBOUND"    # From supplier, polled via IMAP
    OUTBOUND = "OUTBOUND"  # To supplier, sent via SMTP


class EmailStatus(str, enum.Enum):
    """Processing status of an email record."""
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    PARSED = "PARSED"
    REVIEW = "REVIEW"
    COMMITTED = "COMMITTED"
    REJECTED = "REJECTED"
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
    EMAIL_REVIEW = "EMAIL_REVIEW"
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
