"""
Celery task definitions (Presentation Layer for System B).

Tasks are the entry points — they receive messages from RabbitMQ queues
and call Services for business logic. Tasks handle retries and error
reporting but contain no business logic themselves.
"""
