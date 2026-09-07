"""
Health API endpoints (Presentation Layer).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.db.session import get_db

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    """Basic health check — returns OK if the app is running."""
    return {
        "status": "ok",
        "service": "ans-backend",
        "version": "0.1.0",
    }


@router.get("/health/ready")
async def readiness_check(db: AsyncSession = Depends(get_db)):
    """Readiness check — verifies database connectivity."""
    checks = {"database": "unknown"}
    try:
        result = await db.execute(text("SELECT 1"))
        result.scalar()
        checks["database"] = "connected"
    except Exception as e:
        checks["database"] = f"error: {str(e)}"
        return {"status": "degraded", "checks": checks}

    return {"status": "ready", "checks": checks}
