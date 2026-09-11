"""
API v1 Router — aggregates all endpoint routers.
"""

from fastapi import APIRouter

from app.api.v1.endpoints import health, emails, purchase_orders

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

# ─── Future Sprint Routers (uncomment when ready) ───────────────
# from app.api.v1.endpoints import auth, companies, asn, dashboard, users
#
# api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
# api_router.include_router(companies.router, prefix="/companies", tags=["Companies"])
# api_router.include_router(asn.router, prefix="/asn", tags=["ASN"])
# api_router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
# api_router.include_router(users.router, prefix="/users", tags=["Users"])