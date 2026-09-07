"""
Email ingestion tasks.

Tasks:
    - fetch_emails_for_company: Connects to Outlook via Graph API,
      fetches new emails since last check, publishes to processing queue
    - fetch_all_companies: Periodic beat task that triggers per-company fetches

Queue: email.ingestion
Schedule: Every 2 minutes (configurable per company)
"""

# TODO: Sprint 3-4 (EP-04) — Implement email ingestion
