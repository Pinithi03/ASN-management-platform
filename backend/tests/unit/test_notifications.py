"""
Notifications: supplier scoping and read / read-all.

Runs against the test database (same pattern as test_hu_service.py).
Needs the notifications migration: `alembic upgrade head`.
"""

import uuid

import pytest
from sqlalchemy import delete, select

from app.db.session import async_session_factory
from app.models.notification import Notification, NotificationRead
from app.models.supplier import Supplier
from app.services import notification_service as ns
from app.services.notification_service import ADMIN, SUPPLIER, Audience


def _supplier() -> Supplier:
    code = f"T{uuid.uuid4().hex[:8]}"
    return Supplier(id=uuid.uuid4(), supplier_code=code, name=f"Test {code}", email=f"{code}@test.local")


@pytest.fixture
async def two_suppliers():
    a, b = _supplier(), _supplier()
    async with async_session_factory() as db:
        db.add_all([a, b])
        await db.commit()
    yield a, b
    async with async_session_factory() as db:
        await db.execute(delete(Notification).where(Notification.supplier_id.in_([a.id, b.id])))
        await db.execute(delete(Supplier).where(Supplier.id.in_([a.id, b.id])))
        await db.commit()


@pytest.fixture
async def admin_cleanup():
    created: list[uuid.UUID] = []
    yield created
    async with async_session_factory() as db:
        if created:
            await db.execute(delete(Notification).where(Notification.id.in_(created)))
        await db.commit()


async def test_supplier_sees_only_own_notifications(two_suppliers):
    a, b = two_suppliers
    async with async_session_factory() as db:
        await ns.notify_supplier(db, a.id, "PO_RECEIVED", params={"po": "A-1"})
        await ns.notify_supplier(db, b.id, "PO_RECEIVED", params={"po": "B-1"})
        await db.commit()

        aud_a = Audience(recipient_type=SUPPLIER, reader_id=f"kc-{a.id}", supplier_id=a.id)
        rows = await ns.list_notifications(db, aud_a)
        assert [n.params["po"] for n, _ in rows] == ["A-1"]
        assert await ns.unread_count(db, aud_a) == 1


async def test_supplier_cannot_mark_another_suppliers_notification(two_suppliers):
    a, b = two_suppliers
    async with async_session_factory() as db:
        n_b = await ns.notify_supplier(db, b.id, "SHIPMENT_CREATED", params={"shipment": "S-1"})
        await db.commit()

        aud_a = Audience(recipient_type=SUPPLIER, reader_id=f"kc-{a.id}", supplier_id=a.id)
        assert await ns.mark_read(db, aud_a, n_b.id) is False

        aud_b = Audience(recipient_type=SUPPLIER, reader_id=f"kc-{b.id}", supplier_id=b.id)
        assert await ns.unread_count(db, aud_b) == 1


async def test_supplier_without_supplier_id_sees_nothing(two_suppliers):
    a, _ = two_suppliers
    async with async_session_factory() as db:
        await ns.notify_supplier(db, a.id, "PO_RECEIVED", params={"po": "A-2"})
        await db.commit()
        aud = Audience(recipient_type=SUPPLIER, reader_id="kc-orphan", supplier_id=None)
        assert await ns.list_notifications(db, aud) == []
        assert await ns.unread_count(db, aud) == 0


async def test_read_and_read_all_are_per_reader(two_suppliers):
    a, _ = two_suppliers
    async with async_session_factory() as db:
        n1 = await ns.notify_supplier(db, a.id, "PO_RECEIVED", params={"po": "A-3"})
        await ns.notify_supplier(db, a.id, "PO_UPDATED", params={"po": "A-3", "version": 2})
        await db.commit()

        reader1 = Audience(recipient_type=SUPPLIER, reader_id="kc-reader-1", supplier_id=a.id)
        reader2 = Audience(recipient_type=SUPPLIER, reader_id="kc-reader-2", supplier_id=a.id)

        assert await ns.mark_read(db, reader1, n1.id) is True
        assert await ns.mark_read(db, reader1, n1.id) is True  # idempotent
        assert await ns.unread_count(db, reader1) == 1
        assert await ns.unread_count(db, reader2) == 2

        assert await ns.mark_all_read(db, reader1) == 1
        assert await ns.unread_count(db, reader1) == 0
        assert await ns.unread_count(db, reader2) == 2

        unread_only = await ns.list_notifications(db, reader1, unread_only=True)
        assert unread_only == []
        all_items = await ns.list_notifications(db, reader1)
        assert len(all_items) == 2 and all(is_read for _, is_read in all_items)

        reads = (await db.execute(select(NotificationRead).where(NotificationRead.reader_id == "kc-reader-1"))).scalars().all()
        assert len(reads) == 2


async def test_admins_do_not_see_supplier_notifications(two_suppliers, admin_cleanup):
    a, _ = two_suppliers
    async with async_session_factory() as db:
        await ns.notify_supplier(db, a.id, "PO_RECEIVED", params={"po": "A-4"})
        admin_n = await ns.notify_admins(db, "SUPPLIER_ONBOARDED", params={"name": a.name, "code": a.supplier_code})
        await db.commit()
        admin_cleanup.append(admin_n.id)

        admin = Audience(recipient_type=ADMIN, reader_id="kc-admin-test")
        ids = {n.id for n, _ in await ns.list_notifications(db, admin, limit=100)}
        assert admin_n.id in ids
        assert all(n.recipient_type == ADMIN for n, _ in await ns.list_notifications(db, admin, limit=100))

        supplier = Audience(recipient_type=SUPPLIER, reader_id=f"kc-{a.id}", supplier_id=a.id)
        assert await ns.mark_read(db, supplier, admin_n.id) is False


async def test_supplier_notification_without_supplier_is_skipped():
    async with async_session_factory() as db:
        assert await ns.notify_supplier(db, None, "PO_RECEIVED", params={"po": "X"}) is None
