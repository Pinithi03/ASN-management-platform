# backend/app/email/classifier.py
"""
Stage 3 — Email format classifier.

Inspects a DecodedEmail and decides whether PO data lives in an XML
attachment or in the HTML body, so the right parser is invoked.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from enum import Enum

from app.email.mime_decoder import DecodedEmail

logger = logging.getLogger(__name__)


class EmailFormat(str, Enum):
    """Detected format that determines which parser to use."""
    XML_ATTACHMENT = "XML_ATTACHMENT"
    HTML_ATTACHMENT = "HTML_ATTACHMENT"
    HTML_BODY = "HTML_BODY"
    MIXED = "MIXED"
    UNKNOWN = "UNKNOWN"


# File extensions and MIME types we treat as XML / HTML attachments
_XML_EXTENSIONS = (".xml",)
_XML_MIME_TYPES = ("application/xml", "text/xml")

_HTML_EXTENSIONS = (".html", ".htm")
_HTML_MIME_TYPES = ("text/html", "application/xhtml+xml")

# Automated / system / non-order senders that should always be rejected
_SYSTEM_SENDER_PATTERNS = (
    "no-reply@",
    "noreply@",
    "workspace-noreply@",
    "mailer-daemon@",
    "donotreply@",
    "notifications@",
    "account-security-noreply@",
    "@google.com",
    "@accounts.google.com",
    "@googlemail.com",
)

# Automated system subjects that should always be rejected
_SYSTEM_SUBJECT_KEYWORDS = (
    "security alert",
    "2-step verification",
    "verification code",
    "finish setting up",
    "exclusive access to ai",
    "password reset",
    "verify your email",
    "delivery status notification",
    "undelivered mail",
)

# Keywords in subject or body that hint at PO content
_PO_KEYWORDS = (
    "purchase order",
    "po number",
    "po#",
    "order confirmation",
    "order update",
    "new order",
    "updated order",
    "delivery schedule",
    "numero ordine",
    "fornitore",
    "buyer",
    "quantità",
    "quantity",
)

# Regex matching standard PO numbers (e.g. ZA6A-2001605039, PO-12345, Order #12345)
_PO_NUMBER_RE = re.compile(
    r"\b([A-Z0-9]{2,6}\s*[-–—]\s*\d{7,15})\b|"
    r"\b(?:PO|P\.O\.)\s*[-#:\s]*([\w\-/]{3,20})\b|"
    r"Purchase\s*Order\s*[-#:\s]*([\w\-/]{3,20})|"
    r"Order\s*(?:No\.?|Number|#)\s*[-:\s]*([\w\-/]{3,20})",
    re.IGNORECASE,
)


def is_system_or_automated_email(from_address: str, subject: str = "") -> bool:
    """Return True if email is an automated/system/no-reply notification."""
    from_lower = (from_address or "").lower()
    subj_lower = (subject or "").lower()

    if any(pat in from_lower for pat in _SYSTEM_SENDER_PATTERNS):
        return True
    if any(kw in subj_lower for kw in _SYSTEM_SUBJECT_KEYWORDS):
        return True
    return False


@dataclass
class ClassificationResult:
    """Result of email classification."""
    format: EmailFormat
    xml_attachment_indices: list[int]  # indices into DecodedEmail.attachments
    html_attachment_indices: list[int] = field(default_factory=list)  # indices into DecodedEmail.attachments
    confidence: str = "high"  # "high", "medium", "low"
    reason: str = ""


def classify(decoded: DecodedEmail) -> ClassificationResult:
    """
    Classify a decoded email to determine parsing strategy.

    Parameters
    ----------
    decoded : DecodedEmail
        Output from mime_decoder.decode().

    Returns
    -------
    ClassificationResult
        The detected format and which attachments contain XML/HTML.
    """

    xml_indices: list[int] = []
    html_indices: list[int] = []

    for i, att in enumerate(decoded.attachments):
        filename_lower = att.filename.lower()
        content_type_lower = att.content_type.lower()

        # Match XML by extension or MIME type
        if any(filename_lower.endswith(ext) for ext in _XML_EXTENSIONS) or content_type_lower in _XML_MIME_TYPES:
            xml_indices.append(i)
            continue

        if content_type_lower == "application/octet-stream" and filename_lower.endswith(".xml"):
            xml_indices.append(i)
            continue

        # Match HTML attachment by extension or MIME type (excluding inline images/plain body)
        if any(filename_lower.endswith(ext) for ext in _HTML_EXTENSIONS) or (
            content_type_lower in _HTML_MIME_TYPES and filename_lower.endswith((".html", ".htm"))
        ):
            html_indices.append(i)
            continue

        if content_type_lower == "application/octet-stream" and filename_lower.endswith((".html", ".htm")):
            html_indices.append(i)

    has_html_body = False
    html_body_reason = ""
    if decoded.body_html and not is_system_or_automated_email(decoded.from_address, decoded.subject):
        html_lower = decoded.body_html.lower()
        subject_lower = decoded.subject.lower()
        has_table = "<table" in html_lower
        has_po_number = bool(_PO_NUMBER_RE.search(decoded.body_html) or _PO_NUMBER_RE.search(decoded.subject))
        has_po_keyword = any(kw in html_lower or kw in subject_lower for kw in _PO_KEYWORDS)

        # Require actual PO number pattern or PO keywords with data tables
        if has_po_number or (has_po_keyword and has_table):
            has_html_body = True
            html_body_reason = "HTML body with valid PO number / order structure"

    # Determine combined format
    reasons = []
    if xml_indices:
        reasons.append(f"{len(xml_indices)} XML attachment(s)")
    if html_indices:
        reasons.append(f"{len(html_indices)} HTML attachment(s)")
    if has_html_body:
        reasons.append(html_body_reason)

    if (xml_indices and (html_indices or has_html_body)) or (html_indices and has_html_body):
        fmt = EmailFormat.MIXED
        conf = "high"
    elif xml_indices:
        fmt = EmailFormat.XML_ATTACHMENT
        conf = "high"
    elif html_indices:
        fmt = EmailFormat.HTML_ATTACHMENT
        conf = "high"
    elif has_html_body:
        fmt = EmailFormat.HTML_BODY
        conf = "medium" if "<table" in (decoded.body_html or "").lower() else "low"
    else:
        fmt = EmailFormat.UNKNOWN
        conf = "low"

    reason_str = ", ".join(reasons) if reasons else "No XML/HTML attachments or parseable order HTML"
    logger.info("Classified email as %s (%s)", fmt.value, reason_str)

    return ClassificationResult(
        format=fmt,
        xml_attachment_indices=xml_indices,
        html_attachment_indices=html_indices,
        confidence=conf,
        reason=reason_str,
    )


def validate_order_email(decoded: DecodedEmail) -> tuple[bool, str, ClassificationResult]:
    """
    Validate whether an email qualifies as an inbound order email to fetch & process.

    Rules:
    1. REJECT automated/no-reply/system notification emails (Google, security alerts, 2FA, etc.).
    2. PRIMARY: Emails with an attached XML file (.xml) are accepted (IUNGO / supplier XML).
    3. SECONDARY: If no XML attachment is present, only emails with HTML order attachments (.html)
       or valid HTML order bodies containing recognized PO numbers/order data are accepted.
    4. All other emails (non-order communications, random emails, unparseable bodies) are rejected.

    Returns:
    (is_valid: bool, reason: str, classification: ClassificationResult)
    """
    # 1. Reject system / no-reply messages immediately
    if is_system_or_automated_email(decoded.from_address, decoded.subject):
        reason = f"Automated/system email from {decoded.from_address} ('{decoded.subject}')"
        logger.info("[Order Validation] REJECTED: %s", reason)
        return (
            False,
            reason,
            ClassificationResult(
                format=EmailFormat.UNKNOWN,
                xml_attachment_indices=[],
                confidence="low",
                reason=reason,
            ),
        )

    classification = classify(decoded)

    # 2. Primary: XML attached email
    if classification.xml_attachment_indices:
        reason = f"Valid XML order email ({len(classification.xml_attachment_indices)} XML file(s))"
        logger.info("[Order Validation] ACCEPTED: %s", reason)
        return (True, reason, classification)

    # 3. Secondary: HTML attached email
    if classification.html_attachment_indices:
        reason = f"Valid HTML order attachment ({len(classification.html_attachment_indices)} HTML file(s))"
        logger.info("[Order Validation] ACCEPTED: %s", reason)
        return (True, reason, classification)

    # 4. Secondary: Valid HTML body with PO structure
    if classification.format == EmailFormat.HTML_BODY:
        reason = "Valid HTML order email (recognized PO structure in body)"
        logger.info("[Order Validation] ACCEPTED: %s", reason)
        return (True, reason, classification)

    # 5. Reject everything else
    reason = f"No XML attachment or valid HTML order found ('{decoded.subject}')"
    logger.info("[Order Validation] REJECTED: %s", reason)
    return (False, reason, classification)