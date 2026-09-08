# backend/app/api/v1/endpoints/emails.py
"""
Emails API endpoints.

- POST /upload        — upload a .eml file and run full pipeline + DB save
- GET  /test-pipeline — IMAP fetch + parse + DB save (no Celery needed)
- GET  /test-poll     — trigger one IMAP poll via Celery task
"""

from __future__ import annotations
from app.core.config import get_settings
import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Query, UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.email.mime_decoder import decode
from app.email.classifier import classify
from app.email.parsers import parse
from app.services.email_service import process_and_save


logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/upload")
async def upload_eml(
    file: UploadFile = File(...),
    company_id: str = Query(
        default=None,
        description="Company UUID. Defaults to DEFAULT_COMPANY_ID env var.",
    ),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Upload a .eml file and process it through the inbound pipeline.

    Runs the full pipeline inline (decode → classify → parse → save to DB)
    and returns the result immediately, without Celery.
    """
    if not file.filename or not file.filename.endswith(".eml"):
        raise HTTPException(
            status_code=400,
            detail="Only .eml files are accepted",
        )

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    # Resolve company_id
    resolved_company_id = company_id or os.getenv("DEFAULT_COMPANY_ID", "")
    if not resolved_company_id:
        raise HTTPException(
            status_code=400,
            detail="company_id is required (pass as query param or set DEFAULT_COMPANY_ID env var)",
        )

    tracking_id = str(uuid.uuid4())
    logger.info(
        "Upload received: %s (%d bytes), tracking=%s",
        file.filename, len(raw_bytes), tracking_id,
    )

    # Stage 1: Decode
    decoded = decode(raw_bytes)

    # Stage 2: Classify
    classification = classify(decoded)

    # Stage 3: Parse
    parsed_pos = parse(decoded, classification)

    # Stage 4: Save to DB
    db_result = None
    try:
        db_result = await process_and_save(
            db=db,
            decoded=decoded,
            classification=classification,
            parsed_pos=parsed_pos,
            company_id=resolved_company_id,
        )
        logger.info("Saved to DB: %s", db_result)
    except Exception as e:
        logger.exception("DB save failed for uploaded .eml")
        db_result = {"error": str(e)}

    # Build response
    po_data = []
    for po in parsed_pos:
        items = []
        for li in po.line_items:
            items.append({
                "line_number": li.line_number,
                "style": li.style,
                "color": li.color,
                "size": li.size,
                "quantity": li.quantity,
                "unit_price": li.unit_price,
                "description": li.description,
            })
        po_data.append({
            "po_number": po.po_number,
            "supplier_code": po.supplier_code,
            "supplier_name": po.supplier_name,
            "order_date": po.order_date,
            "delivery_date": po.delivery_date,
            "destination": po.destination,
            "currency": po.currency,
            "total_quantity": po.total_quantity,
            "total_value": po.total_value,
            "line_items": items,
            "source": po.raw_source,
            "source_filename": po.source_filename,
        })

    return {
        "tracking_id": tracking_id,
        "filename": file.filename,
        "email": {
            "subject": decoded.subject,
            "from": decoded.from_address,
            "to": decoded.to_address,
            "date": decoded.date,
            "body_text_length": len(decoded.body_text or ""),
            "body_html_length": len(decoded.body_html or ""),
            "attachments": [
                {"filename": a.filename, "content_type": a.content_type, "size": len(a.payload)}
                for a in decoded.attachments
            ],
        },
        "classification": {
            "format": classification.format.value,
            "confidence": classification.confidence,
            "reason": classification.reason,
        },
        "purchase_orders": po_data,
        "po_count": len(po_data),
        "db": db_result,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/test-pipeline")
async def test_pipeline(
    limit: int = Query(default=5, description="Max emails to fetch"),
    company_id: str = Query(
        default=None,
        description="Company UUID. Defaults to DEFAULT_COMPANY_ID env var.",
    ),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Dev endpoint — full end-to-end test without Celery.

    Connects to IMAP, fetches unread emails, runs parse pipeline,
    and saves results to DB. All in one synchronous call.
    """
    from app.email.imap_client import IMAPClient, IMAPConfig

    resolved_company_id = company_id or os.getenv("DEFAULT_COMPANY_ID", "")
    if not resolved_company_id:
        raise HTTPException(
            status_code=400,
            detail="company_id is required (pass as query param or set DEFAULT_COMPANY_ID env var)",
        )

    
    settings = get_settings()
    config = IMAPConfig(
        host=settings.IMAP_HOST,
        port=settings.IMAP_PORT,
        username=settings.IMAP_USERNAME,
        password=settings.IMAP_PASSWORD,
        mailbox=settings.IMAP_MAILBOX,
        use_ssl=settings.IMAP_USE_SSL,
    )
    
    if not config.username or not config.password:
        raise HTTPException(status_code=400, detail="IMAP credentials not configured")

    results = []
    try:
        with IMAPClient(config) as client:
            raw_emails = client.fetch_unread(limit=limit)

            for raw in raw_emails:
                decoded = decode(raw.raw)
                classification = classify(decoded)
                parsed_pos = parse(decoded, classification)

                # Save to DB
                try:
                    db_result = await process_and_save(
                        db=db,
                        decoded=decoded,
                        classification=classification,
                        parsed_pos=parsed_pos,
                        company_id=resolved_company_id,
                    )
                except Exception as e:
                    db_result = {"error": str(e)}

                results.append({
                    "subject": decoded.subject,
                    "from": decoded.from_address,
                    "format": classification.format.value,
                    "po_count": len(parsed_pos),
                    "pos": [
                        {"po_number": po.po_number, "items": len(po.line_items), "qty": po.total_quantity}
                        for po in parsed_pos
                    ],
                    "db": db_result,
                })

                client.mark_as_read(raw.uid)

    except ConnectionError as e:
        raise HTTPException(status_code=502, detail=f"IMAP connection failed: {e}")

    return {
        "status": "ok",
        "emails_processed": len(results),
        "results": results,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/test-poll")
async def test_poll() -> dict:
    """
    Dev endpoint — trigger one IMAP poll via Celery task.
    Requires Celery worker + RabbitMQ to be running.
    """
    from app.tasks.email_tasks import poll_mailboxes

    try:
        result = poll_mailboxes()
        return {"status": "ok", "poll_result": result}
    except Exception as e:
        logger.exception("Test poll failed")
        raise HTTPException(status_code=500, detail=str(e))