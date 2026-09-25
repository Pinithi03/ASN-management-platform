"""
Email service — persists parsed email data to the database.

Called by the Celery process_inbound_email task after successful
parsing. Maps ParsedPO dataclasses → SQLAlchemy model inserts.
"""

from __future__ import annotations

import email.utils
import hashlib
import logging
from dataclasses import asdict
from datetime import datetime, timezone, date as date_type
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.email_message import EmailRecord
from app.models.purchase_order import PurchaseOrder
from app.models.parsed_data import ParsedData
from app.models.email_attachment import EmailAttachment
from app.models.supplier import Supplier
from app.email.mime_decoder import DecodedEmail
from app.email.classifier import ClassificationResult
from app.email.parsers import ParsedPO, normalize_po_number

logger = logging.getLogger(__name__)

# The complete original message is stored next to the extracted attachments so
# the dashboard can always show exactly what was received, including any parts
# the MIME decoder does not pull out as attachments.
ORIGINAL_EML_FILENAME = "original_message.eml"
ORIGINAL_EML_CONTENT_TYPE = "message/rfc822"


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
    if decoded.message_id:
        existing = await db.execute(
            select(EmailRecord).where(
                EmailRecord.company_id == company_id,
                EmailRecord.message_id == decoded.message_id,
            )
        )
        record = existing.scalar_one_or_none()
        if record:
            record.status = status
            record.email_type = classification.format.value
            record.error_message = error_message
            # Bodies are stored in full so the dashboard can show the complete email
            if decoded.body_text:
                record.body_text = decoded.body_text
            if decoded.body_html:
                record.body_html = decoded.body_html
            await db.flush()
            logger.info("Updated existing email record: id=%s, subject=%r", record.id, record.subject)
            return record

    record = EmailRecord(
        company_id=company_id,
        direction="INBOUND",
        from_address=decoded.from_address,
        to_address=decoded.to_address,
        subject=decoded.subject,
        body_text=decoded.body_text or None,
        body_html=decoded.body_html or None,
        message_id=decoded.message_id,
        status=status,
        email_type=classification.format.value,
        error_message=error_message,
        received_at=(
            email.utils.parsedate_to_datetime(decoded.date)
            if getattr(decoded, "date", None)
            else datetime.now(timezone.utc)
        ) if getattr(decoded, "date", None) else datetime.now(timezone.utc),
    )

    db.add(record)
    await db.flush()
    logger.info("Saved email record: id=%s, subject=%r", record.id, record.subject)
    return record


