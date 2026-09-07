"""
Email ingestion tasks.

Handles polling IMAP mailboxes and fetching new emails.
Sprint 5 will add full implementation.
"""

from app.celery_app import celery_app


@celery_app.task(name="app.tasks.email_tasks.ping")
def ping() -> dict:
    """Test task to verify Celery worker is running.

    Usage:
        from app.tasks.email_tasks import ping
        result = ping.delay()
        print(result.get(timeout=10))
    """
    return {"status": "pong", "service": "automation-engine"}


@celery_app.task(name="app.tasks.email_tasks.poll_mailboxes")
def poll_mailboxes() -> dict:
    """Poll all configured IMAP mailboxes for new emails.

    TODO: Sprint 5 — Full implementation
    """
    return {"status": "not_implemented", "message": "Email polling will be implemented in Sprint 5"}
