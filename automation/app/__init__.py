"""
ASN Management Platform — Automation Engine (System B)

Background email processing and data pipeline.
Architecture: 3-Layer (Tasks → Services → Repositories/Clients)

Layers:
    - tasks/        : Presentation Layer (Celery task definitions)
    - services/     : Business Logic Layer (parsing, scoring, orchestration)
    - repositories/ : Data Access Layer (database, MinIO, Outlook API)

Pipeline: Fetch → Filter → Extract → Parse → Score → Route → Persist → Notify
"""
