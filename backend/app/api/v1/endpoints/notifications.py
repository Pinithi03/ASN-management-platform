"""
Notifications API — /api/v1/notifications

Always scoped to the current user (from the verified token):
  - admins see ADMIN notifications
  - suppliers see only their own supplier's notifications
Nothing in the request can widen that scope.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import CurrentUser, get_current_user, get_db
from app.core.exceptions import CodedHTTPException
from app.services import notification_service
from app.services.notification_service import Audience

router = APIRouter()


class NotificationOut(BaseModel):
    id: str
    type: str
    title_key: str
    params: dict[str, Any]
    link: Optional[str] = None
    created_at: datetime
    read: bool


class NotificationPage(BaseModel):
    items: list[NotificationOut]
    next_before: Optional[datetime] = None


@router.get("", response_model=NotificationPage)
@router.get("/", response_model=NotificationPage, include_in_schema=False)
async def list_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(30, ge=1, le=100),
    before: Optional[datetime] = Query(None, description="Return items created before this time (pagination)"),
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationPage:
    rows = await notification_service.list_notifications(
        db, Audience.for_user(user), unread_only=unread_only, limit=limit, before=before
    )
    items = [
        NotificationOut(
            id=str(n.id),
            type=n.type,
            title_key=n.title_key,
            params=n.params or {},
            link=n.link,
            created_at=n.created_at,
            read=is_read,
        )
        for n, is_read in rows
    ]
    next_before = items[-1].created_at if len(items) == limit else None
    return NotificationPage(items=items, next_before=next_before)


@router.get("/unread-count")
async def get_unread_count(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    return {"count": await notification_service.unread_count(db, Audience.for_user(user))}


@router.post("/read-all")
async def mark_all_read(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    return {"marked": await notification_service.mark_all_read(db, Audience.for_user(user))}


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: uuid.UUID,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    ok = await notification_service.mark_read(db, Audience.for_user(user), notification_id)
    if not ok:
        # Same answer for "doesn't exist" and "belongs to someone else" — no information leak.
        raise CodedHTTPException(
            code="NOTIFICATION_NOT_FOUND", status_code=404, detail="Notification not found"
        )
    return {"ok": True}
