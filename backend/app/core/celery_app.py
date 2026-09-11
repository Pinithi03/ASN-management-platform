"""
Celery application for the backend (System A).

Runs the email polling task on a beat schedule.
Connects to RabbitMQ as the message broker.

Usage (from backend/ directory):
    Worker:  PYTHONPATH=. celery -A app.core.celery_app:celery worker --loglevel=info
    Beat:    PYTHONPATH=. celery -A app.core.celery_app:celery beat --loglevel=info
"""

from __future__ import annotations

import os

from celery import Celery

from dotenv import load_dotenv
load_dotenv()

# ── Create Celery Instance ───────────────────────────────────────
celery = Celery("ans_backend")

# ── Broker (RabbitMQ) ────────────────────────────────────────────
celery.conf.broker_url = os.getenv(
    "CELERY_BROKER_URL",
    "amqp://ans_rabbit:ans_rabbit_pass@localhost:5672/",
)

# ── Result Backend (Redis) ───────────────────────────────────────
celery.conf.result_backend = os.getenv(
    "CELERY_RESULT_BACKEND",
    "redis://localhost:6379/1",
)

# ── Serialization ────────────────────────────────────────────────
celery.conf.task_serializer = "json"
celery.conf.result_serializer = "json"
celery.conf.accept_content = ["json"]
celery.conf.timezone = "UTC"
celery.conf.enable_utc = True

# ── Reliability ──────────────────────────────────────────────────
celery.conf.task_acks_late = True
celery.conf.worker_prefetch_multiplier = 1
celery.conf.task_reject_on_worker_lost = True

# ── Retry Defaults ───────────────────────────────────────────────
celery.conf.task_default_retry_delay = 60
celery.conf.task_max_retries = 3

# ── Auto-discover tasks ─────────────────────────────────────────
celery.autodiscover_tasks(["app.tasks.email_tasks"])

# ── Task Routing ────────────────────────────────────────────────
celery.conf.task_routes = {
    "email.poll_mailboxes": {"queue": "email"},
    "email.process_inbound": {"queue": "email"},
}

# ── Beat Schedule (Periodic Tasks) ──────────────────────────────
POLL_INTERVAL = int(os.getenv("EMAIL_POLL_INTERVAL", "10"))

celery.conf.beat_schedule = {
    "poll-mailboxes-every-10s": {
        "task": "email.poll_mailboxes",
        "schedule": POLL_INTERVAL,  # seconds
        "options": {"queue": "email"},
    },
}