"""
Data persistence tasks.

Handles saving parsed data to the database.
"""

from app.celery_app import celery_app


@celery_app.task(name="app.tasks.persistence_tasks.save_parsed_data")
def save_parsed_data(parsed_data: dict) -> dict:
    """Save parsed email data to the database.

    TODO: Sprint 5 — Full implementation
    """
    return {"status": "not_implemented", "message": "Persistence will be implemented in Sprint 5"}
