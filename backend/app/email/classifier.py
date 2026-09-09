# backend/app/email/classifier.py
"""
Stage 3 — Email format classifier.

Inspects a DecodedEmail and decides whether PO data lives in an XML
attachment or in the HTML body, so the right parser is invoked.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum

from app.email.mime_decoder import DecodedEmail

logger = logging.getLogger(__name__)


class EmailFormat(str, Enum):
    """Detected format that determines which parser to use."""
    XML_ATTACHMENT = "XML_ATTACHMENT"
    HTML_BODY = "HTML_BODY"
    UNKNOWN = "UNKNOWN"


# File extensions and MIME types we treat as XML
_XML_EXTENSIONS = (".xml",)
_XML_MIME_TYPES = ("application/xml", "text/xml")

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
    confidence: str  # "high", "medium", "low"
    reason: str


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
        The detected format and which attachments (if any) contain XML.
    """

    # --- Check for XML attachments ---
    xml_indices: list[int] = []

    for i, att in enumerate(decoded.attachments):
        filename_lower = att.filename.lower()
        content_type_lower = att.content_type.lower()

        # Match by extension
        if any(filename_lower.endswith(ext) for ext in _XML_EXTENSIONS):
            xml_indices.append(i)
            continue

        # Match by MIME type
        if content_type_lower in _XML_MIME_TYPES:
            xml_indices.append(i)
            continue

        # application/octet-stream with .xml filename
        if content_type_lower == "application/octet-stream" and filename_lower.endswith(".xml"):
            xml_indices.append(i)

    if xml_indices:
        logger.info(
            "Classified as XML_ATTACHMENT (%d XML files found)",
            len(xml_indices),
        )
        return ClassificationResult(
            format=EmailFormat.XML_ATTACHMENT,
            xml_attachment_indices=xml_indices,
            confidence="high",
            reason=f"Found {len(xml_indices)} XML attachment(s)",
        )

    # --- Fallback: check HTML body for PO-like content ---
    if decoded.body_html:
        html_lower = decoded.body_html.lower()
        subject_lower = decoded.subject.lower()

        has_table = "<table" in html_lower
        has_po_keyword = any(
            kw in html_lower or kw in subject_lower
            for kw in _PO_KEYWORDS
        )

        if has_table and has_po_keyword:
            logger.info("Classified as HTML_BODY (table + PO keywords found)")
            return ClassificationResult(
                format=EmailFormat.HTML_BODY,
                xml_attachment_indices=[],
                confidence="medium",
                reason="HTML body contains table(s) with PO keywords",
            )

        if has_table:
            logger.info("Classified as HTML_BODY (table found, no PO keywords)")
            return ClassificationResult(
                format=EmailFormat.HTML_BODY,
                xml_attachment_indices=[],
                confidence="low",
                reason="HTML body contains table(s) but no PO keywords",
            )

    # --- Nothing matched ---
    logger.warning("Could not classify email: subject=%r", decoded.subject)
    return ClassificationResult(
        format=EmailFormat.UNKNOWN,
        xml_attachment_indices=[],
        confidence="low",
        reason="No XML attachments and no parseable HTML body found",
    )