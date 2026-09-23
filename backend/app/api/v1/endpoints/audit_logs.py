# backend/app/api/v1/endpoints/audit_logs.py
"""
Audit Logs API Endpoints — Admin-only audit trail search & retrieval.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, func, select, cast, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.audit_log import AuditLog
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Pydantic Schemas ───────────────────────────────────────────

class UserSummary(BaseModel):
    id: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None

    model_config = {"from_attributes": True}


class AuditLogListItem(BaseModel):
    id: str
    company_id: str
    user_id: Optional[str] = None
    user: Optional[UserSummary] = None
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    old_values: Optional[dict] = None
    new_values: Optional[dict] = None
    ip_address: Optional[str] = None
    metadata: Optional[dict] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedAuditLogResponse(BaseModel):
    items: list[AuditLogListItem]
    total: int
    page: int
    per_page: int
    pages: int


class CreateAuditLogRequest(BaseModel):
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    old_values: Optional[dict] = None
    new_values: Optional[dict] = None
    metadata: Optional[dict] = None
    company_id: Optional[str] = None
    user_id: Optional[str] = None


# ─── GET / — List Audit Logs (Admin Only) ───────────────────────

@router.get("", response_model=PaginatedAuditLogResponse)
@router.get("/", response_model=PaginatedAuditLogResponse, include_in_schema=False)
async def list_audit_logs(
    db: AsyncSession = Depends(get_db),
    action: Optional[str] = Query(None, description="Filter by action (e.g. CREATE, UPDATE, DELETE, CONFIG_CHANGED)"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type (e.g. SUPPLIER, EMAIL, CONFIG)"),
    search: Optional[str] = Query(None, description="Search action, entity, metadata, or IP"),
    company_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """
    List audit trail entries with filtering, search, and pagination.
    Strictly for Administrative Portal use.
    """
    query = select(AuditLog).options(selectinload(AuditLog.user))

    if company_id:
        query = query.where(AuditLog.company_id == company_id)
    if action:
        query = query.where(AuditLog.action == action.upper())
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type.upper())

    if search:
        search_filter = f"%{search}%"
        query = query.where(
            AuditLog.action.ilike(search_filter)
            | AuditLog.entity_type.ilike(search_filter)
            | cast(AuditLog.metadata_, String).ilike(search_filter)
            | AuditLog.ip_address.ilike(search_filter)
        )

    # Count total matching records
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Order by newest first
    query = query.order_by(desc(AuditLog.created_at))
    query = query.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(query)
    records = result.scalars().all()

    pages = max(1, (total + per_page - 1) // per_page)

    items = []
    for r in records:
        u_summary = None
        if r.user:
            u_summary = UserSummary(
                id=str(r.user.id),
                full_name=r.user.full_name,
                email=r.user.email,
                role=r.user.role,
            )

        items.append(
            AuditLogListItem(
                id=str(r.id),
                company_id=str(r.company_id),
                user_id=str(r.user_id) if r.user_id else None,
                user=u_summary,
                action=r.action,
                entity_type=r.entity_type,
                entity_id=str(r.entity_id) if r.entity_id else None,
                old_values=r.old_values,
                new_values=r.new_values,
                ip_address=r.ip_address,
                metadata=r.metadata_,
                created_at=r.created_at,
            )
        )

    return PaginatedAuditLogResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


# ─── POST / — Create Audit Log Record ───────────────────────────

@router.post("", response_model=AuditLogListItem)
@router.post("/", response_model=AuditLogListItem, include_in_schema=False)
async def create_audit_log_endpoint(
    body: CreateAuditLogRequest,
    db: AsyncSession = Depends(get_db),
):
    """Record an audit trail event from administrative operations."""
    from app.services.audit_service import create_audit_log
    from app.core.config import get_settings

    settings = get_settings()
    target_company_id = body.company_id or settings.DEFAULT_COMPANY_ID

    if not target_company_id:
        raise HTTPException(status_code=400, detail="company_id is required")

    log_entry = await create_audit_log(
        db=db,
        company_id=target_company_id,
        action=body.action,
        entity_type=body.entity_type,
        user_id=body.user_id,
        entity_id=body.entity_id,
        old_values=body.old_values,
        new_values=body.new_values,
        metadata=body.metadata,
    )
    await db.commit()

    return AuditLogListItem(
        id=str(log_entry.id),
        company_id=str(log_entry.company_id),
        user_id=str(log_entry.user_id) if log_entry.user_id else None,
        user=None,
        action=log_entry.action,
        entity_type=log_entry.entity_type,
        entity_id=str(log_entry.entity_id) if log_entry.entity_id else None,
        old_values=log_entry.old_values,
        new_values=log_entry.new_values,
        ip_address=log_entry.ip_address,
        metadata=log_entry.metadata_,
        created_at=log_entry.created_at,
    )
