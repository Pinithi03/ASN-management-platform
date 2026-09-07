"""
API v1 Router Aggregator.

Collects all endpoint routers and mounts them under /api/v1.
This is the single entry point included in the FastAPI app.

Usage in main.py:
    from app.api.v1.router import api_router
    app.include_router(api_router, prefix="/api/v1")
"""

# TODO: Sprint 1 — Import and include sub-routers
# from fastapi import APIRouter
# from app.api.v1.endpoints import auth, health, companies, ...
#
# api_router = APIRouter()
# api_router.include_router(health.router, prefix="/health", tags=["Health"])
# api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
# api_router.include_router(companies.router, prefix="/companies", tags=["Companies"])
