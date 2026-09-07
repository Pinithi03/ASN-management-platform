"""
Email parsing tasks.

Tasks:
    - parse_email: Runs the 3-tier parser chain on a single email
    - calculate_confidence: Computes weighted confidence score
    - route_by_confidence: Routes to auto-commit or human review queue

Queue: email.processing
Retry: 3 attempts with exponential backoff
"""

# TODO: Sprint 4-5 (EP-05) — Implement parsing pipeline
