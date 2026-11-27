"""
Dashboard API — /api/v1/dashboard

Read-only. Suppliers are always scoped to the supplier in their token;
admins see all suppliers, or one with `?supplier_id=`.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import CurrentUser, UserRole, get_current_user, get_db
from app.services import dashboard_service

router = APIRouter()


@router.get("/overview")
async def overview(
    supplier_id: Optional[str] = Query(None, description="Admins only: filter by supplier UUID or code"),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, Any]:
    """KPIs, status breakdown, monthly dispatch, deadlines, plants and upcoming deliveries."""
    is_supplier = current_user.role == UserRole.SUPPLIER
    scope = await dashboard_service.build_scope(
        db,
        is_supplier=is_supplier,
        token_supplier_id=current_user.supplier_id,
        token_supplier_code=current_user.supplier_code,
        requested_supplier_id=None if is_supplier else supplier_id,
    )
    return await dashboard_service.get_overview(db, scope)
