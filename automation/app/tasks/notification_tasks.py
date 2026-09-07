"""
Notification tasks.

Handles sending notifications (WebSocket, email alerts).
"""

from app.celery_app import celery_app


@celery_app.task(name="app.tasks.notification_tasks.send_notification")
def send_notification(user_id: str, message: str) -> dict:
    """Send a notification to a user.

    TODO: Sprint 8 — Full implementation
    """
    return {"status": "not_implemented", "user_id": user_id}
