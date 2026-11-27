"""
Dashboard overview: scoping, status buckets, no 50-item limit, plant fallback.

Runs against the test database (same pattern as test_notifications.py).
"""

import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import delete

from app.db.session import async_session_factory
from app.models.company import Company
from app.models.purchase_order import PurchaseOrder
from app.models.shipment import Shipment
from app.models.supplier import Supplier
from app.services import dashboard_service as ds

TODAY = date(2026, 6, 15)


def _supplier() -> Supplier:
    code = f"T{uuid.uuid4().hex[:8]}"
    return Supplier(id=uuid.uuid4(), supplier_code=code, name=f"Test {code}", email=f"{code}@test.local")


def _po(company: Company, supplier: Supplier, status: str, *, days: int | None = 10, dest: str = "PPB1-0101", version: int = 1) -> PurchaseOrder:
    return PurchaseOrder(
        id=uuid.uuid4(),
        company_id=company.id,
        supplier_id=supplier.id,
        po_number=f"PO{uuid.uuid4().hex[:10]}",
        status=status,
        version=version,
        destination=dest,
        delivery_date=None if days is None else TODAY + timedelta(days=days),
        quantity=10,
    )


def _shipment(company: Company, supplier: Supplier, *, status: str = "XML_SENT", plant: str = "PPA2", pieces: int = 10, boxes: int = 1) -> Shipment:
    return Shipment(
        id=uuid.uuid4(),
        company_id=company.id,
        supplier_id=supplier.id,
        shipment_number=f"SH{uuid.uuid4().hex[:12]}",
        plant_code=plant,
        status=status,
        total_pieces=pieces,
        total_boxes=boxes,
        ship_date=TODAY,
    )


@pytest.fixture
async def world():
    company = Company(id=uuid.uuid4(), code=f"C{uuid.uuid4().hex[:8]}", name="Test company")
    a, b = _supplier(), _supplier()
    async with async_session_factory() as db:
        db.add_all([company, a, b])
        await db.commit()
    yield company, a, b
    async with async_session_factory() as db:
        await db.execute(delete(Shipment).where(Shipment.supplier_id.in_([a.id, b.id])))
        await db.execute(delete(PurchaseOrder).where(PurchaseOrder.company_id == company.id))
        await db.execute(delete(Supplier).where(Supplier.id.in_([a.id, b.id])))
        await db.execute(delete(Company).where(Company.id == company.id))
        await db.commit()


async def _overview_for(db, supplier: Supplier) -> dict:
    scope = await ds.build_scope(
        db,
        is_supplier=True,
        token_supplier_id=supplier.id,
        token_supplier_code=supplier.supplier_code,
        requested_supplier_id=None,
    )
    return await ds.get_overview(db, scope, today=TODAY)


async def test_supplier_never_sees_another_suppliers_numbers(world):
    company, a, b = world
    async with async_session_factory() as db:
        db.add_all([_po(company, a, "ACTIVE"), _shipment(company, a, pieces=7)])
        db.add_all([_po(company, b, "ACTIVE"), _po(company, b, "PARTIAL"), _shipment(company, b, pieces=500)])
        await db.commit()

        ov = await _overview_for(db, a)
        assert ov["kpis"]["open_orders"] == 1
        assert ov["status_breakdown"]["total"] == 1
        assert ov["kpis"]["dispatched_this_month"]["pieces"] == 7
        assert "suppliers" not in ov  # admin-only section


async def test_status_buckets_are_exclusive_and_add_up(world):
    company, a, _ = world
    async with async_session_factory() as db:
        db.add_all(
            [
                _po(company, a, "ACTIVE", version=2),  # updated by customer: a note, not a slice
                _po(company, a, "UPDATED"),
                _po(company, a, "PARTIAL"),
                _po(company, a, "SHIPPED"),
                _po(company, a, "XML_SENT"),
                _po(company, a, "COMPLETED"),
                _po(company, a, "CANCELLED"),
            ]
        )
        await db.commit()

        sb = (await _overview_for(db, a))["status_breakdown"]
        buckets = sb["open"] + sb["partially_shipped"] + sb["shipped"] + sb["completed"] + sb["cancelled"] + sb["other"]
        assert buckets == sb["total"] == 7
        assert sb["open"] == 2 and sb["partially_shipped"] == 1 and sb["shipped"] == 2
        assert sb["updated_by_customer"] == 1


