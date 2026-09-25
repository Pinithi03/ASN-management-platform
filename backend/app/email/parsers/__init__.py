"""
Email parsing package for the ANS Management Platform.

Dispatches decoded email content (attachments and HTML body) to the
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
    m = re.match(r"^[A-Z0-9]{2,6}\s*[-–—_]\s*(\d{7,15})$", s, re.IGNORECASE)
    if m:
        return m.group(1)
    m_po = re.match(r"^(?:PO|P\.O\.)\s*[-#:\s]*(\w+)$", s, re.IGNORECASE)
    if m_po:
        return m_po.group(1)
    return s


def is_same_po(a: str, b: str) -> bool:
    if not a or not b:
        return False
    clean_a = normalize_po_number(a)
    clean_b = normalize_po_number(b)
    if clean_a == clean_b:
        return True
    digits_a = "".join(filter(str.isdigit, a))
    digits_b = "".join(filter(str.isdigit, b))
    return bool(digits_a and digits_b and (digits_a == digits_b or digits_a in digits_b or digits_b in digits_a))


@dataclass
class POLineItem:
    """Single line item inside a purchase order."""
    line_number: int = 1
    order_line_number: str = ""
    style: str = ""
    partner_code: str = ""
    color: str = ""
    size: str = ""
    uom: str = "M"
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
    raw_source: str = "unknown"
    source_filename: str = ""


def parse_xml(xml_bytes: bytes, filename: str = "") -> ParsedPO:
    from app.email.parsers.xml_parser import parse_xml as _parse_xml
    return _parse_xml(xml_bytes, filename)


def parse_xml_all(xml_bytes: bytes, filename: str = "") -> list[ParsedPO]:
    from app.email.parsers.xml_parser import parse_xml_all as _parse_xml_all
    return _parse_xml_all(xml_bytes, filename)


def parse_html(
    html: str,
    subject: str = "",
    source_name: str = "",
) -> list[ParsedPO]:
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
    Parse a decoded email into structured ParsedPO objects.
    """
    from app.email.parsers.xml_parser import parse_xml_all
    from app.email.parsers.html_parser import parse_html_document

    results: list[ParsedPO] = []

    # 1. Parse XML attachments (authoritative)
    xml_indices = getattr(classification, "xml_attachment_indices", [])
    for idx in xml_indices:
        if 0 <= idx < len(decoded.attachments):
            att = decoded.attachments[idx]
            try:
                pos = parse_xml_all(att.payload, att.filename)
                for po in pos:
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
                payload = att.payload.decode("utf-8", errors="replace") if isinstance(att.payload, bytes) else att.payload
                po = parse_html_document(
                    payload,
                    subject=decoded.subject,
                    source_name=att.filename,
                )
                if po:
                    po.po_number = normalize_po_number(po.po_number)
                if po and (po.po_number or po.line_items):
                    existing = next((p for p in results if is_same_po(p.po_number, po.po_number)), None)
                    if existing:
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
                    elif not results:
                        results.append(po)
                        logger.info("HTML attachment parsed PO: %s from %s", po.po_number, att.filename)
                    else:
                        if po.line_items and po.total_quantity > 0:
                            results.append(po)
                            logger.info("HTML attachment parsed additional PO: %s from %s", po.po_number, att.filename)
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
            if body_po and (body_po.line_items or body_po.total_quantity > 0):
                existing = next((p for p in results if is_same_po(p.po_number, body_po.po_number)), None)
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
            po.total_value = round(sum(li.quantity * li.unit_price for li in po.line_items), 2)

    return results
