"""
ASN (Advanced Shipping Notice) Service.

Handles:
    - ASN creation wizard (4-step: Plant → PO Lines → Box Data → Review)
    - Handling Unit (HU) management
    - Packing slip generation
    - Code 39 barcode generation (6×4 inch labels)
    - ASN XML generation for IUNGO gateway
    - ASN status lifecycle management

Calls: ASNRepository, PORepository, MinIO client
Called by: asn endpoints
"""

# TODO: Sprint 7-9 (EP-07, EP-08) — Implement ASN workflow
