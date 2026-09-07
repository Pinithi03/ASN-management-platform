"""
Email parsing tasks.

Handles parsing email content to extract PO/shipment data.
Sprint 5-7 will add full implementation.
"""

from app.celery_app import celery_app


@celery_app.task(name="app.tasks.parsing_tasks.parse_email")
def parse_email(email_id: str) -> dict:
    """Parse a single email to extract structured data.

    TODO: Sprint 5-7 — Full implementation
    """
    return {
        "status": "not_implemented",
        "email_id": email_id,
        "message": "Email parsing will be implemented in Sprint 5-7",
    }
