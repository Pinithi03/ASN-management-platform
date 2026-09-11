"""
API v1 router aggregation.
Mounts all endpoint routers under /api/v1.
"""

from fastapi import APIRouter
from app.api.v1.endpoints import health, emails, shipments, asn, purchase_orders

api_router = APIRouter()

# Health endpoints
api_router.include_router(health.router)

# Email ingestion & processing
api_router.include_router(emails.router, prefix="/emails", tags=["Emails"])

# Purchase Orders
api_router.include_router(purchase_orders.router, prefix="/purchase-orders", tags=["Purchase Orders"])

# Shipments (Excel upload, HU allocation, Label generation)
api_router.include_router(shipments.router, prefix="/shipments", tags=["Shipments"])

# Advanced Shipping Notifications (XML generation, validation, dispatch)
api_router.include_router(asn.router, prefix="/asn", tags=["ASN"])

