"""
RabbitMQ publisher client.

Used for publishing messages between pipeline stages when
direct Celery task chaining isn't appropriate.

Exchanges:
    - email.direct : Email pipeline messages (5 queues)
    - asn.direct   : ASN workflow messages (3 queues)
"""

# TODO: Sprint 3 (EP-04) — Implement if needed beyond Celery
