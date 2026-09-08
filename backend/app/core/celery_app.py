# backend/app/core/celery_app.py
"""
Celery application factory.

Configures the Celery app with RabbitMQ broker, Redis result backend,
task autodiscovery, and Beat schedule for periodic email polling.
"""

from __future__ import annotations

import os

from celery import Celery
from celery.schedules import crontab

# Read from env or fall back to defaults
BROKER_URL = os.getenv("CELERY_BROKER_URL", "amqp://ans_rabbit:change_me_rabbitmq@localhost:5672/")
RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")
POLL_INTERVAL = int(os.getenv("EMAIL_POLL_INTERVAL_SECONDS", "120"))

celery_app = Celery(
    "ans_platform",
    broker=BROKER_URL,
    backend=RESULT_BACKEND,
)

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    # Timezone
    timezone="UTC",
    enable_utc=True,

    # Task routing
    task_routes={
        "email.poll_mailboxes": {"queue": "email"},
        "email.process_inbound": {"queue": "email"},
    },

    # Autodiscover tasks in these modules
    imports=["app.tasks.email_tasks"],

    # Beat schedule — periodic tasks
    beat_schedule={
        "poll-mailboxes-every-2-min": {
            "task": "email.poll_mailboxes",
            "schedule": POLL_INTERVAL,  # seconds (default 120)
            "options": {"queue": "email"},
        },
    },

    # Worker settings
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,

    # Result expiry
    result_expires=3600,  # 1 hour
)