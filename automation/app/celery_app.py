"""
Celery application factory.
"""

from celery import Celery


def create_celery_app() -> Celery:
    """Create and configure the Celery application."""
    app = Celery("automation")

    # Load config from our config module
    app.config_from_object("app.config")

    # Auto-discover tasks in the tasks package
    app.autodiscover_tasks(["app.tasks"])

    return app


celery_app = create_celery_app()
