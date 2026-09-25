# backend/app/email/parsers/__init__.py
"""
Parser chain orchestrator.

Receives a DecodedEmail + ClassificationResult and routes to the
correct parser. Returns a list of ParsedPO dataclasses.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Optional

from app.email.classifier import ClassificationResult, EmailFormat
from app.email.mime_decoder import DecodedEmail

logger = logging.getLogger(__name__)


def normalize_po_number(po_str: Optional[str]) -> str:
    """
    Normalize PO number by stripping plant/order type prefix.

    Examples:
        'ZA6A-2001606637' -> '2001606637'
        'ZA6A - 2001606637' -> '2001606637'
        'IT01-2001606115' -> '2001606115'
        'PO-12345' -> '12345'
        '2001606637' -> '2001606637'
    """
    if not po_str:
        return ""
    s = str(po_str).strip()
    # Strip common Oniverse plant order type prefixes: e.g. ZA6A-, ZA6B-, IT01-, etc.
    m = re.match(r"^[A-Z0-9]{2,6}\s*[-–—_]\s*(\d{7,15})$", s, re.IGNORECASE)
    if m:
        return m.group(1)
    # Strip generic PO- prefix
    m_po = re.match(r"^(?:PO|P\.O\.)\s*[-#:\s]*(\w+)$", s, re.IGNORECASE)
    if m_po:
        return m_po.group(1)
    return s


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


DEFAULT_CURRENCY = "USD"


@dataclass
class ParsedPO:
    """Structured PO data extracted from an email."""
    po_number: str = ""
    order_type: str = ""
    supplier_code: str = ""
    supplier_name: str = ""
    buyer_name: str = ""
    order_date: str = ""
    delivery_date: str = ""
    destination: str = ""
    currency: str = DEFAULT_CURRENCY
    total_quantity: int = 0
    total_value: float = 0.0
    line_items: list[POLineItem] = field(default_factory=list)
    raw_source: str = ""  # "xml" or "html"
    source_filename: str = ""


def parse_html(
    html: str | bytes,
    subject: str = "",
    source_name: str = "",
) -> list[ParsedPO]:
    """
    Wrapper around html_parser.parse_html_document to conform to parser interface.
    """
    from app.email.parsers.html_parser import parse_html_document
    po = parse_html_document(html, subject=subject, source_name=source_name)
    if po:
        po.po_number = normalize_po_number(po.po_number)
    if po and (po.po_number or po.line_items or po.total_value > 0):
        return [po]
    return []


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
        One ParsedPO per PO found across XML attachments, HTML attachments, and HTML body.
    """
    from app.email.parsers.xml_parser import parse_xml
    from app.email.parsers.html_parser import parse_html_document

    results: list[ParsedPO] = []

    # 1. Parse XML attachments (authoritative)
    xml_indices = getattr(classification, "xml_attachment_indices", [])
    for idx in xml_indices:
        if 0 <= idx < len(decoded.attachments):
            att = decoded.attachments[idx]
            try:
                po = parse_xml(att.payload, att.filename)
                po.po_number = normalize_po_number(po.po_number)
                if po and (po.po_number or po.line_items):
                    results.append(po)
                    logger.info("XML parsed PO: %s from %s", po.po_number, att.filename)
            except Exception:
                logger.exception("XML parse failed for %s", att.filename)

    # 2. Parse HTML attachments
    html_indices = getattr(classification, "html_attachment_indices", [])
    for idx in html_indices:
        if 0 <= idx < len(decoded.attachments):
            att = decoded.attachments[idx]
            try:
                po = parse_html_document(
                    att.payload,
                    subject=decoded.subject,
                    source_name=att.filename,
                )
                if po:
                    po.po_number = normalize_po_number(po.po_number)
                if po and (po.po_number or po.line_items):
                    existing = next((p for p in results if p.po_number and p.po_number == po.po_number), None)
                    if existing:
                        # Enrich existing XML PO with HTML metadata if missing
                        if not existing.delivery_date and po.delivery_date:
                            existing.delivery_date = po.delivery_date
                        if not existing.buyer_name and po.buyer_name:
                            existing.buyer_name = po.buyer_name
                        if not existing.supplier_name and po.supplier_name:
                            existing.supplier_name = po.supplier_name
                        if not existing.order_date and po.order_date:
                            existing.order_date = po.order_date
                        if not existing.line_items and po.line_items:
                            existing.line_items = po.line_items
                        logger.info("Merged HTML attachment data into existing XML PO %s", existing.po_number)
                    else:
                        results.append(po)
                        logger.info("HTML attachment parsed PO: %s from %s", po.po_number, att.filename)
            except Exception:
                logger.exception("HTML attachment parse failed for %s", att.filename)

    # 3. Parse HTML body ONLY IF no attachments yielded line items or POs
    has_valid_attachment_po = any(p.line_items or p.total_quantity > 0 for p in results)
    if decoded.body_html and not has_valid_attachment_po:
        try:
            body_po = parse_html_document(
                decoded.body_html,
                subject=decoded.subject,
                source_name="email_body.html",
            )
            if body_po:
                body_po.po_number = normalize_po_number(body_po.po_number)
            # Only accept body PO if it actually has line items or non-zero quantity
            if body_po and (body_po.line_items or body_po.total_quantity > 0):
                existing = next((p for p in results if p.po_number and p.po_number == body_po.po_number), None)
                if not existing:
                    results.append(body_po)
                    logger.info("HTML body parsed PO: %s", body_po.po_number)
        except Exception:
            logger.exception("HTML body parse failed")

    # Compute totals if not already set and normalize PO numbers
    for po in results:
        po.po_number = normalize_po_number(po.po_number)
        if po.line_items and po.total_quantity == 0:
            po.total_quantity = sum(li.quantity for li in po.line_items)
        if po.line_items and po.total_value == 0.0:
            po.total_value = sum(li.quantity * li.unit_price for li in po.line_items)

    return results