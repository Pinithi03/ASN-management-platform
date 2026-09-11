"""
API v1 Router — aggregates all endpoint routers.
"""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    asn,
    emails,
    health,
    purchase_orders,
    shipments,
)

api_router = APIRouter()

# ─── Active Routers ─────────────────────────────────────────────
api_router.include_router(
    health.router,
    tags=["Health"],
)
api_router.include_router(
    emails.router,
    prefix="/emails",
    tags=["Emails"],
)
api_router.include_router(
    purchase_orders.router,
    prefix="/purchase-orders",
    tags=["Purchase Orders"],
)
api_router.include_router(
    shipments.router,
    prefix="/shipments",
    tags=["Shipments"],
)
api_router.include_router(
    asn.router,
    prefix="/asn",
    tags=["ASN"],
)
