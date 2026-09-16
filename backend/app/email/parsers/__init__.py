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


DEFAULT_CURRENCY = "USD"


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

    # 1. Parse XML attachments
    xml_indices = getattr(classification, "xml_attachment_indices", [])
    for idx in xml_indices:
        if 0 <= idx < len(decoded.attachments):
            att = decoded.attachments[idx]
            try:
                po = parse_xml(att.payload, att.filename)
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
                if po and (po.po_number or po.line_items):
                    results.append(po)
                    logger.info("HTML attachment parsed PO: %s from %s", po.po_number, att.filename)
            except Exception:
                logger.exception("HTML attachment parse failed for %s", att.filename)

    # 3. Parse HTML body if no XML results or if HTML body format/mixed
    if decoded.body_html and (
        not results
        or classification.format in (EmailFormat.HTML_BODY, EmailFormat.MIXED)
    ):
        try:
            body_po = parse_html_document(
                decoded.body_html,
                subject=decoded.subject,
                source_name="email_body.html",
            )
            if body_po and (body_po.po_number or body_po.line_items):
                # Avoid duplicate if same PO number was already parsed from XML with line items
                existing_po = next((p for p in results if p.po_number and p.po_number == body_po.po_number), None)
                if not existing_po:
                    results.append(body_po)
                    logger.info("HTML body parsed PO: %s", body_po.po_number)
                else:
                    # Enrich existing PO if body has missing fields
                    if not existing_po.delivery_date and body_po.delivery_date:
                        existing_po.delivery_date = body_po.delivery_date
                    if not existing_po.order_date and body_po.order_date:
                        existing_po.order_date = body_po.order_date
                    if not existing_po.line_items and body_po.line_items:
                        existing_po.line_items = body_po.line_items
                    logger.info("Enriched XML PO %s with HTML body data", existing_po.po_number)
        except Exception:
            logger.exception("HTML body parse failed")

    # Compute totals if not already set
    for po in results:
        if po.line_items and po.total_quantity == 0:
            po.total_quantity = sum(li.quantity for li in po.line_items)
        if po.line_items and po.total_value == 0.0:
            po.total_value = sum(li.quantity * li.unit_price for li in po.line_items)

    return results