async def test_deadline_buckets_add_up_to_open_orders(world):
    company, a, _ = world
    async with async_session_factory() as db:
        db.add_all(
            [
                _po(company, a, "ACTIVE", days=-2),
                _po(company, a, "ACTIVE", days=0),
                _po(company, a, "PARTIAL", days=3),
                _po(company, a, "ACTIVE", days=5),
                _po(company, a, "ACTIVE", days=30),
                _po(company, a, "ACTIVE", days=None),
                _po(company, a, "COMPLETED", days=-5),  # not open: ignored
            ]
        )
        await db.commit()

        ov = await _overview_for(db, a)
        d = ov["deadlines"]
        assert (d["overdue"], d["due_3_days"], d["due_7_days"], d["on_track"], d["no_date"]) == (1, 2, 1, 1, 1)
        assert sum(d.values()) == ov["kpis"]["open_orders"] == 6
        assert len(ov["upcoming"]) <= 6


async def test_more_than_50_shipments_are_all_counted(world):
    company, a, _ = world
    async with async_session_factory() as db:
        db.add_all([_shipment(company, a, pieces=10, boxes=1) for _ in range(60)])
        db.add(_shipment(company, a, status="PACKED", pieces=999))  # not sent yet: not dispatched
        await db.commit()

        ov = await _overview_for(db, a)
        month = ov["kpis"]["dispatched_this_month"]
        assert (month["pieces"], month["cartons"], month["shipments"]) == (600, 60, 60)
        vavuniya = next(p for p in ov["plants"] if p["plant_key"] == "VAVUNIYA")
        assert vavuniya["dispatched_pieces"] == 600


async def test_unknown_plant_goes_to_other_not_omega(world):
    company, a, _ = world
    async with async_session_factory() as db:
        db.add_all(
            [
                _shipment(company, a, plant="", pieces=5),
                _shipment(company, a, plant="ZZZ9", pieces=6),
                _po(company, a, "ACTIVE", dest=""),
            ]
        )
        await db.commit()

        plants = {p["plant_key"]: p for p in (await _overview_for(db, a))["plants"]}
        assert plants["OMEGA"]["dispatched_pieces"] == 0
        assert plants["OMEGA"]["open_orders"] == 0
        assert plants["OTHER"]["dispatched_pieces"] == 11
        assert plants["OTHER"]["open_orders"] == 1


def test_plant_group_for_never_defaults_to_omega():
    assert ds.plant_group_for(None) == ds.OTHER
    assert ds.plant_group_for("") == ds.OTHER
    assert ds.plant_group_for("Some Unknown Factory") == ds.OTHER
    assert ds.plant_group_for("PPA2") == "VAVUNIYA"
    assert ds.plant_group_for("PPE1") == "VAVUNIYA"
    assert ds.plant_group_for("PPB1-0101") == "ALPHA"
    assert ds.plant_group_for("PPA1") == "OMEGA"


async def test_admin_sees_all_suppliers_and_can_filter(world):
    company, a, b = world
    async with async_session_factory() as db:
        db.add_all([_shipment(company, a, pieces=10), _shipment(company, b, pieces=20), _po(company, b, "ACTIVE")])
        await db.commit()

        everyone = await ds.get_overview(
            db,
            await ds.build_scope(db, is_supplier=False, token_supplier_id=None, token_supplier_code=None, requested_supplier_id=None),
            today=TODAY,
        )
        mine = {s["supplier_id"]: s for s in everyone["suppliers"]}
        assert mine.get(str(b.id), {}).get("pieces") == 20 or len(everyone["suppliers"]) == ds.TOP_SUPPLIERS_LIMIT

        only_b = await ds.get_overview(
            db,
            await ds.build_scope(db, is_supplier=False, token_supplier_id=None, token_supplier_code=None, requested_supplier_id=str(b.id)),
            today=TODAY,
        )
        assert only_b["kpis"]["dispatched_this_month"]["pieces"] == 20
        assert [s["supplier_id"] for s in only_b["suppliers"]] == [str(b.id)]


async def test_supplier_token_cannot_be_widened(world):
    company, a, b = world
    async with async_session_factory() as db:
        db.add(_shipment(company, b, pieces=99))
        await db.commit()
        # A supplier token asking for another supplier still only gets its own scope.
        scope = await ds.build_scope(
            db, is_supplier=True, token_supplier_id=a.id, token_supplier_code=a.supplier_code, requested_supplier_id=str(b.id)
        )
        ov = await ds.get_overview(db, scope, today=TODAY)
        assert ov["kpis"]["dispatched_this_month"]["pieces"] == 0
