"""
Event schemas for inter-system communication via RabbitMQ.

Events are Pydantic models serialized as JSON messages.
Both System A and System B import these to ensure
producer/consumer contract alignment.
"""

# TODO: Sprint 3 — Define event schemas
# from pydantic import BaseModel
# from datetime import datetime
# from uuid import UUID
#
# class EmailReceivedEvent(BaseModel):
#     email_id: UUID
#     company_id: UUID
#     sender: str
#     subject: str
#     received_at: datetime
#     has_attachments: bool
#
# class EmailProcessedEvent(BaseModel):
#     email_id: UUID
#     company_id: UUID
#     status: str
#     confidence_score: float
#     po_numbers: list[str]
#     parser_used: str
