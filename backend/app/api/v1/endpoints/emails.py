"""
Emails API endpoints (Presentation Layer).

Provides:
  - GET    /              — List emails with filters & pagination
  - GET    /stats         — Email processing statistics
  - POST   /upload        — Upload .eml file for parsing
  - GET    /test-pipeline — Test IMAP→parse→DB pipeline
  - GET    /test-poll     — Trigger Celery poll task
  - GET    /{email_id}    — Email detail + bodies, attachments, parsed data
  - GET    /{email_id}/attachments/{attachment_id} — Download stored file
  - PATCH  /{email_id}    — Update email status/fields
  - POST   /{email_id}/approve   — Approve a reviewed email
  - POST   /{email_id}/reject    — Reject with reason
  - POST   /{email_id}/reprocess — Re-run through pipeline
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, UploadFile, File
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy import func, select, case, desc, cast, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.email_attachment import EmailAttachment
from app.models.email_message import EmailRecord
from app.models.parsed_data import ParsedData
from app.models.purchase_order import PurchaseOrder
from app.models.supplier import Supplier
from app.core.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Pydantic Schemas ───────────────────────────────────────────
class EmailListItem(BaseModel):
    id: str
    company_id: str
    from_address: Optional[str] = None
    to_address: Optional[str] = None
    subject: Optional[str] = None
    status: Optional[str] = None
    email_type: Optional[str] = None
    direction: Optional[str] = None
    received_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    error_message: Optional[str] = None

    model_config = {"from_attributes": True}


class ParsedDataResponse(BaseModel):
    id: str
    parser_used: Optional[str] = None
    raw_extracted: Optional[dict] = None
    normalized: Optional[dict] = None
    validation_errors: Optional[list] = None
    po_number_extracted: Optional[str] = None
    supplier_id_extracted: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class EmailAttachmentResponse(BaseModel):
    id: str
    filename: Optional[str] = None
    content_type: Optional[str] = None
    file_size: Optional[int] = None
    is_original: bool = False
    created_at: Optional[datetime] = None


class EmailDetailResponse(BaseModel):
    id: str
    company_id: str
    from_address: Optional[str] = None
    to_address: Optional[str] = None
    subject: Optional[str] = None
    body_text: Optional[str] = None
    body_html: Optional[str] = None
    message_id: Optional[str] = None
    status: Optional[str] = None
    email_type: Optional[str] = None
    direction: Optional[str] = None
    received_at: Optional[datetime] = None
    fetched_at: Optional[datetime] = None
    processed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    error_message: Optional[str] = None
    retry_count: int = 0
    attachments: list[EmailAttachmentResponse] = []
    parsed_data: list[ParsedDataResponse] = []

    model_config = {"from_attributes": True}


class EmailUpdateRequest(BaseModel):
    status: Optional[str] = None
    email_type: Optional[str] = None
    error_message: Optional[str] = None


class RejectRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=1000)


class PaginatedEmailResponse(BaseModel):
    items: list[EmailListItem]
    total: int
    page: int
    per_page: int
    pages: int


class EmailStatsResponse(BaseModel):
    total: int = 0
    queued: int = 0
    processing: int = 0
    parsed: int = 0
    review: int = 0
    committed: int = 0
    rejected: int = 0
    error: int = 0


# ─── GET / — List Emails ────────────────────────────────────────

@router.get("", response_model=PaginatedEmailResponse)
@router.get("/", response_model=PaginatedEmailResponse, include_in_schema=False)
async def list_emails(
    db: AsyncSession = Depends(get_db),
    status: Optional[str] = Query(None, description="Filter by status"),
    email_type: Optional[str] = Query(None, description="Filter by type"),
    search: Optional[str] = Query(None, description="Search subject, sender, PO number, or vendor code"),
    po_number: Optional[str] = Query(None, description="Filter explicitly by PO number"),
    vendor_code: Optional[str] = Query(None, description="Filter explicitly by vendor/supplier code"),
    company_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List emails with optional filters (including PO number and vendor code search) and pagination."""
    query = select(EmailRecord)

    if company_id:
        query = query.where(EmailRecord.company_id == company_id)
    if status:
        query = query.where(EmailRecord.status == status.upper())
    if email_type:
        query = query.where(EmailRecord.email_type == email_type)

    if po_number:
        po_filter = f"%{po_number}%"
        parsed_po_subq = select(ParsedData.email_record_id).where(
            ParsedData.po_number_extracted.ilike(po_filter)
            | cast(ParsedData.raw_extracted, String).ilike(po_filter)
        )
        po_subq = select(PurchaseOrder.source_email_id).where(
            PurchaseOrder.po_number.ilike(po_filter)
        )
        query = query.where(
            EmailRecord.subject.ilike(po_filter)
            | EmailRecord.body_html.ilike(po_filter)
            | EmailRecord.body_text.ilike(po_filter)
            | EmailRecord.id.in_(parsed_po_subq)
            | EmailRecord.id.in_(po_subq)
        )

    if vendor_code:
        v_filter = f"%{vendor_code}%"
        supp_ids_subq = select(Supplier.id).where(
            Supplier.supplier_code.ilike(v_filter)
            | Supplier.name.ilike(v_filter)
        )
        parsed_v_subq = select(ParsedData.email_record_id).where(
            ParsedData.supplier_id_extracted.ilike(v_filter)
            | cast(ParsedData.raw_extracted, String).ilike(v_filter)
        )
        query = query.where(
            EmailRecord.from_address.ilike(v_filter)
            | EmailRecord.body_html.ilike(v_filter)
            | EmailRecord.body_text.ilike(v_filter)
            | EmailRecord.supplier_id.in_(supp_ids_subq)
            | EmailRecord.id.in_(parsed_v_subq)
        )

    if search:
        search_filter = f"%{search}%"
        supp_ids_subq = select(Supplier.id).where(
            Supplier.supplier_code.ilike(search_filter)
            | Supplier.name.ilike(search_filter)
        )
        parsed_subq = select(ParsedData.email_record_id).where(
            ParsedData.po_number_extracted.ilike(search_filter)
            | ParsedData.supplier_id_extracted.ilike(search_filter)
            | cast(ParsedData.raw_extracted, String).ilike(search_filter)
        )
        po_subq = select(PurchaseOrder.source_email_id).where(
            PurchaseOrder.po_number.ilike(search_filter)
            | PurchaseOrder.client_code.ilike(search_filter)
            | PurchaseOrder.style_number.ilike(search_filter)
            | PurchaseOrder.description.ilike(search_filter)
            | cast(PurchaseOrder.extra_data, String).ilike(search_filter)
        )

        query = query.where(
            EmailRecord.subject.ilike(search_filter)
            | EmailRecord.from_address.ilike(search_filter)
            | EmailRecord.to_address.ilike(search_filter)
            | EmailRecord.body_html.ilike(search_filter)
            | EmailRecord.body_text.ilike(search_filter)
            | EmailRecord.supplier_id.in_(supp_ids_subq)
            | EmailRecord.id.in_(parsed_subq)
            | EmailRecord.id.in_(po_subq)
        )

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(desc(EmailRecord.created_at))
    query = query.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(query)
    records = result.scalars().all()

    pages = max(1, (total + per_page - 1) // per_page)

    return PaginatedEmailResponse(
        items=[
            EmailListItem(
                id=str(r.id),
                company_id=str(r.company_id),
                from_address=r.from_address,
                to_address=r.to_address,
                subject=r.subject,
                status=r.status,
                email_type=r.email_type,
                direction=r.direction,
                received_at=r.received_at,
                created_at=r.created_at,
                error_message=r.error_message,
            )
            for r in records
        ],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


# ─── GET /stats — Email Statistics ──────────────────────────────

@router.get("/stats", response_model=EmailStatsResponse)
async def email_stats(
    db: AsyncSession = Depends(get_db),
    company_id: Optional[str] = Query(None),
):
    """Get email processing statistics broken down by status."""
    query = select(
        func.count().label("total"),
        func.count().filter(EmailRecord.status == "QUEUED").label("queued"),
        func.count().filter(EmailRecord.status == "PROCESSING").label("processing"),
        func.count().filter(EmailRecord.status == "PARSED").label("parsed"),
        func.count().filter(EmailRecord.status == "REVIEW").label("review"),
        func.count().filter(EmailRecord.status == "COMMITTED").label("committed"),
        func.count().filter(EmailRecord.status == "REJECTED").label("rejected"),
        func.count().filter(EmailRecord.status == "ERROR").label("error"),
    )

    if company_id:
        query = query.where(EmailRecord.company_id == company_id)

    result = await db.execute(query)
    row = result.one()

    return EmailStatsResponse(
        total=row.total,
        queued=row.queued,
        processing=row.processing,
        parsed=row.parsed,
        review=row.review,
        committed=row.committed,
        rejected=row.rejected,
        error=row.error,
    )


# ─── POST /upload — Upload .eml File ────────────────────────────

@router.post("/upload")
async def upload_email(
    file: UploadFile = File(...),
    company_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Upload a .eml file, parse it, and save results to DB."""
    from app.email.mime_decoder import decode
    from app.email.classifier import classify
    from app.email.parsers import parse
    from app.services.email_service import process_and_save

    settings = get_settings()
    resolved_company_id = (
        company_id
        or settings.DEFAULT_COMPANY_ID
        or os.getenv("DEFAULT_COMPANY_ID")
    )
    if not resolved_company_id:
        raise HTTPException(status_code=400, detail="company_id is required")

    raw_bytes = await file.read()
    decoded = decode(raw_bytes)
    classification = classify(decoded)
    parsed_pos = parse(decoded, classification)

    result = await process_and_save(
        db, decoded, classification, parsed_pos, resolved_company_id
    )

    return {
        "status": "ok",
        "filename": file.filename,
        "subject": decoded.subject,
        "format": classification.format.value,
        "po_count": len(parsed_pos),
        "db": result,
    }


# ─── GET /test-pipeline — Test Full Pipeline ────────────────────

@router.get("/test-pipeline")
async def test_pipeline(
    company_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Test the full IMAP → parse → DB pipeline (no Celery)."""
    from app.email.imap_client import IMAPClient, IMAPConfig
    from app.email.mime_decoder import decode
    from app.email.classifier import classify
    from app.email.parsers import parse
    from app.services.email_service import process_and_save

    settings = get_settings()

    resolved_company_id = (
        company_id
        or settings.DEFAULT_COMPANY_ID
        or os.getenv("DEFAULT_COMPANY_ID")
    )
    if not resolved_company_id:
        raise HTTPException(status_code=400, detail="company_id is required")

    if not settings.IMAP_USERNAME or not settings.IMAP_PASSWORD:
        raise HTTPException(status_code=400, detail="IMAP credentials not configured")

    config = IMAPConfig(
        host=settings.IMAP_HOST,
        port=settings.IMAP_PORT,
        username=settings.IMAP_USERNAME,
        password=settings.IMAP_PASSWORD,
        mailbox=settings.IMAP_MAILBOX,
        use_ssl=settings.IMAP_USE_SSL,
    )

    with IMAPClient(config) as client:
        raw_emails = client.fetch_unread()

    results = []
    for raw in raw_emails:
        decoded = decode(raw.raw)
        classification = classify(decoded)
        parsed_pos = parse(decoded, classification)

        try:
            db_result = await process_and_save(
                db, decoded, classification, parsed_pos, resolved_company_id
            )
        except Exception as e:
            db_result = {"error": str(e)}

        results.append({
            "subject": decoded.subject,
            "from": decoded.from_address,
            "format": classification.format.value,
            "po_count": len(parsed_pos),
            "pos": [
                {
                    "po_number": po.po_number,
                    "items": len(po.line_items),
                    "qty": po.total_quantity,
                }
                for po in parsed_pos
            ],
            "db": db_result,
        })

    return {
        "status": "ok",
        "emails_processed": len(raw_emails),
        "results": results,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ─── GET /test-poll — Trigger Celery Task ────────────────────────

@router.get("/test-poll")
async def test_poll():
    """Trigger the Celery email polling task."""
    try:
        from app.tasks.email_tasks import poll_mailboxes
        task = poll_mailboxes.delay()
        return {"status": "queued", "task_id": str(task.id)}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


# ─── GET /{email_id} — Email Detail ─────────────────────────────

@router.get("/{email_id}", response_model=EmailDetailResponse)
async def get_email(
    email_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get full email detail: bodies, stored attachments, and parsed data."""
    from app.services.email_service import (
        ORIGINAL_EML_CONTENT_TYPE,
        ORIGINAL_EML_FILENAME,
    )

    result = await db.execute(
        select(EmailRecord).where(EmailRecord.id == email_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Email not found")

    pd_result = await db.execute(
        select(ParsedData).where(ParsedData.email_record_id == str(email_id))
    )
    parsed_items = pd_result.scalars().all()

    att_result = await db.execute(
        select(EmailAttachment)
        .where(EmailAttachment.email_record_id == email_id)
        .order_by(EmailAttachment.created_at)
    )
    attachments = att_result.scalars().all()

    return EmailDetailResponse(
        id=str(record.id),
        company_id=str(record.company_id),
        from_address=record.from_address,
        to_address=record.to_address,
        subject=record.subject,
        body_text=record.body_text,
        body_html=record.body_html,
        message_id=record.message_id,
        status=record.status,
        email_type=record.email_type,
        direction=record.direction,
        received_at=record.received_at,
        fetched_at=record.fetched_at,
        processed_at=record.processed_at,
        created_at=record.created_at,
        error_message=record.error_message,
        retry_count=record.retry_count or 0,
        attachments=[
            EmailAttachmentResponse(
                id=str(att.id),
                filename=att.filename,
                content_type=att.content_type,
                file_size=att.file_size,
                is_original=(
                    att.filename == ORIGINAL_EML_FILENAME
                    and att.content_type == ORIGINAL_EML_CONTENT_TYPE
                ),
                created_at=att.created_at,
            )
            for att in attachments
        ],
        parsed_data=[
            ParsedDataResponse(
                id=str(pd.id),
                parser_used=pd.parser_used,
                raw_extracted=pd.raw_extracted,
                normalized=pd.normalized,
                validation_errors=pd.validation_errors,
                po_number_extracted=pd.po_number_extracted,
                supplier_id_extracted=pd.supplier_id_extracted,
                created_at=pd.created_at,
            )
            for pd in parsed_items
        ],
    )


# ─── GET /{email_id}/attachments/{attachment_id} — Download File ─

@router.get("/{email_id}/attachments/{attachment_id}")
async def download_email_attachment(
    email_id: UUID,
    attachment_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Return a stored attachment (or the original .eml) from MinIO."""
    from app.storage.minio_client import download_attachment

    result = await db.execute(
        select(EmailAttachment).where(
            EmailAttachment.id == attachment_id,
            EmailAttachment.email_record_id == email_id,
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment or not attachment.minio_key:
        raise HTTPException(status_code=404, detail="Attachment not found")

    try:
        content = await run_in_threadpool(
            download_attachment, attachment.minio_key, attachment.minio_bucket
        )
    except Exception as e:
        logger.error("Failed to read attachment %s from MinIO: %s", attachment_id, e)
        raise HTTPException(
            status_code=502, detail="Could not read attachment from storage"
        )

    filename = attachment.filename or "attachment"
    return Response(
        content=content,
        media_type=attachment.content_type or "application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
            # Email content is untrusted — never let it run as a page on our origin
            "Content-Security-Policy": "sandbox",
            "X-Content-Type-Options": "nosniff",
        },
    )


# ─── PATCH /{email_id} — Update Email ───────────────────────────

@router.patch("/{email_id}")
async def update_email(
    email_id: UUID,
    body: EmailUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update email status or fields."""
    result = await db.execute(
        select(EmailRecord).where(EmailRecord.id == email_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Email not found")

    if body.status is not None:
        record.status = body.status.upper()
    if body.email_type is not None:
        record.email_type = body.email_type
    if body.error_message is not None:
        record.error_message = body.error_message

    record.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return {"status": "updated", "email_id": str(email_id)}


# ─── POST /{email_id}/reprocess — Re-run Pipeline ───────────────

@router.post("/{email_id}/reprocess")
async def reprocess_email(
    email_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Re-queue an email for reprocessing through the parsing pipeline."""
    result = await db.execute(
        select(EmailRecord).where(EmailRecord.id == email_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Email not found")

    record.status = "QUEUED"
    record.error_message = None
    record.retry_count = (record.retry_count or 0) + 1
    record.updated_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info("Re-queued email %s for reprocessing", email_id)
    return {"status": "requeued", "email_id": str(email_id)}