async def save_attachments(
    db: AsyncSession,
    decoded: DecodedEmail,
    email_record_id: str,
    company_id: str,
) -> list[str]:
    """
    Upload email attachments to MinIO and save metadata to DB.

    Parameters
    ----------
    db : AsyncSession
    decoded : DecodedEmail
    email_record_id : str
    company_id : str

    Returns
    -------
    list[str]
        List of saved attachment IDs.
    """
    files = [
        (att.filename, att.content_type, att.payload)
        for att in decoded.attachments
    ]
    if decoded.raw:
        files.append(
            (ORIGINAL_EML_FILENAME, ORIGINAL_EML_CONTENT_TYPE, decoded.raw)
        )

    if not files:
        return []

    attachment_ids = []

    try:
        from app.storage.minio_client import upload_attachment
    except ImportError:
        logger.warning("MinIO client not available — skipping attachment storage")
        return []

    # Reprocessing an email re-saves the same files — skip ones already stored
    existing = await db.execute(
        select(EmailAttachment.filename, EmailAttachment.checksum_sha256).where(
            EmailAttachment.email_record_id == email_record_id
        )
    )
    already_saved = {(row.filename, row.checksum_sha256) for row in existing}

    for filename, content_type, payload in files:
        try:
            if (filename, hashlib.sha256(payload).hexdigest()) in already_saved:
                logger.info("Attachment already stored, skipping: %s", filename)
                continue

            # Build object key: company_id/email_record_id/filename
            safe_filename = filename.replace("/", "_").replace("\\", "_")
            object_key = f"{company_id}/{email_record_id}/{safe_filename}"

            # Upload to MinIO
            upload_result = upload_attachment(
                content=payload,
                object_key=object_key,
                content_type=content_type,
            )

            # Save metadata to DB
            attachment_record = EmailAttachment(
                email_record_id=email_record_id,
                filename=filename,
                content_type=content_type,
                file_size=len(payload),
                minio_bucket=upload_result["bucket"],
                minio_key=upload_result["key"],
                checksum_sha256=upload_result["checksum_sha256"],
                company_id=company_id,
            )
            db.add(attachment_record)
            await db.flush()

            attachment_ids.append(str(attachment_record.id))
            logger.info(
                "Saved attachment: %s (%s, %d bytes) → MinIO %s",
                filename, content_type, len(payload),
                object_key,
            )
        except Exception as e:
            logger.error(
                "Failed to save attachment %s: %s", filename, e
            )
            # Continue with other attachments — don't fail the whole email

    return attachment_ids


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

    clean_po = normalize_po_number(parsed_po.po_number)
    parsed_po.po_number = clean_po

    parsed = ParsedData(
        email_record_id=email_record_id,
        company_id=company_id,
        parser_used=parsed_po.raw_source.upper() or "XML",
        raw_extracted=raw_dict,
        normalized={
            "po_number": clean_po,
            "supplier_code": parsed_po.supplier_code,
            "supplier_name": parsed_po.supplier_name,
            "currency": parsed_po.currency,
            "total_quantity": parsed_po.total_quantity,
            "total_value": parsed_po.total_value,
            "line_count": len(parsed_po.line_items),
        },
        validation_errors=[],
        po_number_extracted=clean_po or None,
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
) -> Optional[PurchaseOrder]:
    """
    Upsert a purchase order from parsed data.

    If a PO with the same po_number already exists for this company,
    it updates the existing record (new version). Otherwise creates new.
    """
    clean_po = normalize_po_number(parsed_po.po_number)
    if not clean_po:
        logger.warning("Skipping PO with empty po_number")
        return None

    # Skip dummy POs with 0 line items and 0 quantity (e.g. notification cover body)
    if not parsed_po.line_items and (parsed_po.total_quantity or 0) == 0:
        logger.warning("Skipping empty PO %s with 0 line items and 0 quantity", clean_po)
        return None

    parsed_po.po_number = clean_po

    # Resolve supplier if not explicitly passed
    resolved_supplier_id = supplier_id
    if not resolved_supplier_id and parsed_po.supplier_code:
        supp_clean = str(parsed_po.supplier_code).lstrip("0")
        supp_stmt = select(Supplier).where(
            (Supplier.supplier_code == parsed_po.supplier_code) |
            (Supplier.supplier_code == supp_clean)
        )
        supp_res = await db.execute(supp_stmt)
        supp = supp_res.scalar_one_or_none()
        if supp:
            resolved_supplier_id = supp.id
        else:
            new_supp = Supplier(
                supplier_code=parsed_po.supplier_code,
                name=parsed_po.supplier_name or f"Supplier {parsed_po.supplier_code}",
                email=f"supplier_{supp_clean or 'unknown'}@oniverse.local",
            )
            db.add(new_supp)
            await db.flush()
            resolved_supplier_id = new_supp.id

    first_item = parsed_po.line_items[0] if parsed_po.line_items else None
    primary_style = first_item.style[:50] if first_item and first_item.style else None
    primary_desc = first_item.description if first_item and first_item.description else None
    buyer_code = (parsed_po.buyer_name or "CALZ")[:50]

    items_data = [
        {
            "line_number": li.line_number,
            "material_code": li.style,
            "description": li.description,
            "color": li.color,
            "size": li.size,
            "quantity": li.quantity,
            "unit_price": li.unit_price,
        }
        for li in parsed_po.line_items
    ]
    order_type_str = getattr(parsed_po, "order_type", "") or "ZA6A"
    extra_info = {
        "order_type": order_type_str,
        "items": items_data,
    }

    # Check if PO already exists (check clean_po and common variations)
    stmt = select(PurchaseOrder).where(
        PurchaseOrder.company_id == company_id,
        (PurchaseOrder.po_number == clean_po) |
        (PurchaseOrder.po_number == f"ZA6A-{clean_po}") |
        (PurchaseOrder.po_number == parsed_po.po_number)
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        # Update existing PO — ensure canonical normalized number
        existing.po_number = clean_po
        existing.version = (existing.version or 1) + 1
        existing.status = "UPDATED"
        if parsed_po.total_quantity > 0:
            existing.quantity = parsed_po.total_quantity
        if parsed_po.total_value > 0:
            existing.total_value = parsed_po.total_value
        existing.destination = parsed_po.destination or existing.destination
        existing.delivery_date = _parse_date(parsed_po.delivery_date) or existing.delivery_date
        existing.currency = parsed_po.currency or existing.currency
        existing.source_email_id = email_record_id
        if not existing.supplier_id and resolved_supplier_id:
            existing.supplier_id = resolved_supplier_id
        if not existing.client_code:
            existing.client_code = buyer_code
        if primary_style:
            existing.style_number = primary_style
        if primary_desc:
            existing.description = primary_desc
        if items_data:
            existing.extra_data = extra_info
        po = existing
        logger.info("Updated PO: %s (v%d)", po.po_number, po.version)
    else:
        # Create new PO
        po = PurchaseOrder(
            company_id=company_id,
            supplier_id=resolved_supplier_id,
            client_code=buyer_code,
            style_number=primary_style,
            description=primary_desc,
            po_number=clean_po,
            status="ACTIVE",
            quantity=parsed_po.total_quantity,
            total_value=parsed_po.total_value,
            destination=parsed_po.destination,
            delivery_date=_parse_date(parsed_po.delivery_date),
            currency=parsed_po.currency,
            version=1,
            source_email_id=email_record_id,
            extra_data=extra_info,
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
    Full persistence — save email record + attachments + parsed data + POs.
    """
    try:
        # Filter out empty 0-item dummy POs if valid POs exist
        valid_pos = [
            p for p in parsed_pos
            if p.line_items or (p.total_quantity and p.total_quantity > 0) or (p.total_value and p.total_value > 0)
        ]
        effective_pos = valid_pos if valid_pos else parsed_pos

        # 1. Save the email record — COMMITTED if POs extracted, ERROR if none
        status = "COMMITTED" if effective_pos else "ERROR"
        err_msg = None if effective_pos else "No purchase orders extracted from email body or attachments"
        email_record = await save_email_record(
            db, decoded, classification, company_id, status=status, error_message=err_msg
        )

        # 2. Save attachments to MinIO + DB
        attachment_ids = await save_attachments(
            db, decoded,
            email_record_id=str(email_record.id),
            company_id=company_id,
        )

        # 3. Save each parsed PO → parsed_data + purchase_orders
        po_ids = []
        parsed_data_ids = []
        for parsed_po in effective_pos:
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
            if po:
                po_ids.append(str(po.id))

        await db.commit()

        return {
            "email_record_id": str(email_record.id),
            "attachment_ids": attachment_ids,
            "parsed_data_ids": parsed_data_ids,
            "purchase_order_ids": po_ids,
            "po_count": len(po_ids),
        }
    except Exception as e:
        await db.rollback()
        logger.error("Failed to persist email data: %s", e)
        raise