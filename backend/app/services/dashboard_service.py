"""
Dashboard overview: correct, unlimited aggregates for the Overview page.

Everything is computed with SQL aggregates over *all* matching rows (no
pagination limits). Plant names are resolved in Python only for the distinct
destination values returned by the GROUP BY.

Rules:
  - PO status buckets are mutually exclusive (status only) and add up to `total`.
    `updated_by_customer` (version > 1) is a separate note, not a bucket.
  - Open orders = ACTIVE + PARTIAL + UPDATED, each PO counted once.
  - Dispatched = shipments that were actually sent (XML_SENT and later);
    drafts, packing, packed (not yet sent) and rejected shipments don't count.
  - Dates are business dates in Asia/Colombo (UTC+05:30, no DST).
  - Unknown / empty plants go to "OTHER", never to Omega (PPA1).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import Date, String, and_, cast, false, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.plant_resolver import resolve_plant_and_location
from app.models.purchase_order import PurchaseOrder
from app.models.shipment import Shipment
from app.models.supplier import Supplier
from app.repositories.po_repo import PORepository, apply_supplier_scope

# Sri Lanka has no daylight saving time, so a fixed offset is exact.
COLOMBO_TZ = timezone(timedelta(hours=5, minutes=30), name="Asia/Colombo")

OPEN_STATUSES = ("ACTIVE", "PARTIAL", "UPDATED")
SHIPPED_STATUSES = ("SHIPPED", "XML_SENT", "SHIPMENT_RECEIVED")
DISPATCHED_SHIPMENT_STATUSES = ("XML_SENT", "RECEIVED", "ACCEPTED", "DISPATCHED", "DELIVERED")

# Plant groups shown on the Overview (codes match the frontend's KNOWN_PLANTS).
PLANTS: dict[str, dict[str, str]] = {
    "OMEGA": {"code": "PPA1", "name": "Omega Line Ltd"},
    "ALPHA": {"code": "PPB1", "name": "Alpha Apparels Ltd"},
    "BENJI": {"code": "PPC1", "name": "Benji Ltd"},
    "SIRIO": {"code": "PPD1", "name": "Sirio Ltd"},
    "VAVUNIYA": {"code": "PPA2", "name": "Vavuniya Apparels Ltd"},
}
OTHER = "OTHER"
UPCOMING_LIMIT = 6
RECENT_SHIPMENTS_LIMIT = 5
TOP_SUPPLIERS_LIMIT = 6


def colombo_today(now: Optional[datetime] = None) -> date:
    return (now or datetime.now(timezone.utc)).astimezone(COLOMBO_TZ).date()


def plant_group_for(*values: Optional[str], stored_group: Optional[str] = None) -> str:
    """Resolve a destination / plant code to a plant group, or OTHER when unknown.

    Wraps the shared resolver but never falls back to Omega: the resolver returns
    Omega for empty input and for unrecognised text, which would put every
    unknown destination under PPA1.
    """
    if stored_group and stored_group.strip().upper() in PLANTS:
        return stored_group.strip().upper()
    parts = [v.strip() for v in values if v and v.strip()]
    if not parts:
        return OTHER
    res = resolve_plant_and_location(parts[0], fallback_client_code=parts[1] if len(parts) > 1 else None)
    group = (res.get("plant_group") or "").upper()
    if group not in PLANTS:
        return OTHER
    if group == "OMEGA":
        # The resolver's catch-all branch also returns OMEGA, with the raw text as the name.
        text = " ".join(parts).lower()
        if res.get("plant_name") != "Omega Line Ltd" and not any(
            tok in text for tok in ("omega", "ppa", "sandalankawa", "1001")
        ):
            return OTHER
    return group


def _days_priority(d: int) -> int:
    """Same ordering as the previous client-side 'upcoming' queue."""
    if d == 0:
        return 0
    if 0 < d <= 7:
        return d
    if -14 <= d < 0:
        return 10 + abs(d)
    if 7 < d <= 30:
        return 30 + d
    if -60 <= d < -14:
        return 100 + abs(d)
    return 1000 + abs(d)


@dataclass(frozen=True)
class Scope:
    """Who the numbers are for. `po_scope` feeds apply_supplier_scope (same as the PO list)."""

    po_scope: Optional[str]
    shipment_supplier_ids: Optional[list[uuid.UUID]]  # None = all suppliers
    is_admin: bool


async def build_scope(
    db: AsyncSession,
    *,
    is_supplier: bool,
    token_supplier_id: Optional[uuid.UUID],
    token_supplier_code: Optional[str],
    requested_supplier_id: Optional[str],
) -> Scope:
    if is_supplier:
        # Always from the token; the request can't widen it.
        po_scope = str(token_supplier_id or token_supplier_code or "")
        ids: list[uuid.UUID] = []
        if token_supplier_id:
            ids.append(token_supplier_id)
        elif token_supplier_code:
            res = await db.execute(select(Supplier.id).where(Supplier.supplier_code == token_supplier_code))
            ids.extend(res.scalars().all())
        # A supplier token with no identity must see nothing, not everything.
        return Scope(po_scope=po_scope or f"__none__{uuid.uuid4()}", shipment_supplier_ids=ids, is_admin=False)

    if requested_supplier_id:
        ids = []
        try:
            ids.append(uuid.UUID(requested_supplier_id))
        except (ValueError, TypeError):
            res = await db.execute(select(Supplier.id).where(Supplier.supplier_code == requested_supplier_id))
            ids.extend(res.scalars().all())
        return Scope(po_scope=requested_supplier_id, shipment_supplier_ids=ids, is_admin=True)
    return Scope(po_scope=None, shipment_supplier_ids=None, is_admin=True)


def _scoped_shipments(stmt: Any, scope: Scope) -> Any:
    if scope.shipment_supplier_ids is None:
        return stmt
    if not scope.shipment_supplier_ids:
        return stmt.where(false())
    return stmt.where(Shipment.supplier_id.in_(scope.shipment_supplier_ids))


def _month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _last_months(today: date, n: int = 6) -> list[str]:
    keys = []
    y, m = today.year, today.month
    for _ in range(n):
        keys.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return list(reversed(keys))


async def get_overview(db: AsyncSession, scope: Scope, *, today: Optional[date] = None) -> dict[str, Any]:
    today = today or colombo_today()
    months = _last_months(today)
    six_months_start = date(int(months[0][:4]), int(months[0][5:]), 1)
    prev_month = months[-2]

    # ── PO status buckets (mutually exclusive) + deadlines ───────────────
    S = PurchaseOrder.status
    is_open = S.in_(OPEN_STATUSES)
    dd = PurchaseOrder.delivery_date
    po_q = select(
        func.count().label("total"),
        func.count().filter(S.in_(("ACTIVE", "UPDATED"))).label("open"),
        func.count().filter(S == "PARTIAL").label("partially_shipped"),
        func.count().filter(S.in_(SHIPPED_STATUSES)).label("shipped"),
        func.count().filter(S == "COMPLETED").label("completed"),
        func.count().filter(S == "CANCELLED").label("cancelled"),
        func.count().filter(PurchaseOrder.version > 1).label("updated_by_customer"),
        func.count().filter(and_(is_open, dd < today)).label("overdue"),
        func.count().filter(and_(is_open, dd >= today, dd <= today + timedelta(days=3))).label("due_3"),
        func.count()
        .filter(and_(is_open, dd > today + timedelta(days=3), dd <= today + timedelta(days=7)))
        .label("due_7"),
        func.count().filter(and_(is_open, dd > today + timedelta(days=7))).label("on_track"),
        func.count().filter(and_(is_open, dd.is_(None))).label("no_date"),
    ).select_from(PurchaseOrder)
    row = (await db.execute(apply_supplier_scope(po_q, scope.po_scope))).one()

    known = row.open + row.partially_shipped + row.shipped + row.completed + row.cancelled
    status_breakdown = {
        "open": row.open,
        "partially_shipped": row.partially_shipped,
        "shipped": row.shipped,
        "completed": row.completed,
        "cancelled": row.cancelled,
        # Any status outside the known lifecycle, so the buckets always add up to total.
        "other": row.total - known,
        "total": row.total,
        "updated_by_customer": row.updated_by_customer,
    }
    open_orders = row.open + row.partially_shipped
    deadlines = {
        "overdue": row.overdue,
        "due_3_days": row.due_3,
        "due_7_days": row.due_7,
        "on_track": row.on_track,
        "no_date": row.no_date,
    }

    # ── Shipments: dispatched totals by month and by plant ───────────────
    ship_day = func.coalesce(
        Shipment.ship_date,
        cast(func.timezone(literal_column("'Asia/Colombo'"), Shipment.created_at), Date),
    )
    # Constants are inlined (not bound parameters) so the SELECT and GROUP BY expressions
    # are identical for Postgres.
    month_expr = func.to_char(ship_day, literal_column("'YYYY-MM'"))
    dispatched = Shipment.status.in_(DISPATCHED_SHIPMENT_STATUSES)

    monthly_q = _scoped_shipments(
        select(
            month_expr.label("month"),
            func.coalesce(func.sum(Shipment.total_pieces), 0).label("pieces"),
            func.coalesce(func.sum(Shipment.total_boxes), 0).label("cartons"),
            func.count().label("shipments"),
        )
        .where(dispatched, ship_day >= six_months_start)
        .group_by(month_expr),
        scope,
    )
    by_month = {r.month: r for r in (await db.execute(monthly_q)).all()}
    monthly = [
        {
            "month": m,
            "pieces": int(by_month[m].pieces) if m in by_month else 0,
            "cartons": int(by_month[m].cartons) if m in by_month else 0,
            "shipments": int(by_month[m].shipments) if m in by_month else 0,
        }
        for m in months
    ]
    this_month = monthly[-1]
    last_month = next(x for x in monthly if x["month"] == prev_month)

    plant_ship_q = _scoped_shipments(
        select(
            Shipment.plant_code,
            func.coalesce(func.sum(Shipment.total_pieces), 0).label("pieces"),
            func.coalesce(func.sum(Shipment.total_boxes), 0).label("cartons"),
        )
        .where(dispatched)
        .group_by(Shipment.plant_code),
        scope,
    )
    plants: dict[str, dict[str, Any]] = {
        key: {
            "plant_key": key,
            "plant_code": p["code"],
            "name": p["name"],
            "open_orders": 0,
            "dispatched_pieces": 0,
            "dispatched_cartons": 0,
            "has_orders": False,
        }
        for key, p in PLANTS.items()
    }
    plants[OTHER] = {
        "plant_key": OTHER,
        "plant_code": OTHER,
        "name": "Other",
        "open_orders": 0,
        "dispatched_pieces": 0,
        "dispatched_cartons": 0,
        "has_orders": False,
    }
    for r in (await db.execute(plant_ship_q)).all():
        p = plants[plant_group_for(r.plant_code)]
        p["dispatched_pieces"] += int(r.pieces)
        p["dispatched_cartons"] += int(r.cartons)

    # ── POs by plant (grouped by the destination fields the resolver uses) ─
    ex = PurchaseOrder.extra_data
    addr = ex.op("->>", return_type=String)(literal_column("'delivery_address'"))
    stored_group = ex.op("->>", return_type=String)(literal_column("'plant_group'"))
    plant_po_q = apply_supplier_scope(
        select(
            addr.label("addr"),
            PurchaseOrder.destination,
            PurchaseOrder.client_code,
            stored_group.label("stored_group"),
            func.count().filter(S != "CANCELLED").label("ever"),
            func.count().filter(is_open).label("open"),
        )
        .select_from(PurchaseOrder)
        .group_by(addr, PurchaseOrder.destination, PurchaseOrder.client_code, stored_group),
        scope.po_scope,
    )
    for r in (await db.execute(plant_po_q)).all():
        p = plants[plant_group_for(r.addr or r.destination or r.client_code, r.client_code, stored_group=r.stored_group)]
        p["open_orders"] += int(r.open)
        if r.ever:
            p["has_orders"] = True

    plant_list = [p for k, p in plants.items() if k != OTHER]
    other = plants[OTHER]
    if other["open_orders"] or other["dispatched_pieces"]:
        other["has_orders"] = True
        plant_list.append(other)
    plant_list.sort(key=lambda p: (-p["open_orders"], -p["dispatched_pieces"]))

    # ── Upcoming deliveries (open POs, same ordering as before) ──────────
    dated_q = apply_supplier_scope(
        select(PurchaseOrder.id, PurchaseOrder.delivery_date).where(is_open, dd.is_not(None)),
        scope.po_scope,
    )
    dated = [(r.id, (r.delivery_date - today).days) for r in (await db.execute(dated_q)).all()]
    dated.sort(key=lambda x: _days_priority(x[1]))
    top_ids = [pid for pid, _ in dated[:UPCOMING_LIMIT]]
    upcoming: list[dict[str, Any]] = []
    if top_ids:
        pos = {po.id: po for po in (await db.execute(select(PurchaseOrder).where(PurchaseOrder.id.in_(top_ids)))).scalars()}
        shipped_map: dict[str, float] = {}
        try:
            _, _, shipped_map = await PORepository(db).list_orders(
                supplier_id=scope.po_scope,
                po_numbers=",".join(p.po_number for p in pos.values() if p.po_number),
                per_page=UPCOMING_LIMIT,
            )
        except Exception:  # shipped quantities are a nice-to-have on this panel
            shipped_map = {}
        for pid, days in dated[:UPCOMING_LIMIT]:
            po = pos.get(pid)
            if po is None:
                continue
            items = (po.extra_data or {}).get("items") if po.extra_data else None
            first = items[0] if isinstance(items, list) and items else {}
            ordered = float(po.quantity or 0)
            if isinstance(items, list):
                items_sum = sum(float(it.get("quantity", 0) or 0) for it in items)
                if items_sum > 0:
                    ordered = items_sum
            remaining = max(0.0, ordered - float(shipped_map.get(po.po_number or "", 0.0)))
            group = plant_group_for(
                (po.extra_data or {}).get("delivery_address") or po.destination or po.client_code,
                po.client_code,
                stored_group=(po.extra_data or {}).get("plant_group"),
            )
            upcoming.append(
                {
                    "po_id": str(po.id),
                    "po_number": po.po_number,
                    "plant_key": group,
                    "plant_code": PLANTS[group]["code"] if group in PLANTS else None,
                    "delivery_date": po.delivery_date.isoformat() if po.delivery_date else None,
                    "days_left": days,
                    "status": po.status,
                    "item_code": first.get("item_code") or po.style_number,
                    "description": po.description or first.get("description"),
                    "quantity": ordered,
                    "remaining_quantity": remaining,
                    "uom": first.get("uom") or "pcs",
                }
            )

    # ── Recent dispatched shipments ──────────────────────────────────────
    recent_q = _scoped_shipments(
        select(
            Shipment.id,
            Shipment.shipment_number,
            Shipment.status,
            Shipment.plant_code,
            Shipment.total_boxes,
            Shipment.total_pieces,
            ship_day.label("day"),
        )
        .where(dispatched)
        .order_by(Shipment.created_at.desc())
        .limit(RECENT_SHIPMENTS_LIMIT),
        scope,
    )
    recent_shipments = []
    for r in (await db.execute(recent_q)).all():
        group = plant_group_for(r.plant_code)
        recent_shipments.append(
            {
                "id": str(r.id),
                "shipment_number": r.shipment_number,
                "status": r.status,
                "plant_key": group,
                "plant_code": PLANTS[group]["code"] if group in PLANTS else (r.plant_code or None),
                "cartons": int(r.total_boxes or 0),
                "pieces": int(r.total_pieces or 0),
                "date": r.day.isoformat() if r.day else None,
            }
        )

    result: dict[str, Any] = {
        "today": today.isoformat(),
        "kpis": {
            "open_orders": open_orders,
            "partially_shipped": row.partially_shipped,
            "overdue_orders": row.overdue,
            "due_3_days": row.due_3,
            "due_7_days": row.due_7,
            "dispatched_this_month": {
                "pieces": this_month["pieces"],
                "cartons": this_month["cartons"],
                "shipments": this_month["shipments"],
            },
            "dispatched_last_month_pieces": last_month["pieces"],
        },
        "status_breakdown": status_breakdown,
        "monthly": monthly,
        "deadlines": deadlines,
        "plants": plant_list,
        "upcoming": upcoming,
        "recent_shipments": recent_shipments,
    }

    # ── Admin only: real per-supplier totals (top suppliers) ─────────────
    if scope.is_admin:
        ship_sub = (
            select(
                Shipment.supplier_id.label("sid"),
                func.count().label("shipments"),
                func.coalesce(func.sum(Shipment.total_pieces), 0).label("pieces"),
                func.coalesce(func.sum(Shipment.total_boxes), 0).label("cartons"),
            )
            .where(dispatched)
            .group_by(Shipment.supplier_id)
            .subquery()
        )
        po_sub = (
            select(PurchaseOrder.supplier_id.label("sid"), func.count().label("open_orders"))
            .where(is_open)
            .group_by(PurchaseOrder.supplier_id)
            .subquery()
        )
        pieces_col = func.coalesce(ship_sub.c.pieces, 0)
        open_col = func.coalesce(po_sub.c.open_orders, 0)
        sup_q = (
            select(
                Supplier.id,
                Supplier.name,
                Supplier.supplier_code,
                func.coalesce(ship_sub.c.shipments, 0).label("shipments"),
                pieces_col.label("pieces"),
                func.coalesce(ship_sub.c.cartons, 0).label("cartons"),
                open_col.label("open_orders"),
            )
            .outerjoin(ship_sub, ship_sub.c.sid == Supplier.id)
            .outerjoin(po_sub, po_sub.c.sid == Supplier.id)
            .where(Supplier.is_deleted.is_(False), (pieces_col > 0) | (open_col > 0))
            .order_by(pieces_col.desc(), open_col.desc(), Supplier.name)
            .limit(TOP_SUPPLIERS_LIMIT)
        )
        if scope.shipment_supplier_ids is not None:
            sup_q = sup_q.where(Supplier.id.in_(scope.shipment_supplier_ids or [uuid.uuid4()]))
        result["suppliers"] = [
            {
                "supplier_id": str(r.id),
                "name": r.name,
                "supplier_code": r.supplier_code,
                "shipments": int(r.shipments),
                "pieces": int(r.pieces),
                "cartons": int(r.cartons),
                "open_orders": int(r.open_orders),
            }
            for r in (await db.execute(sup_q)).all()
        ]

    return result


__all__ = [
    "COLOMBO_TZ",
    "DISPATCHED_SHIPMENT_STATUSES",
    "OPEN_STATUSES",
    "OTHER",
    "PLANTS",
    "Scope",
    "build_scope",
    "colombo_today",
    "get_overview",
    "plant_group_for",
]
