# backend/app/api/v1/endpoints/emails.py
"""
Emails API endpoints.

- POST /upload  — dev endpoint: upload a .eml file and run it
  through the full inbound pipeline immediately.
- GET  /test-poll  — dev endpoint: trigger one IMAP poll manually.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, File, UploadFile, HTTPException

from app.email.mime_decoder import decode
from app.email.classifier import classify
from app.email.parsers import parse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/upload")
async def upload_eml(file: UploadFile = File(...)) -> dict:
    """
    Upload a .eml file and process it through the inbound pipeline.

    Runs the full pipeline inline (decode → classify → parse) and
    returns the result immediately, without Celery.
    """
    if not file.filename or not file.filename.endswith(".eml"):
        raise HTTPException(
            status_code=400,
            detail="Only .eml files are accepted",
        )

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    tracking_id = str(uuid.uuid4())
    logger.info("Upload received: %s (%d bytes), tracking=%s", file.filename, len(raw_bytes), tracking_id)

    # Stage 1: Decode
    decoded = decode(raw_bytes)

    # Stage 2: Classify
    classification = classify(decoded)

    # Stage 3: Parse
    parsed_pos = parse(decoded, classification)

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
            "body_text_length": len(decoded.body_text),
            "body_html_length": len(decoded.body_html),
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
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/test-poll")
async def test_poll() -> dict:
    """
    Dev endpoint — trigger one IMAP poll manually.
    Runs synchronously (no Celery) for testing.
    """
    from app.tasks.email_tasks import poll_mailboxes

    try:
        result = poll_mailboxes()
        return {"status": "ok", "poll_result": result}
    except Exception as e:
        logger.exception("Test poll failed")
        raise HTTPException(status_code=500, detail=str(e))