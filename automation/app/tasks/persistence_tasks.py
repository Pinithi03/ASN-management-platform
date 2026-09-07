"""
Data persistence tasks.

Tasks:
    - persist_parsed_data: Upserts PO data with conflict resolution
      (ON CONFLICT company_id + client_code + po_number DO UPDATE)
    - store_attachment: Uploads email attachments to MinIO
    - update_email_status: Marks email as processed/failed

Queue: email.persistence
"""

# TODO: Sprint 5 (EP-05) — Implement persistence
