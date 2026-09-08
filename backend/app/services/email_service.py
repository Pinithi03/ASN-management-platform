"""
Email service — persists parsed email data to the database.

Called by the Celery process_inbound_email task after successful
parsing. Maps ParsedPO dataclasses → SQLAlchemy model inserts.
"""

from __future__ import annotations

import logging
from dataclasses import asdict
from datetime import datetime, timezone, date as date_type
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.email_message import EmailRecord
from app.models.purchase_order import PurchaseOrder
from app.models.parsed_data import ParsedData
from app.email.mime_decoder import DecodedEmail
from app.email.classifier import ClassificationResult
from app.email.parsers import ParsedPO

logger = logging.getLogger(__name__)


def _parse_date(value) -> Optional[date_type]:
    """Convert a date string to datetime.date, or return None."""
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date_type):
        return value
    if not isinstance(value, str):
        return None
    for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except (ValueError, TypeError):
            continue
    logger.warning("Could not parse date: %r", value)
    return None


async def save_email_record(
    db: AsyncSession,
    decoded: DecodedEmail,
    classification: ClassificationResult,
    company_id: str,
    status: str = "PARSED",
    error_message: Optional[str] = None,
) -> EmailRecord:
    """
    Save an inbound email record to the database.

    Parameters
    ----------
    db : AsyncSession
    decoded : DecodedEmail
    classification : ClassificationResult
    company_id : str
        The plant/company this email belongs to.
    status : str
        EmailStatus value: QUEUED, PROCESSING, PARSED, ERROR, etc.
    error_message : str, optional

    Returns
    -------
    EmailRecord
    """
    record = EmailRecord(
        company_id=company_id,
        direction="INBOUND",
        from_address=decoded.from_address,
        to_address=decoded.to_address,
        subject=decoded.subject,
        body_text=decoded.body_text[:5000] if decoded.body_text else None,
        body_html=decoded.body_html[:50000] if decoded.body_html else None,
        message_id=decoded.message_id,
        status=status,
        email_type=classification.format.value,
        error_message=error_message,
        received_at=datetime.now(timezone.utc),
    )

    db.add(record)
    await db.flush()
    logger.info("Saved email record: id=%s, subject=%r", record.id, record.subject)
    return record


async def save_parsed_data(
    db: AsyncSession,
    parsed_po: ParsedPO,
    email_record_id: str,
    company_id: str,
) -> ParsedData:
    """
    Save the raw parsed output to the parsed_data table as JSONB.

    Parameters
    ----------
    db : AsyncSession
    parsed_po : ParsedPO
    email_record_id : str
    company_id : str

    Returns
    -------
    ParsedData
    """
    # Convert dataclass to dict for JSONB storage
    raw_dict = asdict(parsed_po)

    parsed = ParsedData(
        email_record_id=email_record_id,
        company_id=company_id,
        parser_used=parsed_po.raw_source.upper() or "XML",
        raw_extracted=raw_dict,
        normalized={
            "po_number": parsed_po.po_number,
            "supplier_code": parsed_po.supplier_code,
            "supplier_name": parsed_po.supplier_name,
            "currency": parsed_po.currency,
            "total_quantity": parsed_po.total_quantity,
            "total_value": parsed_po.total_value,
            "line_count": len(parsed_po.line_items),
        },
        validation_errors=[],
        po_number_extracted=parsed_po.po_number or None,
        supplier_id_extracted=parsed_po.supplier_code or None,
    )

    db.add(parsed)
    await db.flush()
    logger.info(
        "Saved parsed data: id=%s, parser=%s, po=%s",
        parsed.id, parsed.parser_used, parsed.po_number_extracted,
    )
    return parsed


async def save_purchase_order(
    db: AsyncSession,
    parsed_po: ParsedPO,
    email_record_id: str,
    company_id: str,
    supplier_id: Optional[str] = None,
) -> PurchaseOrder:
    """
    Upsert a purchase order from parsed data.

    If a PO with the same po_number already exists for this company,
    it updates the existing record (new version). Otherwise creates new.

    Parameters
    ----------
    db : AsyncSession
    parsed_po : ParsedPO
    email_record_id : str
    company_id : str
    supplier_id : str, optional

    Returns
    -------
    PurchaseOrder
    """
    # Check if PO already exists
    stmt = select(PurchaseOrder).where(
        PurchaseOrder.company_id == company_id,
        PurchaseOrder.po_number == parsed_po.po_number,
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        # Update existing PO — increment version
        existing.version = (existing.version or 1) + 1
        existing.status = "UPDATED"
        existing.quantity = parsed_po.total_quantity
        existing.total_value = parsed_po.total_value
        existing.destination = parsed_po.destination or existing.destination
        existing.delivery_date = _parse_date(parsed_po.delivery_date) or existing.delivery_date
        existing.currency = parsed_po.currency
        existing.source_email_id = email_record_id

        po = existing
        logger.info("Updated PO: %s (v%d)", po.po_number, po.version)
    else:
        # Create new PO
        po = PurchaseOrder(
            company_id=company_id,
            supplier_id=supplier_id,
            po_number=parsed_po.po_number,
            status="ACTIVE",
            quantity=parsed_po.total_quantity,
            total_value=parsed_po.total_value,
            destination=parsed_po.destination,
            delivery_date=_parse_date(parsed_po.delivery_date),
            currency=parsed_po.currency,
            version=1,
            source_email_id=email_record_id,
        )
        db.add(po)
        logger.info("Created PO: %s", po.po_number)

    await db.flush()
    return po


async def process_and_save(
    db: AsyncSession,
    decoded: DecodedEmail,
    classification: ClassificationResult,
    parsed_pos: list[ParsedPO],
    company_id: str,
) -> dict:
    """
    Full persistence — save email record + parsed data + POs.

    Parameters
    ----------
    db : AsyncSession
    decoded : DecodedEmail
    classification : ClassificationResult
    parsed_pos : list[ParsedPO]
    company_id : str

    Returns
    -------
    dict
        Summary with email_record_id, parsed_data_ids, and PO ids.
    """
    try:
        # 1. Save the email record
        status = "PARSED" if parsed_pos else "REVIEW"
        email_record = await save_email_record(
            db, decoded, classification, company_id, status=status,
        )

        # 2. Save each parsed PO → parsed_data + purchase_orders
        po_ids = []
        parsed_data_ids = []
        for parsed_po in parsed_pos:
            # Save raw parsed output as JSONB
            pd = await save_parsed_data(
                db,
                parsed_po,
                email_record_id=str(email_record.id),
                company_id=company_id,
            )
            parsed_data_ids.append(str(pd.id))

            # Upsert the purchase order
            po = await save_purchase_order(
                db,
                parsed_po,
                email_record_id=str(email_record.id),
                company_id=company_id,
            )
            po_ids.append(str(po.id))

        await db.commit()

        return {
            "email_record_id": str(email_record.id),
            "parsed_data_ids": parsed_data_ids,
            "purchase_order_ids": po_ids,
            "po_count": len(po_ids),
        }
    except Exception as e:
        await db.rollback()
        logger.error("Failed to persist email data: %s", e)
        raise