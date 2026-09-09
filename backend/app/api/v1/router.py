"""
API v1 router aggregation.
Mounts all endpoint routers under /api/v1.
"""

from fastapi import APIRouter
from app.api.v1.endpoints import health, emails

api_router = APIRouter()

# Health endpoints (no prefix — mounted at /api/v1/health)
api_router.include_router(health.router)

# Future Sprint routers will be added here:
# api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
# api_router.include_router(companies.router, prefix="/companies", tags=["Companies"])
# api_router.include_router(purchase_orders.router, prefix="/purchase-orders", tags=["Purchase Orders"])
api_router.include_router(emails.router, prefix="/emails", tags=["Emails"])
# api_router.include_router(asn.router, prefix="/asn", tags=["ASN"])
# api_router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
# api_router.include_router(users.router, prefix="/users", tags=["Users"])
