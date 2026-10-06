"""
API v1 Router — aggregates all endpoint routers.

Every router except health has get_current_user as a dependency,
so an unauthenticated request gets 401 before reaching any endpoint.
Individual endpoints add their own require_permission / require_admin
checks on top of that.
"""

from fastapi import APIRouter, Depends

from app.api.v1.deps import get_current_user
from app.api.v1.endpoints import (
    asn,
    auth,
    emails,
    health,
    purchase_orders,
    shipments,
    suppliers,
    users,
)

api_router = APIRouter()

# ─── Health (no auth) ───────────────────────────────────────
api_router.include_router(
    health.router,
    tags=["Health"],
)

# ─── All other routers require a valid Keycloak token ───────
_auth_dep = [Depends(get_current_user)]

api_router.include_router(
    auth.router,
    prefix="/auth",
    tags=["Authentication"],
    dependencies=_auth_dep,
)
api_router.include_router(
    users.router,
    prefix="/users",
    tags=["User Management"],
    dependencies=_auth_dep,
)
api_router.include_router(
    emails.router,
    prefix="/emails",
    tags=["Emails"],
    dependencies=_auth_dep,
)
api_router.include_router(
    purchase_orders.router,
    prefix="/purchase-orders",
    tags=["Purchase Orders"],
    dependencies=_auth_dep,
)
api_router.include_router(
    shipments.router,
    prefix="/shipments",
    tags=["Shipments"],
    dependencies=_auth_dep,
)
api_router.include_router(
    asn.router,
    prefix="/asn",
    tags=["ASN"],
    dependencies=_auth_dep,
)
api_router.include_router(
    suppliers.router,
    prefix="/suppliers",
    tags=["Suppliers"],
    dependencies=_auth_dep,
)
