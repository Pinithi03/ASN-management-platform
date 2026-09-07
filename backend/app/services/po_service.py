"""
Purchase Order Service.

Handles:
    - PO CRUD with upsert logic (ON CONFLICT company_id + client_code + po_number)
    - PO line item management
    - Version tracking for PO updates
    - PO search and filtering
    - Confidence-based auto-commit vs human review routing

Calls: PORepository, CompanyRepository
Called by: purchase_orders endpoints, email automation (System B)
"""

# TODO: Sprint 3-4 (EP-05) — Implement PO management
