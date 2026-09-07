# ============================================================
# Automation (System B) — Celery Workers
# ============================================================
FROM python:3.12-slim AS base

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

# Default: run as Celery worker (override CMD for beat/flower)
CMD ["celery", "-A", "app.celery_app:celery_app", "worker", \
     "--loglevel=info", "--concurrency=4", "-Q", "email.ingestion,email.processing"]
