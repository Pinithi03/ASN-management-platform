"""
Notification service — one place to create and read in-app notifications.

Creating:
    await notification_service.notify_supplier(db, supplier_id, "PO_RECEIVED", ...)
    await notification_service.notify_admins(db, "SUPPLIER_ONBOARDED", ...)
  The row is added inside a SAVEPOINT on the caller's session and committed
  with the caller's transaction. A failure here is logged and swallowed, so a
  notification can never break the main action (PO ingest, shipment, ASN...).

Reading (always scoped to the current user — never to request input):
    Admins (ADMIN / SUPER_ADMIN) see ADMIN notifications.
    Suppliers see SUPPLIER notifications for the supplier_id in their token.
  Read state is per reader (Keycloak "sub") in notification_reads.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import and_, exists, false, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification, NotificationRead

logger = logging.getLogger(__name__)

ADMIN = "ADMIN"
SUPPLIER = "SUPPLIER"


# ─── Creating ──────────────────────────────────────────────────────────


async def create(
    db: AsyncSession,
    *,
    recipient_type: str,
    type: str,
    title_key: str,
    params: Optional[dict[str, Any]] = None,
    link: Optional[str] = None,
    supplier_id: Optional[uuid.UUID] = None,
) -> Optional[Notification]:
    """Add a notification in a savepoint. Never raises."""
    if recipient_type == SUPPLIER and not supplier_id:
        return None
    try:
        async with db.begin_nested():
            n = Notification(
                recipient_type=recipient_type,
                supplier_id=supplier_id if recipient_type == SUPPLIER else None,
                type=type,
                title_key=title_key,
                params={k: (str(v) if v is not None else "") for k, v in (params or {}).items()},
                link=link,
            )
            db.add(n)
            await db.flush()
        return n
    except Exception:  # noqa: BLE001 — a notification must never break the caller
        logger.warning("Could not create %s notification %s", recipient_type, type, exc_info=True)
        return None


async def notify_admins(
    db: AsyncSession, type: str, *, params: Optional[dict[str, Any]] = None, link: Optional[str] = None
) -> Optional[Notification]:
    return await create(
        db, recipient_type=ADMIN, type=type, title_key=f"notif.{type}", params=params, link=link
    )


async def notify_supplier(
    db: AsyncSession,
    supplier_id: Optional[uuid.UUID],
    type: str,
    *,
    params: Optional[dict[str, Any]] = None,
    link: Optional[str] = None,
) -> Optional[Notification]:
    return await create(
        db,
        recipient_type=SUPPLIER,
        supplier_id=supplier_id,
        type=type,
        title_key=f"notif.{type}",
        params=params,
        link=link,
    )


# ─── Reading (scoped) ──────────────────────────────────────────────────


@dataclass(frozen=True)
class Audience:
    """Who is asking. Built from the verified token, never from request input."""

    recipient_type: str
    reader_id: str
    supplier_id: Optional[uuid.UUID] = None

    @classmethod
    def for_user(cls, user: Any) -> "Audience":
        role = getattr(getattr(user, "role", None), "value", getattr(user, "role", ""))
        if role in ("ADMIN", "SUPER_ADMIN"):
            return cls(recipient_type=ADMIN, reader_id=user.keycloak_id)
        return cls(recipient_type=SUPPLIER, reader_id=user.keycloak_id, supplier_id=user.supplier_id)


def _visible(aud: Audience):
    if aud.recipient_type == ADMIN:
        return Notification.recipient_type == ADMIN
    if not aud.supplier_id:
        return false()
    return and_(Notification.recipient_type == SUPPLIER, Notification.supplier_id == aud.supplier_id)


def _is_read(aud: Audience):
    return exists().where(
        and_(NotificationRead.notification_id == Notification.id, NotificationRead.reader_id == aud.reader_id)
    )


async def list_notifications(
    db: AsyncSession,
    aud: Audience,
    *,
    unread_only: bool = False,
    limit: int = 30,
    before: Optional[datetime] = None,
) -> list[tuple[Notification, bool]]:
    """Newest first. Returns (notification, is_read) pairs."""
    is_read = _is_read(aud)
    stmt = select(Notification, is_read.label("is_read")).where(_visible(aud))
    if unread_only:
        stmt = stmt.where(~is_read)
    if before is not None:
        stmt = stmt.where(Notification.created_at < before)
    stmt = stmt.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(max(1, min(limit, 100)))
    rows = (await db.execute(stmt)).all()
    return [(row[0], bool(row[1])) for row in rows]


async def unread_count(db: AsyncSession, aud: Audience) -> int:
    stmt = select(func.count()).select_from(Notification).where(_visible(aud), ~_is_read(aud))
    return int((await db.execute(stmt)).scalar_one())


async def mark_read(db: AsyncSession, aud: Audience, notification_id: uuid.UUID) -> bool:
    """Mark one notification read. False when it doesn't exist or isn't visible to this user."""
    visible = await db.scalar(
        select(Notification.id).where(Notification.id == notification_id, _visible(aud))
    )
    if not visible:
        return False
    await db.execute(
        pg_insert(NotificationRead)
        .values(notification_id=notification_id, reader_id=aud.reader_id)
        .on_conflict_do_nothing()
    )
    await db.commit()
    return True


async def mark_all_read(db: AsyncSession, aud: Audience) -> int:
    """Mark every visible unread notification read. Returns how many were marked."""
    ids = (
        await db.execute(select(Notification.id).where(_visible(aud), ~_is_read(aud)))
    ).scalars().all()
    if ids:
        await db.execute(
            pg_insert(NotificationRead)
            .values([{"notification_id": i, "reader_id": aud.reader_id} for i in ids])
            .on_conflict_do_nothing()
        )
    await db.commit()
    return len(ids)
