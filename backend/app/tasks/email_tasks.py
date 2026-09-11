# backend/app/tasks/email_tasks.py
"""
Celery tasks for the inbound email pipeline.

- poll_mailboxes: Beat task (every 10 s) — connects to IMAP, fetches
  unread emails, dispatches process_inbound_email for each.
- process_inbound_email: Worker task — decodes, classifies, parses,
  validates, and saves PO data to the database.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import uuid
from datetime import datetime, timezone

from celery import shared_task

from app.email.imap_client import IMAPClient, IMAPConfig
from app.email.mime_decoder import decode
from app.email.classifier import classify, EmailFormat
from app.email.parsers import parse

logger = logging.getLogger(__name__)


def _get_imap_config() -> IMAPConfig:
    """
    Build IMAP config from environment variables.

    Env vars:
        IMAP_HOST, IMAP_PORT, IMAP_USERNAME, IMAP_PASSWORD, IMAP_MAILBOX
    """
    return IMAPConfig(
        host=os.getenv("IMAP_HOST", "imap.gmail.com"),
        port=int(os.getenv("IMAP_PORT", "993")),
        username=os.getenv("IMAP_USERNAME", ""),
        password=os.getenv("IMAP_PASSWORD", ""),
        mailbox=os.getenv("IMAP_MAILBOX", "INBOX"),
        use_ssl=os.getenv("IMAP_USE_SSL", "true").lower() == "true",
    )


async def _persist_email(
    decoded,
    classification,
    parsed_pos,
    company_id: str,
) -> dict:
    """
    Async helper — opens a DB session and persists parsed email data.
    Called from the synchronous Celery task via asyncio.run().
    """
    from app.db.session import async_session_factory
    from app.services.email_service import process_and_save

    async with async_session_factory() as session:
        try:
            result = await process_and_save(
                db=session,
                decoded=decoded,
                classification=classification,
                parsed_pos=parsed_pos,
                company_id=company_id,
            )
            return result
        except Exception:
            await session.rollback()
            raise


async def _persist_error(
    decoded,
    classification,
    company_id: str,
    error_message: str,
) -> dict:
    """
    Async helper — saves an email record with ERROR status when parsing fails.
    """
    from app.db.session import async_session_factory
    from app.services.email_service import save_email_record

    async with async_session_factory() as session:
        try:
            record = await save_email_record(
                db=session,
                decoded=decoded,
                classification=classification,
                company_id=company_id,
                status="ERROR",
                error_message=error_message,
            )
            await session.commit()
            return {"email_record_id": str(record.id), "status": "error"}
        except Exception:
            await session.rollback()
            raise


@shared_task(name="email.poll_mailboxes", bind=True, max_retries=3)
def poll_mailboxes(self) -> dict:
    """
    Beat task — poll IMAP mailbox for unread emails.

    Fetches up to 20 unread messages per run and dispatches
    process_inbound_email for each. Runs every 10 seconds via
    Celery Beat.

    Returns
    -------
    dict
        Summary of the poll: fetched count, dispatched count.
    """
    config = _get_imap_config()

    if not config.username or not config.password:
        logger.error("IMAP credentials not configured — skipping poll")
        return {"status": "skipped", "reason": "no_credentials"}

    # Company ID for this mailbox — from env for now, will come from
    # per-plant config when multi-plant support is added.
    company_id = os.getenv("DEFAULT_COMPANY_ID", "")

    try:
        with IMAPClient(config) as client:
            raw_emails = client.fetch_unread(limit=20)

            dispatched = 0
            for raw_email in raw_emails:
                email_tracking_id = str(uuid.uuid4())

                # Base64-encode bytes → string so JSON serializer can
                # pass them through the RabbitMQ message queue safely.
                process_inbound_email.delay(
                    raw_bytes=base64.b64encode(raw_email.raw).decode("ascii"),
                    uid=base64.b64encode(raw_email.uid).decode("ascii"),
                    tracking_id=email_tracking_id,
                    company_id=company_id,
                )
                dispatched += 1

                client.mark_as_read(raw_email.uid)

            logger.info(
                "Poll complete: %d fetched, %d dispatched",
                len(raw_emails),
                dispatched,
            )
            return {
                "status": "ok",
                "fetched": len(raw_emails),
                "dispatched": dispatched,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

    except ConnectionError as e:
        logger.error("IMAP connection failed: %s", e)
        raise self.retry(exc=e, countdown=60)
    except Exception as e:
        logger.exception("Unexpected error in poll_mailboxes")
        raise self.retry(exc=e, countdown=120)


@shared_task(name="email.process_inbound", bind=True, max_retries=2)
def process_inbound_email(
    self,
    raw_bytes: bytes | str,
    uid: str = "",
    tracking_id: str = "",
    company_id: str = "",
) -> dict:
    """
    Worker task — full inbound pipeline for one email.

    Steps:
      1. MIME decode
      2. Classify (XML vs HTML vs UNKNOWN)
      3. Parse PO data
      4. Save to DB (email_records + parsed_data + purchase_orders)

    Parameters
    ----------
    raw_bytes : bytes | str
        Full RFC-5322 email message. Arrives as a base64-encoded string
        from the JSON-serialized Celery message; decoded back to bytes here.
    uid : str
        IMAP UID (base64-encoded) for reference.
    tracking_id : str
        UUID for tracking this email through the pipeline.
    company_id : str
        Company UUID — which plant this email belongs to.

    Returns
    -------
    dict
        Processing result with status and parsed data summary.
    """
    logger.info("Processing email: tracking_id=%s, uid=%s", tracking_id, uid)

    # ── Decode base64 back to raw bytes ─────────────────────────
    # Celery's JSON serializer can't handle bytes, so poll_mailboxes
    # base64-encodes them before dispatch. Undo that here.
    if isinstance(raw_bytes, str):
        raw_bytes = base64.b64decode(raw_bytes)
    if isinstance(uid, str) and uid:
        try:
            uid_display = base64.b64decode(uid).decode("utf-8", errors="replace")
        except Exception:
            uid_display = uid
    else:
        uid_display = str(uid)

    try:
        # Stage 1: MIME decode
        decoded = decode(raw_bytes)
        logger.info(
            "Decoded: subject=%r, from=%s, attachments=%d",
            decoded.subject,
            decoded.from_address,
            len(decoded.attachments),
        )

        # Stage 2: Classify
        classification = classify(decoded)
        logger.info(
            "Classified: format=%s, confidence=%s, reason=%s",
            classification.format.value,
            classification.confidence,
            classification.reason,
        )

        # Stage 3: Parse
        parsed_pos = parse(decoded, classification)
        logger.info("Parsed %d PO(s)", len(parsed_pos))

        # Stage 4: Persist to DB
        if company_id:
            try:
                db_result = asyncio.run(
                    _persist_email(decoded, classification, parsed_pos, company_id)
                )
                logger.info("Saved to DB: %s", db_result)
            except Exception as db_err:
                logger.exception("DB save failed — returning parse result without persistence")
                db_result = {"db_error": str(db_err)}
        else:
            logger.warning("No company_id — skipping DB persistence")
            db_result = {"skipped": "no_company_id"}

        if not parsed_pos:
            return {
                "status": "no_po_found",
                "tracking_id": tracking_id,
                "subject": decoded.subject,
                "format": classification.format.value,
                "reason": classification.reason,
                "db": db_result,
            }

        # Build result summary
        po_summaries = []
        for po in parsed_pos:
            po_summaries.append({
                "po_number": po.po_number,
                "supplier_code": po.supplier_code,
                "line_items": len(po.line_items),
                "total_quantity": po.total_quantity,
                "total_value": po.total_value,
                "source": po.raw_source,
            })

        return {
            "status": "parsed",
            "tracking_id": tracking_id,
            "subject": decoded.subject,
            "format": classification.format.value,
            "po_count": len(parsed_pos),
            "purchase_orders": po_summaries,
            "db": db_result,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as e:
        logger.exception("Failed to process email: tracking_id=%s", tracking_id)

        # Try to save the error record to DB
        if company_id:
            try:
                decoded_for_error = decode(raw_bytes)
                classification_for_error = classify(decoded_for_error)
                asyncio.run(
                    _persist_error(
                        decoded_for_error,
                        classification_for_error,
                        company_id,
                        str(e),
                    )
                )
            except Exception:
                logger.exception("Failed to save error record to DB")

        return {
            "status": "error",
            "tracking_id": tracking_id,
            "error": str(e),
        }
