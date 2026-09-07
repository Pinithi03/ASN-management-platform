"""
Celery and automation engine configuration.
Loaded from environment variables.
"""

import os

# Broker (RabbitMQ)
broker_url = os.getenv(
    "CELERY_BROKER_URL",
    "amqp://ans_rabbit:ans_rabbit_pass@localhost:5672/",
)

# Result backend (Redis)
result_backend = os.getenv(
    "CELERY_RESULT_BACKEND",
    "redis://localhost:6379/1",
)

# Serialization
task_serializer = "json"
result_serializer = "json"
accept_content = ["json"]
timezone = "UTC"
enable_utc = True

# Task execution
task_acks_late = True
task_reject_on_worker_lost = True
worker_prefetch_multiplier = 1

# Task routing — each domain gets its own queue
task_routes = {
    "app.tasks.email_tasks.*": {"queue": "email.ingestion"},
    "app.tasks.parsing_tasks.*": {"queue": "email.processing"},
    "app.tasks.persistence_tasks.*": {"queue": "data.persistence"},
    "app.tasks.notification_tasks.*": {"queue": "notifications"},
}

# Default queue
task_default_queue = "default"

# Beat schedule (periodic tasks — will be populated in later sprints)
beat_schedule = {
    # Example (Sprint 5):
    # "poll-emails-every-5-min": {
    #     "task": "app.tasks.email_tasks.poll_mailboxes",
    #     "schedule": 300.0,
    # },
}

# Retry defaults
task_default_retry_delay = 60  # 1 minute
task_max_retries = 3
