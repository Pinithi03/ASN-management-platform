"""
Email Management Service (System A side).

Handles:
    - Email listing and search for the web UI
    - Email status tracking and display
    - Manual email re-processing triggers
    - Email attachment viewing

Note: Actual email ingestion and parsing runs in System B (automation/).
This service provides the web UI's view into email data.

Calls: EmailRepository
Called by: emails endpoints
"""

# TODO: Sprint 5-6 (EP-06) — Implement email UI service
