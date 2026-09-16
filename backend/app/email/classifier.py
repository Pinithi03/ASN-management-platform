# backend/app/email/classifier.py
"""
Stage 3 — Email format classifier.

Inspects a DecodedEmail and decides whether PO data lives in an XML
attachment or in the HTML body, so the right parser is invoked.
"""

from __future__ import annotations

import logging
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

# Keywords in subject or body that hint at PO content
_PO_KEYWORDS = (
    "purchase order",
    "po number",
    "po#",
    "order confirmation",
    "order update",
    "delivery schedule",
)


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
    if decoded.body_html:
        html_lower = decoded.body_html.lower()
        subject_lower = decoded.subject.lower()
        has_table = "<table" in html_lower
        has_po_keyword = any(kw in html_lower or kw in subject_lower for kw in _PO_KEYWORDS)
        if has_table or has_po_keyword:
            has_html_body = True
            html_body_reason = "HTML body with tables/PO keywords"

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
        conf = "medium" if "<table" in decoded.body_html.lower() else "low"
    else:
        fmt = EmailFormat.UNKNOWN
        conf = "low"

    reason_str = ", ".join(reasons) if reasons else "No XML/HTML attachments or parseable HTML body"
    logger.info("Classified email as %s (%s)", fmt.value, reason_str)

    return ClassificationResult(
        format=fmt,
        xml_attachment_indices=xml_indices,
        html_attachment_indices=html_indices,
        confidence=conf,
        reason=reason_str,
    )