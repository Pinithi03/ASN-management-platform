# backend/app/email/parsers/__init__.py
"""
Parser chain orchestrator.

Receives a DecodedEmail + ClassificationResult and routes to the
correct parser. Returns a list of ParsedPO dataclasses.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

from app.email.classifier import ClassificationResult, EmailFormat
from app.email.mime_decoder import DecodedEmail

logger = logging.getLogger(__name__)


@dataclass
class POLineItem:
    """Single line item inside a purchase order."""
    line_number: int = 0
    style: str = ""
    color: str = ""
    size: str = ""
    quantity: int = 0
    unit_price: float = 0.0
    description: str = ""


@dataclass
class ParsedPO:
    """Structured PO data extracted from an email."""
    po_number: str = ""
    supplier_code: str = ""
    supplier_name: str = ""
    buyer_name: str = ""
    order_date: str = ""
    delivery_date: str = ""
    destination: str = ""
    currency: str = "USD"
    total_quantity: int = 0
    total_value: float = 0.0
    line_items: list[POLineItem] = field(default_factory=list)
    raw_source: str = ""  # "xml" or "html"
    source_filename: str = ""


def parse(
    decoded: DecodedEmail,
    classification: ClassificationResult,
) -> list[ParsedPO]:
    """
    Run the appropriate parser based on classification.

    Parameters
    ----------
    decoded : DecodedEmail
        MIME-decoded email.
    classification : ClassificationResult
        Output from classifier.classify().

    Returns
    -------
    list[ParsedPO]
        One ParsedPO per PO found (an XML file may contain one PO,
        an HTML body might reference multiple).
    """
    # Lazy imports to avoid circular deps
    from app.email.parsers.xml_parser import parse_xml
    from app.email.parsers.html_parser import parse_html

    results: list[ParsedPO] = []

    if classification.format == EmailFormat.XML_ATTACHMENT:
        for idx in classification.xml_attachment_indices:
            att = decoded.attachments[idx]
            try:
                po = parse_xml(att.payload, att.filename)
                results.append(po)
                logger.info("XML parsed PO: %s from %s", po.po_number, att.filename)
            except Exception:
                logger.exception("XML parse failed for %s, trying HTML fallback", att.filename)

        # If all XML parsing failed, try HTML fallback
        if not results and decoded.body_html:
            logger.info("All XML parsing failed — falling back to HTML body")
            results = parse_html(decoded.body_html, subject=decoded.subject)

    elif classification.format == EmailFormat.HTML_BODY:
        results = parse_html(decoded.body_html, subject=decoded.subject)

    else:
        logger.warning("UNKNOWN format — no parser applicable")

    # Compute totals if not already set
    for po in results:
        if po.line_items and po.total_quantity == 0:
            po.total_quantity = sum(li.quantity for li in po.line_items)
        if po.line_items and po.total_value == 0.0:
            po.total_value = sum(li.quantity * li.unit_price for li in po.line_items)

    return results